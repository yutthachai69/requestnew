import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { approverRoles, getCanonicalRoleNamesForApprover } from '@/lib/auth-constants';
import { getNextApproversForStatus } from '@/lib/workflow';
import { createNotification } from '@/lib/notification';
import { sendApprovalEmail } from '@/lib/mail';
import { getApprovalTemplate, getRevisionEmail } from '@/lib/email-helper';

/** POST /api/requests/bulk-action - ดำเนินการกลุ่ม (อนุมัติ/ปฏิเสธหลายรายการ) */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = String(auth.id);
  const userName = auth.name ?? '';
  const roleName = auth.roleName;

  // ─── 🔒 Security Check 1: ต้องเป็น role ที่มีสิทธิ์อนุมัติ ───
  if (!roleName || !approverRoles.includes(roleName)) {
    return NextResponse.json(
      { message: 'คุณไม่มีสิทธิ์ดำเนินการแบบกลุ่ม (Role ไม่อนุญาต)' },
      { status: 403 }
    );
  }

  // ─── 🔒 Security Check 2: ตรวจ allowBulkActions จาก Role ใน DB ───
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const currentUser = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: {
      id: true,
      departmentId: true,
      role: { select: { allowBulkActions: true, roleName: true } },
    },
  });
  if (!currentUser?.role?.allowBulkActions) {
    return NextResponse.json(
      { message: 'Role ของคุณไม่ได้เปิดสิทธิ์ดำเนินการแบบกลุ่ม (Bulk Actions) กรุณาติดต่อ Admin' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const requestIds = Array.isArray(body.requestIds) ? body.requestIds.map(Number) : [];
    const actionName = String(body.actionName ?? '').toUpperCase();
    const comment = body.comment != null ? String(body.comment).trim() : '';

    if (requestIds.length === 0) {
      return NextResponse.json({ message: 'กรุณาเลือกอย่างน้อย 1 รายการ' }, { status: 400 });
    }
    if (actionName !== 'APPROVE' && actionName !== 'REJECT') {
      return NextResponse.json({ message: 'actionName ต้องเป็น APPROVE หรือ REJECT' }, { status: 400 });
    }
    if (actionName === 'REJECT' && !comment) {
      return NextResponse.json({ message: 'กรุณาระบุเหตุผลในการปฏิเสธ' }, { status: 400 });
    }

    // ─── 🔒 Security Check 3: ตรวจ WorkflowTransition สำหรับแต่ละคำร้อง ───
    const canonicalRoleNames = getCanonicalRoleNamesForApprover(roleName);
    const matchingRoles = await prisma.role.findMany({
      where: { roleName: { in: canonicalRoleNames } },
      select: { id: true },
    });
    const myRoleIds = matchingRoles.map((r) => r.id);

    const myTransitions = await prisma.workflowTransition.findMany({
      where: { requiredRoleId: { in: myRoleIds } },
      select: { categoryId: true, currentStatusId: true, filterByDepartment: true, nextStatusId: true },
    });

    const transitionMap = new Map<string, { filterByDepartment: boolean; nextStatusId: number }>();
    for (const t of myTransitions) {
      const key = `${t.categoryId}-${t.currentStatusId}`;
      if (!transitionMap.has(key)) {
        transitionMap.set(key, { filterByDepartment: t.filterByDepartment, nextStatusId: t.nextStatusId });
      }
    }

    const closedStatusIds = await prisma.status.findMany({
      where: { code: { in: ['CLOSED', 'REJECTED'] } },
      select: { id: true },
    }).then((r) => r.map((s) => s.id));

    const selectedRequests = await prisma.iTRequestF07.findMany({
      where: {
        id: { in: requestIds },
        currentStatusId: { notIn: closedStatusIds.length > 0 ? closedStatusIds : [0] },
      },
      select: {
        id: true,
        workOrderNo: true,
        thaiName: true,
        problemDetail: true,
        categoryId: true,
        currentStatusId: true,
        departmentId: true,
        requesterId: true,
        requester: { select: { email: true, fullName: true } },
        correctionTypes: { select: { correctionTypeId: true } },
      },
    });

    const rejectedStatus = await prisma.status.findFirst({ where: { code: 'REJECTED' }, select: { id: true } });
    const allowedRequests: {
      id: number;
      workOrderNo: string | null;
      thaiName: string | null;
      problemDetail: string | null;
      nextStatusId: number;
      categoryId: number;
      departmentId: number | null;
      requesterId: number | null;
      requesterEmail: string | null;
      requesterName: string | null;
      correctionTypeIds: number[];
    }[] = [];
    const skippedRequests: string[] = [];

    for (const req of selectedRequests) {
      const key = `${req.categoryId}-${req.currentStatusId}`;
      const transition = transitionMap.get(key);

      if (!transition) {
        skippedRequests.push(req.workOrderNo ?? `#${req.id}`);
        continue;
      }

      if (transition.filterByDepartment && req.departmentId !== currentUser.departmentId) {
        skippedRequests.push(req.workOrderNo ?? `#${req.id}`);
        continue;
      }

      const nextId = actionName === 'REJECT' ? rejectedStatus?.id : transition.nextStatusId;
      allowedRequests.push({
        id: req.id,
        workOrderNo: req.workOrderNo,
        thaiName: req.thaiName,
        problemDetail: req.problemDetail ?? null,
        nextStatusId: nextId ?? transition.nextStatusId,
        categoryId: req.categoryId,
        departmentId: req.departmentId,
        requesterId: req.requesterId,
        requesterEmail: req.requester?.email ?? null,
        requesterName: req.requester?.fullName ?? null,
        correctionTypeIds: req.correctionTypes.map((c) => c.correctionTypeId),
      });
    }

    if (allowedRequests.length === 0) {
      return NextResponse.json({
        message: `ไม่มีคำร้องที่คุณมีสิทธิ์ดำเนินการ${skippedRequests.length > 0 ? ` (ข้าม ${skippedRequests.length} รายการที่ไม่ตรงสิทธิ์/แผนก)` : ''}`,
      }, { status: 400 });
    }

    const nextStatusLookup = new Map<number, { code: string }>();
    const uniqueNextIds = [...new Set(allowedRequests.map((r) => r.nextStatusId))];
    const nextStatuses = await prisma.status.findMany({
      where: { id: { in: uniqueNextIds } },
      select: { id: true, code: true },
    });
    nextStatuses.forEach((s) => nextStatusLookup.set(s.id, { code: s.code }));

    await prisma.$transaction([
      ...allowedRequests.map((r) =>
        prisma.iTRequestF07.update({
          where: { id: r.id },
          data: {
            status: nextStatusLookup.get(r.nextStatusId)?.code ?? (actionName === 'REJECT' ? 'REJECTED' : 'APPROVED'),
            currentStatusId: r.nextStatusId,
            updatedAt: new Date(),
          },
        })
      ),
      ...allowedRequests.map((r) =>
        prisma.auditLog.create({
          data: {
            action: actionName,
            userId: Number(userId),
            detail: `Bulk: Request #${r.workOrderNo} ${actionName} by ${userName} (${roleName})${comment ? `: ${comment}` : ''}`,
            requestId: r.id,
          },
        })
      ),
    ]);

    // ─── ส่ง Notification + Email ด้วย Timeout Race (maximum 8 วินาที) ───
    // ถ้าส่งเสร็จก่อน  8 วินาที → รอแล้ว Return พร้อมกัน ✔เชื่อถือได้
    // ถ้าช้าเกิน 8 วินาที → Return ก่อน แล้ว Background ทำต่อ ✔ไม่บล็อค User
    const notifyAll = Promise.allSettled(
      allowedRequests.map(async (r) => {
        try {
          if (actionName === 'REJECT') {
            // แจ้ง Requester (In-App + Email)
            if (r.requesterId) {
              await createNotification(
                r.requesterId,
                `คำร้องของคุณ (#${r.workOrderNo}) ถูกส่งกลับแก้ไข กรุณาตรวจสอบและแก้ไขคำร้อง`,
                r.id
              );
            }
            if (r.requesterEmail) {
              const requestData = { requestId: r.id, requestNumber: r.workOrderNo ?? undefined };
              const { subject, body } = getRevisionEmail(requestData, { fullName: r.requesterName ?? '' });
              await sendApprovalEmail({ to: [r.requesterEmail], subject, body });
            }
          } else {
            // แจ้ง Next Approvers (In-App + Email)
            const nextApprovers = await getNextApproversForStatus(
              r.categoryId,
              r.nextStatusId,
              r.departmentId ?? undefined,
              null,
              r.correctionTypeIds
            );
            for (const approver of nextApprovers) {
              if (approver.id) {
                await createNotification(
                  approver.id,
                  `มีใบงานรออนุมัติ: ${r.workOrderNo} (${r.thaiName})`,
                  r.id
                );
              }
            }
            const emails = nextApprovers.map((a) => a.email).filter(Boolean);
            if (emails.length > 0) {
              const templateRequest = {
                id: r.id,
                workOrderNo: r.workOrderNo,
                thaiName: r.thaiName ?? '',
                problemDetail: r.problemDetail ?? '',
              };
              const { subject, body: emailBody } = getApprovalTemplate(templateRequest, nextApprovers[0].fullName);
              await sendApprovalEmail({
                to: emails,
                subject,
                body: emailBody,
                senderName: r.thaiName || undefined,
                replyTo: r.requesterEmail || undefined,
              });
            }
          }
        } catch (err) {
          console.error(`Bulk notification/email error for request #${r.workOrderNo}:`, err);
        }
      })
    );
    const timeoutFallback = new Promise<void>((resolve) => setTimeout(resolve, 8000));
    await Promise.race([notifyAll, timeoutFallback]);

    const resultMsg = `ดำเนินการ ${actionName === 'APPROVE' ? 'อนุมัติ' : 'ปฏิเสธ'} ${allowedRequests.length} รายการสำเร็จ`;
    const skippedMsg = skippedRequests.length > 0
      ? ` (ข้าม ${skippedRequests.length} รายการที่ไม่ตรงสิทธิ์: ${skippedRequests.join(', ')})`
      : '';

    return NextResponse.json({
      message: resultMsg + skippedMsg,
      count: allowedRequests.length,
      skipped: skippedRequests,
    });
  } catch (e) {
    console.error('POST /api/requests/bulk-action', e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
