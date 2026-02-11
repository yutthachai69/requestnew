import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUserRoleNamesForWorkflowRole } from '@/lib/auth-constants';
import { findPossibleTransitions, getNextApproversForStatus, getApproverForStep, getWorkflowStepCount, checkParallelApprovalsCompleted } from '@/lib/workflow';
import { generateRequestNumber } from '@/lib/document-number';
import { sendApprovalEmail } from '@/lib/mail';
import { getApprovalTemplate, getRevisionEmail, getCompletionEmail } from '@/lib/email-helper';
import crypto from 'crypto';

const ALLOWED_ACTIONS = ['APPROVE', 'REJECT', 'IT_PROCESS', 'CONFIRM_COMPLETE'] as const;

/**
 * POST /api/requests/[id]/action - ดำเนินการตาม WorkflowTransitions (State Machine)
 * body: { actionName: 'APPROVE' | 'REJECT' | 'IT_PROCESS' | 'CONFIRM_COMPLETE', comment?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const userId = (session.user as { id?: string }).id;
  const roleName = (session.user as { roleName?: string }).roleName;
  const userName = session.user.name ?? '';

  try {
    const body = await request.json();
    const actionName = String(body.actionName ?? '').toUpperCase();
    const comment = body.comment != null ? String(body.comment).trim() : '';

    if (!ALLOWED_ACTIONS.includes(actionName as (typeof ALLOWED_ACTIONS)[number])) {
      return NextResponse.json(
        { message: `actionName ต้องเป็นหนึ่งใน: ${ALLOWED_ACTIONS.join(', ')}` },
        { status: 400 }
      );
    }
    if (actionName === 'REJECT' && !comment) {
      return NextResponse.json({ message: 'กรุณาระบุเหตุผลในการปฏิเสธ' }, { status: 400 });
    }

    const req = await prisma.iTRequestF07.findUnique({
      where: { id },
      select: {
        id: true,
        workOrderNo: true,
        thaiName: true,
        problemDetail: true,
        categoryId: true,
        departmentId: true,
        status: true,
        currentStatusId: true,
        currentStatus: { select: { id: true, code: true } },
        requesterId: true,
        requester: { select: { id: true, email: true, fullName: true } },
        // category: true, // Not used as full object, only categoryId is used
      },
    });
    if (!req) return NextResponse.json({ message: 'ไม่พบคำร้อง' }, { status: 404 });

    const currentStatusId = req.currentStatusId ?? 1;
    const statusCode = req.currentStatus?.code ?? req.status ?? 'PENDING';
    if (statusCode === 'CLOSED' || statusCode === 'REJECTED') {
      return NextResponse.json({ message: 'คำร้องนี้ดำเนินการไปแล้ว' }, { status: 400 });
    }

    const correctionTypeIds =
      (await prisma.requestCorrectionType.findMany({ where: { requestId: id }, select: { correctionTypeId: true } })).map(
        (r) => r.correctionTypeId
      ) ?? [];
    let transitions = await findPossibleTransitions({
      categoryId: req.categoryId,
      currentStatusId,
      correctionTypeIds: correctionTypeIds.length ? correctionTypeIds : undefined,
    });
    // Debug: Log transition candidates
    console.log(`[DEBUG] Finding transitions for Category: ${req.categoryId}, Status: ${currentStatusId}, Type: ${correctionTypeIds}`);
    console.log(`[DEBUG] Transitions found: ${transitions.length}`);
    transitions.forEach(t => {
      console.log(`[DEBUG] Candidate: ${t.action.actionName} - ReqRole: ${t.requiredRole.roleName} - Next: ${t.nextStatus.code}`);
    });

    // เลือก transition ที่ตรง action และ user มีสิทธิ์ (รองรับหลาย role ต่อ action เช่น IT หรือ Admin ปิดงาน)
    const transition = transitions.find(
      (t) => {
        const allowedRoles = getUserRoleNamesForWorkflowRole(t.requiredRole.roleName);
        const hasRole = allowedRoles.includes(roleName ?? '');
        console.log(`[DEBUG] Check Role: User=${roleName} vs Required=${t.requiredRole.roleName} (Expanded: ${allowedRoles}) -> Match? ${hasRole}`);
        return t.action.actionName === actionName && hasRole;
      }
    );

    if (!transition) {
      // If we found transitions for this status but none matched the action/user, 
      // it means the action is invalid for this user in this state (State Machine enforcing).
      // We should NOT fallback to legacy, because legacy ignores the State Machine.
      if (transitions.length > 0) {
        console.log(`[DEBUG] Transitions exist (${transitions.length}) but no match for User=${roleName}, Action=${actionName}. Blocking legacy fallback.`);
        return NextResponse.json(
          { message: `คุณไม่มีสิทธิ์ดำเนินการ "${actionName}" ในสถานะนี้ (ตรวจสอบสิทธิ์หรือสถานะ)` },
          { status: 403 }
        );
      }

      console.log('[DEBUG] No transitions defined for this status. STRICT MODE: Blocking Legacy Fallback.');
      // const legacyResult = await performLegacyApproval(req, id, actionName, comment, userId, userName, roleName ?? undefined);
      // if (legacyResult) return legacyResult;

      return NextResponse.json(
        { message: `ไม่พบขั้นตอนถัดไปสำหรับสถานะนี้ (No Transition Found)` },
        { status: 400 }
      );
    }

    const nextStatusId = transition.nextStatusId;
    const nextStatus = transition.nextStatus;
    const nextCode = nextStatus.code;

    // Unified Transaction for Action
    const result = await prisma.$transaction(async (tx) => {
      // 1. Generate Request Number if missing (On first Action)
      let workOrderNo = req.workOrderNo;
      if (!workOrderNo && actionName !== 'REJECT') {
        workOrderNo = await generateRequestNumber(tx, req.categoryId);
        await tx.iTRequestF07.update({ where: { id }, data: { workOrderNo } });
      }

      const requestData = { requestId: id, requestNumber: workOrderNo ?? undefined };

      // 2. REJECT Logic
      if (actionName === 'REJECT') {
        await tx.iTRequestF07.update({
          where: { id },
          data: {
            status: 'REJECTED',
            currentStatusId: nextStatusId,
            approvalToken: null,
            updatedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            action: 'REJECT',
            userId: userId ? Number(userId) : null,
            detail: `Request #${workOrderNo} REJECT by ${userName}${comment ? `: ${comment}` : ''}`,
            requestId: id,
          },
        });
        if (userId) {
          await tx.approvalHistory.create({
            data: {
              requestId: id,
              approverId: Number(userId),
              approvalLevel: transition.stepSequence,
              actionType: 'Reject',
              comment: comment || null,
            },
          });
        }
        return { type: 'REJECT', nextStatusId, requestData };
      }

      // 3. APPROVE Logic (Log History first)
      if (userId) {
        await tx.approvalHistory.create({
          data: {
            requestId: id,
            approverId: Number(userId),
            approvalLevel: transition.stepSequence,
            actionType: actionName === 'APPROVE' ? 'Approve' : actionName,
            comment: comment || null,
          },
        });
      }
      // Note: Audit Log for APPROVE is created after we know if it moves forward or waits

      // 4. Parallel Check
      const parallelCheck = await checkParallelApprovalsCompleted(id, currentStatusId, transition.stepSequence, tx);
      console.log('Parallel Check:', parallelCheck);

      if (!parallelCheck.allApproved) {
        // ยังไม่ครบคน -> บันทึก Audit ว่าอนุมัติแล้ว แต่ยังไม่เปลี่ยนสถานะ
        await tx.auditLog.create({
          data: {
            action: actionName,
            userId: userId ? Number(userId) : null,
            detail: `Request #${workOrderNo} ${actionName} by ${userName} (Waiting ${parallelCheck.totalApprovals}/${parallelCheck.totalTransitions})${comment ? `: ${comment}` : ''}`,
            requestId: id,
          },
        });
        return { type: 'WAITING', count: parallelCheck.totalApprovals, total: parallelCheck.totalTransitions };
      }

      // 5. All Approved -> Move Next
      const isClosing = nextCode === 'CLOSED';
      const newToken = isClosing ? null : crypto.randomUUID();

      await tx.iTRequestF07.update({
        where: { id },
        data: {
          status: nextCode,
          currentStatusId: nextStatusId,
          approvalToken: newToken,
          updatedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          action: actionName,
          userId: userId ? Number(userId) : null,
          detail: `Request #${workOrderNo} ${actionName} by ${userName} → ${nextStatus.displayName}${comment ? `: ${comment}` : ''}`,
          requestId: id,
        },
      });

      return { type: 'APPROVED', isClosing, newToken, requestData };
    });

    // Post-Transaction: Response & Emails
    if (result.type === 'REJECT') {
      if (req.requester?.email) {
        try {
          const { createNotification } = await import('@/lib/notification');
          await createNotification(req.requesterId, `คำร้องของคุณ (#${req.workOrderNo}) ถูกปฏิเสธ/ส่งกลับแก้ไข`, req.id);
          const { subject, body } = getRevisionEmail(result.requestData!, { fullName: req.requester.fullName });
          await sendApprovalEmail({ to: [req.requester.email], subject, body });
        } catch (err) {
          console.error('ส่งเมลแจ้งผู้ยื่น (revision) ล้มเหลว:', err);
        }
      }
      return NextResponse.json({
        message: 'ปฏิเสธ/ส่งกลับเรียบร้อย',
        request: { id: req.id, status: 'REJECTED', currentStatusId: nextStatusId },
      });
    }

    if (result.type === 'WAITING') {
      return NextResponse.json({
        message: `บันทึกถารอนุมัติเรียบร้อย (รอผู้อื่น ${result.count}/${result.total})`,
        request: { id: req.id, status: statusCode, currentStatusId: currentStatusId },
      });
    }

    if (result.type === 'APPROVED') {
      if (result.isClosing) {
        if (req.requester?.email) {
          try {
            const { createNotification } = await import('@/lib/notification');
            await createNotification(req.requesterId, `คำร้องของคุณ (#${req.workOrderNo}) ดำเนินการเสร็จสิ้นแล้ว`, req.id);
            const { subject, body } = getCompletionEmail(result.requestData!, { fullName: req.requester.fullName });
            await sendApprovalEmail({ to: [req.requester.email], subject, body });
          } catch (err) {
            console.error('ส่งเมลแจ้งผู้ยื่น (completion) ล้มเหลว:', err);
          }
        }
        return NextResponse.json({
          message: 'อนุมัติและปิดงานเรียบร้อย',
          request: { id: req.id, status: 'CLOSED', currentStatusId: nextStatusId },
        });
      }

      // Notify Next Approvers
      const nextApprovers = await getNextApproversForStatus(
        req.categoryId,
        nextStatusId,
        req.departmentId ?? undefined,
        correctionTypeIds.length ? correctionTypeIds[0] : null // TODO: support multi-mapping for email?
      );

      if (nextApprovers.length > 0 && result.newToken) {
        const templateRequest = {
          id: req.id,
          workOrderNo: result.requestData!.requestNumber ?? null, // Use generated number
          thaiName: req.thaiName ?? '',
          problemDetail: req.problemDetail ?? '',
        };
        const emails = nextApprovers.map((a) => a.email).filter(Boolean);

        // Send Notifications to Approvers
        const { createNotification } = await import('@/lib/notification');
        for (const approver of nextApprovers) {
          if (approver.id) {
            await createNotification(approver.id, `มีใบงานรออนุมัติ: ${result.requestData!.requestNumber ?? req.workOrderNo} (${req.thaiName})`, req.id);
          }
        }

        if (emails.length > 0) {
          const { subject, body: emailBody } = getApprovalTemplate(templateRequest, nextApprovers[0].fullName);
          await sendApprovalEmail({
            to: emails,
            subject: `[${nextStatus.displayName}] ${subject}`,
            body: emailBody,
            senderName: req.thaiName || undefined,
            replyTo: req.requester?.email || undefined,
          });
        }
      }
      // Re-read: modifying workflow.ts is better to get IDs.
      // But for quick fix, I will verify if I can get IDs.
      // Let's just create generic notification logic first.

      return NextResponse.json({
        message: 'ดำเนินการสำเร็จ ส่งต่อขั้นถัดไปแล้ว',
        request: { id: req.id, status: nextCode, currentStatusId: nextStatusId },
      });
    }
  } catch (e) {
    console.error('POST /api/requests/[id]/action', e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

/** Fallback: อนุมัติแบบ step เดิม (เมื่อหมวดไม่มี WorkflowTransitions) */
async function performLegacyApproval(
  req: { id: number; workOrderNo: string | null; thaiName: string; problemDetail: string; categoryId: number; departmentId: number | null; currentApprovalStep?: number; requester?: { email: string; fullName: string } | null },
  id: number,
  actionName: string,
  comment: string,
  userId: string | undefined,
  userName: string,
  roleName: string | undefined
): Promise<NextResponse | null> {
  if (actionName !== 'APPROVE' && actionName !== 'REJECT') return null;

  const currentStep = (req as { currentApprovalStep?: number }).currentApprovalStep ?? 1;
  const stepConfig = await prisma.workflowStep.findFirst({
    where: { categoryId: req.categoryId, stepSequence: currentStep },
    select: { approverRoleName: true },
  });
  const canAct =
    (stepConfig?.approverRoleName && getUserRoleNamesForWorkflowRole(stepConfig.approverRoleName).includes(roleName ?? '')) ||
    (!stepConfig && ['Head of Department', 'Manager', 'หน.แผนก', 'หัวหน้าแผนก', 'User'].includes(roleName ?? ''));
  if (!canAct) return null;

  if (actionName === 'REJECT') {
    await prisma.$transaction([
      prisma.iTRequestF07.update({
        where: { id },
        data: { status: 'REJECTED', approvalToken: null, updatedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          action: 'REJECT',
          userId: userId ? Number(userId) : null,
          detail: `Request #${req.workOrderNo} REJECT by ${userName}${comment ? `: ${comment}` : ''}`,
          requestId: id,
        },
      }),
    ]);
    const withRequester = await prisma.iTRequestF07.findUnique({
      where: { id },
      include: { requester: true },
    });
    if (withRequester?.requester?.email) {
      try {
        const { getRevisionEmail } = await import('@/lib/email-helper');
        const { sendApprovalEmail } = await import('@/lib/mail');
        const { createNotification } = await import('@/lib/notification');

        // ✅ Notification for Requester (REJECT - Legacy)
        await createNotification(withRequester.requester.id, `คำร้องของคุณ (#${withRequester.workOrderNo}) ถูกปฏิเสธ/ส่งกลับแก้ไข`, id);

        const requestData = { requestId: id, requestNumber: withRequester.workOrderNo ?? undefined };
        const { subject, body } = getRevisionEmail(requestData, { fullName: withRequester.requester.fullName });
        await sendApprovalEmail({ to: [withRequester.requester.email], subject, body });
      } catch (err) {
        console.error('ส่งเมลแจ้งผู้ยื่น (revision) ล้มเหลว:', err);
      }
    }
    return NextResponse.json({
      message: 'ปฏิเสธ/ส่งกลับเรียบร้อย',
      request: { id: req.id, status: 'REJECTED' },
    });
  }

  const totalSteps = await getWorkflowStepCount(req.categoryId);
  const isLastStep = totalSteps <= 0 || currentStep >= totalSteps;

  if (isLastStep) {
    await prisma.$transaction([
      prisma.iTRequestF07.update({
        where: { id },
        data: { status: 'CLOSED', approvalToken: null, updatedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          action: 'APPROVE',
          userId: userId ? Number(userId) : null,
          detail: `Request #${req.workOrderNo} APPROVE by ${userName}${comment ? `: ${comment}` : ''}`,
          requestId: id,
        },
      }),
    ]);
    const withRequester = await prisma.iTRequestF07.findUnique({
      where: { id },
      include: { requester: true },
    });
    if (withRequester?.requester?.email) {
      try {
        const { getCompletionEmail } = await import('@/lib/email-helper');
        const { sendApprovalEmail } = await import('@/lib/mail');
        const { createNotification } = await import('@/lib/notification');

        // ✅ Notification for Requester (CLOSED - Legacy)
        await createNotification(withRequester.requester.id, `คำร้องของคุณ (#${withRequester.workOrderNo}) ดำเนินการเสร็จสิ้นแล้ว`, id);

        const requestData = { requestId: id, requestNumber: withRequester.workOrderNo ?? undefined };
        const { subject, body } = getCompletionEmail(requestData, { fullName: withRequester.requester.fullName });
        await sendApprovalEmail({ to: [withRequester.requester.email], subject, body });
      } catch (err) {
        console.error('ส่งเมลแจ้งผู้ยื่น (completion) ล้มเหลว:', err);
      }
    }
    return NextResponse.json({
      message: 'อนุมัติและปิดงานเรียบร้อย',
      request: { id: req.id, status: 'CLOSED' },
    });
  }

  const nextStep = currentStep + 1;
  const newToken = crypto.randomUUID();
  const nextApprover = await getApproverForStep(req.categoryId, nextStep, req.departmentId ?? undefined);

  await prisma.$transaction([
    prisma.iTRequestF07.update({
      where: { id },
      data: { currentApprovalStep: nextStep, approvalToken: newToken, updatedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        action: 'APPROVED',
        userId: userId ? Number(userId) : null,
        detail: `Request #${req.workOrderNo} APPROVE ขั้นที่ ${currentStep} by ${userName} → ส่งต่อขั้นที่ ${nextStep}${comment ? `: ${comment}` : ''}`,
        requestId: id,
      },
    }),
  ]);

  if (nextApprover?.email) {
    const { getApprovalTemplate } = await import('@/lib/email-helper');
    const { sendApprovalEmail } = await import('@/lib/mail');

    // ✅ Notification for Next Approver (Web UI - Legacy)
    if (nextApprover.id) {
      const { createNotification } = await import('@/lib/notification');
      await createNotification(nextApprover.id, `มีใบงานรออนุมัติ: ${req.workOrderNo} (ขั้นที่ ${nextStep})`, req.id);
    }

    const templateRequest = {
      id: req.id,
      workOrderNo: req.workOrderNo,
      thaiName: req.thaiName ?? '',
      problemDetail: req.problemDetail ?? '',
    };
    const { subject, body: emailBody } = getApprovalTemplate(templateRequest, nextApprover.fullName);
    await sendApprovalEmail({
      to: [nextApprover.email],
      subject: `[ขั้นที่ ${nextStep}] ${subject}`,
      body: emailBody,
      senderName: req.thaiName || undefined,
      replyTo: req.requester?.email || undefined,
    });
  }

  return NextResponse.json({
    message: 'อนุมัติสำเร็จ ส่งต่อขั้นถัดไปแล้ว',
    request: { id: req.id, status: 'PENDING', currentApprovalStep: nextStep },
  });
}
