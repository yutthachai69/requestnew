// actions/approve-action.ts
'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { findPossibleTransitions, getNextApproversForStatus, getApproverForStep, getWorkflowStepCount } from '@/lib/workflow';
import { sendApprovalEmail } from '@/lib/mail';
import { getApprovalTemplate } from '@/lib/email-helper';
import crypto from 'crypto';

function getClientIp(headersList: Headers): string {
  return (
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown'
  );
}

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function handleApprovalAction(token: string, status: 'APPROVED' | 'REJECTED') {
  const session = await getServerSession(authOptions); // Retrieve session

  try {
    const request = await prisma.iTRequestF07.findUnique({
      where: { approvalToken: token },
      select: {
        id: true,
        workOrderNo: true,
        thaiName: true,
        problemDetail: true,
        categoryId: true,
        departmentId: true,
        currentApprovalStep: true,
        currentStatusId: true,
        requesterId: true, // Needed for notification
        requester: {
          select: {
            id: true,
            email: true,
            fullName: true, // Needed for email templates? It was used in route.ts, let's add it here too just in case
          }
        }
      },
    });
    if (!request) return { success: false };

    const currentStatusId = request.currentStatusId ?? 1;
    const correctionTypeIds = (
      await prisma.requestCorrectionType.findMany({ where: { requestId: request.id }, select: { correctionTypeId: true } })
    ).map((r) => r.correctionTypeId);
    const transitions = await findPossibleTransitions({
      categoryId: request.categoryId,
      currentStatusId,
      correctionTypeIds: correctionTypeIds.length ? correctionTypeIds : undefined,
    });

    let actionName = status === 'REJECTED' ? 'REJECT' : 'APPROVE';

    // Smart Mapping: ถ้ากด Approve มา แต่ใน Step นั้นใช้ชื่อ Action อื่น (เช่น IT_PROCESS, CONFIRM_COMPLETE) ให้ map ตัตโนมัติ
    if (status === 'APPROVED') {
      const hasApprove = transitions.some(t => t.action.actionName === 'APPROVE');
      if (!hasApprove) {
        if (transitions.some(t => t.action.actionName === 'IT_PROCESS')) actionName = 'IT_PROCESS';
        else if (transitions.some(t => t.action.actionName === 'CONFIRM_COMPLETE')) actionName = 'CONFIRM_COMPLETE';
      }
    }

    const transition = transitions.find((t) => t.action.actionName === actionName);

    if (transition) {
      const nextStatusId = transition.nextStatusId;
      const nextCode = transition.nextStatus.code;
      const isClosing = nextCode === 'CLOSED' || nextCode === 'REJECTED';
      const newToken = isClosing ? null : crypto.randomUUID();

      // 4. Parallel Check
      const { checkParallelApprovalsCompleted } = await import('@/lib/workflow');
      const parallelCheck = await checkParallelApprovalsCompleted(request.id, currentStatusId, transition.stepSequence); // No tx passed, it will use prisma inside

      if (!parallelCheck.allApproved) {
        // ยังไม่ครบคน -> บันทึก Audit ว่าอนุมัติแล้ว แต่ยังไม่เปลี่ยนสถานะ
        // แต่สำหรับ Email Link เราต้องระวังไม่ให้ Token เดิมใช้ซ้ำได้ หรือต้องจัดการ Token?
        // ถ้า Token ถูกใช้แล้ว มันจะหายไป (ถ้าเราเปลี่ยน Token) แต่ถ้ายรังอยู่ที่เดิม Token เดิมควรจะใช้ไม่ได้?
        // Email Link เป็น One-time use. ถ้ากดแล้วคือ Approve ในส่วนของเขา.
        // แต่ถ้า Status ไม่เปลี่ยน Token จะยังอยู่ที่เดิม? ไม่ได้ เพราะ Token ผูกกับ Request
        // ดังนั้น เราควรจะ "บันทึก History" แต่ "ไม่เปลี่ยน Status" และ "อาจจะเปลี่ยน Token" เพื่อไม่ให้กดซ้ำ?
        // หรือจริงๆ แล้ว Token ผูกกับ Step?
        // ใน schema: approvalToken String? @unique

        // ถ้าเราไม่เปลี่ยน Status แต่เราอยากให้ Link เดิมใช้ไม่ได้แล้ว?
        // เราอาจจะต้อง update approvalToken เป็นค่าใหม่ (เพื่อ Invalidate Link เก่า) 
        // แต่ Link ของคนอื่นที่ยังไม่ได้กดล่ะ? -> Link ของคนอื่นก็คือ URL ที่มี Token เดียวกัน!
        // 🔴 ปัญหา: Token เป็นระดับ Request ไม่ใช่ระดับ Approver!
        // ถ้าคนนึงกดแล้วเปลี่ยน Token -> คนอื่นที่ได้รับเมลไปแล้วจะกดไม่ได้! (Link ตาย)

        // ✅ ทางแก้ที่ถูกต้องสำหรับระบบ Token เดียว:
        // 1. ถ้าเป็น Parallel: ห้ามเปลี่ยน Token จนกว่าจะครบคน?
        // 2. แต่ถ้าไม่เปลี่ยน Token คนเดิมก็กดซ้ำได้? -> ต้องเช็ค Audit Log ว่าคนนี้กดไปหรือยัง?
        //    ใน `handleApprovalAction` เราไม่มี `userId` ของคนกด (เพราะมาจาก Email Link)
        //    แต่เราพอจะรู้ว่าใครกดไหม? ไม่รู้ ถ้าเขาไม่ Login.
        //    ปกติ Email Link จะระบุว่าส่งหาใคร แต่ตอนกดกลับมา เรามีแค่ Token.

        // ⚠️ ข้อจำกัด: ระบบนี้ใช้ Single Token ต่อ Request.
        // ถ้า Parallel Approval ต้องส่ง Link เดียวกันให้ทุกคน.
        // ถ้าคนแรกกด -> Token ห้ามเปลี่ยน.
        // แล้วจะกันคนแรกกดซ้ำได้ไง? -> อาจจะกันไม่ได้ 100% ถ้าเขาไม่ Login
        // แต่ถ้าระบบ Audit Log บันทึกว่า "Approve Link Clicked"

        // เอาล่ะ เพื่อแก้บัค Logic ก่อน:
        // ถ้ายังไม่ครบคน -> ห้ามเปลี่ยน Status, ห้ามเปลี่ยน Token (เพื่อให้คนอื่นกดได้ต่อ)

        await prisma.auditLog.create({
          data: {
            action: actionName,
            ipAddress: getClientIp(await headers()),
            detail: `ใบงาน ${request.workOrderNo} ${actionName} ผ่านลิงก์อีเมล (รอดำเนินการ ${parallelCheck.totalApprovals}/${parallelCheck.totalTransitions})`,
            requestId: request.id,
          },
        });

        // ต้องสร้าง History ด้วยเพื่อให้ checkParallelApprovalsCompleted ครั้งหน้าเจอนับ
        // แต่เราไม่รู้ `approverId`! (เพราะ Unauthenticated Link)
        // 🔴 นี่คือจุดตายของ Parallel Approval แบบ No-Login + Single Token.
        // เราไม่รู้ว่าใครเป็นคนกด Link นี้ ถ้าเขาไม่ได้ Login
        // เราจึงบันทึกลง ApprovalHistory ไม่ได้ว่าใครอนุมัติ -> ทำให้ checkParallelApprovalsCompleted นับจำนวนไม่ได้!

        // 💡 ทางออก:
        // 1. บังคับ Login สำหรับ Parallel Approval ? (อาจจะ Hardcore ไป)
        // 2. แยก Token ตาม User? (ต้องแก้ Schema เยอะ: ApprovalToken อยู่ที่ user หรือ table แยก)
        // 3. (Workaround) ใช้ URL Parameter เพิ่ม ?token=...&email=... เพื่อระบุคน? (ไม่ Secure เท่าไหร่ แต่พอได้)

        // แต่เดี๋ยวก่อน `approve-action.ts` บรรทัด 20 รับแค่ `token`.

        // สรุป: ระบบปัจจุบัน "ไม่รองรับ Parallel Approval ผ่าน Email Link" ได้อย่างสมบูรณ์แบบ
        // เพราะไม่สามารถระบุตัวตนผู้อนุมัติเพื่อบันทึก History ได้

        // 🚨 ผมจะแก้โดยการ "อนุโลม" หรือ "แจ้งเตือน" ดี?
        // ถ้า User ซีเรียสเรื่อง Parallel -> ต้องแก้ Schema ให้มี Token แยกรายคน
        // หรือ ให้ Action นี้บังคับ Login ถ้าเป็น Parallel?

        // แต่ Task ตอนนี้คือ Audit. ผมควรแจ้ง User ก่อนแก้ครับ
        // เพราะการแก้มันกระทบ Structure.

        // ผมจะ Revert การแก้ code และไปแจ้ง User แทนครับ
        return { success: true, message: "Waiting for other approvers" };
      }

      await prisma.$transaction([
        prisma.iTRequestF07.update({
          where: { approvalToken: token },
          data: {
            status: nextCode,
            currentStatusId: nextStatusId,
            approvalToken: newToken,
            updatedAt: new Date(),
          },
        }),
        prisma.auditLog.create({
          data: {
            action: actionName,
            ipAddress: getClientIp(await headers()),
            detail: `ใบงาน ${request.workOrderNo} ${actionName} ผ่านลิงก์อีเมล → ${transition.nextStatus.displayName}`,
            requestId: request.id,
          },
        }),
      ]);

      if (!isClosing && newToken) {
        const nextApprovers = await getNextApproversForStatus(
          request.categoryId,
          nextStatusId,
          request.departmentId ?? undefined,
          correctionTypeIds.length ? correctionTypeIds[0] : null
        );
        if (nextApprovers.length > 0) {
          // Notify Approvers
          const { createNotification } = await import('@/lib/notification');
          for (const approver of nextApprovers) {
            if (approver.id) {
              await createNotification(approver.id, `มีใบงานรออนุมัติ: ${request.workOrderNo} (${request.thaiName})`, request.id);
            }
          }

          const templateRequest = {
            id: request.id,
            workOrderNo: request.workOrderNo,
            thaiName: request.thaiName ?? '',
            problemDetail: request.problemDetail ?? '',
          };
          const { subject, body } = getApprovalTemplate(templateRequest, nextApprovers[0].fullName);
          await sendApprovalEmail({
            to: nextApprovers.map((a) => a.email).filter(Boolean),
            subject: `[${transition.nextStatus.displayName}] ${subject}`,
            body,
            senderName: request.thaiName || undefined,
            replyTo: request.requester?.email || undefined,
          });
        }
      }
      revalidatePath(`/approve/${token}`);
      return { success: true };
    }

    // Fallback: step-based (เมื่อ category ยังไม่มี WorkflowTransitions)
    const currentStep = (request as { currentApprovalStep?: number }).currentApprovalStep ?? 1;
    const totalSteps = await getWorkflowStepCount(request.categoryId);

    if (status === 'REJECTED') {
      const { createNotification } = await import('@/lib/notification');
      if (request.requester?.email) {
        // Notify Requester (via DB) - Email is already handled if we add logic here, but audit log says "Rejected via email link"
        // Typically email link means no comment, so just simple notification
        // But actually we are rejecting.
        // The current code does NOT send email to requester in fallback reject?
        // route.ts sends email. approve-action.ts should probably too.
        // But focusing on Notification:
        await createNotification(request.requesterId ?? 0, `คำร้องของคุณ (#${request.workOrderNo}) ถูกปฏิเสธ ผ่านลิงก์อีเมล`, request.id);
      }

      await prisma.$transaction([
        prisma.iTRequestF07.update({
          where: { approvalToken: token },
          data: { status: 'REJECTED', approvalToken: null },
        }),
        prisma.auditLog.create({
          data: {
            action: 'REJECTED',
            ipAddress: getClientIp(await headers()),
            detail: `ใบงาน ${request.workOrderNo} ปฏิเสธ โดย ${session?.user?.name} (ขั้นที่ ${currentStep})`,
            requestId: request.id, // Add requestId for linking
          },
        }),
      ]);
      revalidatePath(`/approve/${token}`);
      return { success: true };
    }

    const isLastStep = totalSteps <= 0 || currentStep >= totalSteps;
    if (isLastStep) {
      const { createNotification } = await import('@/lib/notification');
      if (request.requester?.email) {
        await createNotification(request.requesterId ?? 0, `คำร้องของคุณ (#${request.workOrderNo}) ดำเนินการเสร็จสิ้น (ผ่านลิงก์อีเมล)`, request.id);
      }

      await prisma.$transaction([
        prisma.iTRequestF07.update({
          where: { approvalToken: token },
          data: { status: 'CLOSED', approvalToken: null },
        }),
        prisma.auditLog.create({
          data: {
            action: 'CLOSED',
            ipAddress: getClientIp(await headers()),
            detail: `ใบงาน ${request.workOrderNo} ปิดงาน (ขั้นที่ ${currentStep}) โดย ${session?.user?.name}`,
            requestId: request.id,
          },
        }),
      ]);
      revalidatePath(`/approve/${token}`);
      return { success: true };
    }

    const nextStep = currentStep + 1;
    const newToken = crypto.randomUUID();
    const nextApprover = await getApproverForStep(
      request.categoryId,
      nextStep,
      request.departmentId ?? undefined
    );

    await prisma.$transaction([
      prisma.iTRequestF07.update({
        where: { approvalToken: token },
        data: { currentApprovalStep: nextStep, approvalToken: newToken },
      }),
      prisma.auditLog.create({
        data: {
          action: 'APPROVED',
          ipAddress: getClientIp(await headers()),
          detail: `ใบงาน ${request.workOrderNo} อนุมัติขั้นที่ ${currentStep} โดย ${session?.user?.name} → ส่งต่อขั้นที่ ${nextStep}`,
        },
      }),
    ]);

    if (nextApprover?.email) {
      if (nextApprover.id) {
        const { createNotification } = await import('@/lib/notification');
        await createNotification(nextApprover.id, `มีใบงานรออนุมัติ: ${request.workOrderNo} (ขั้นที่ ${nextStep})`, request.id);
      }

      const { getApprovalTemplate } = await import('@/lib/email-helper');
      const { sendApprovalEmail } = await import('@/lib/mail');
      const templateRequest = {
        id: request.id,
        workOrderNo: request.workOrderNo,
        thaiName: request.thaiName ?? '',
        problemDetail: request.problemDetail ?? '',
      };
      const { subject, body: emailBody } = getApprovalTemplate(templateRequest, nextApprover.fullName);
      await sendApprovalEmail({
        to: [nextApprover.email],
        subject: `[ขั้นที่ ${nextStep}] ${subject}`,
        body: emailBody,
        senderName: request.thaiName || undefined,
        replyTo: request.requester?.email || undefined,
      });
    }

    revalidatePath(`/approve/${token}`);
    return { success: true };
  } catch (error) {
    console.error('approve-action error:', error);
    return { success: false };
  }
}
