import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { approverRoles, getUserRoleNamesForWorkflowRole } from '@/lib/auth-constants';
import { findPossibleTransitions } from '@/lib/workflow';

/**
 * GET /api/requests/[id] - รายละเอียดคำร้องเดียว
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const userId = (session.user as { id?: string }).id;
  const roleName = (session.user as { roleName?: string }).roleName;

  try {
    const request = await prisma.iTRequestF07.findUnique({
      where: { id },
      include: {
        department: true,
        category: true,
        location: true,
        currentStatus: { select: { id: true, code: true, displayName: true, colorCode: true } },
        requester: { select: { id: true, fullName: true, username: true, email: true, position: true } },
        correctionTypes: { select: { correctionTypeId: true } },
      },
    });

    if (!request) return NextResponse.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });

    // Admin และ role ที่เป็นผู้อนุมัติ (Head of Department, IT, Manager ฯลฯ) ดูรายละเอียดคำร้องใดก็ได้ เพื่อเข้าไปอนุมัติ/ปฏิเสธ
    // เฉพาะ Requester/User ที่ดูได้เฉพาะคำร้องของตัวเอง
    const canViewAnyRequest = roleName === 'Admin' || (roleName && approverRoles.includes(roleName));
    if (!canViewAnyRequest && userId && request.requesterId !== Number(userId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const historyLogs = await prisma.auditLog.findMany({
      where: { requestId: id, action: { in: ['APPROVE', 'REJECT', 'IT_PROCESS', 'CONFIRM_COMPLETE'] } },
      orderBy: { timestamp: 'asc' },
      include: { user: { select: { fullName: true, role: { select: { roleName: true } } } } },
    });
    const actionTypeLabel: Record<string, string> = {
      APPROVE: 'อนุมัติ',
      REJECT: 'ส่งกลับ/ปฏิเสธ',
      IT_PROCESS: 'ดำเนินการเสร็จสิ้น (IT)',
      CONFIRM_COMPLETE: 'ยืนยันปิดงาน',
    };
    const history = historyLogs.map((log) => ({
      FullName: log.user?.fullName ?? '—',
      RoleName: log.user?.role?.roleName ?? '—',
      ActionType: actionTypeLabel[log.action] ?? log.action,
      Comment: log.detail ?? null,
      ApprovalTimestamp: log.timestamp,
    }));
    const lastITProcess = [...historyLogs].reverse().find((l) => l.action === 'IT_PROCESS');
    const resolvedBy = lastITProcess?.user?.fullName ?? null;
    const resolvedAt = lastITProcess?.timestamp ?? null;
    // ปัญหาอุปสรรค (ถ้ามี) จาก comment ของ IT_PROCESS — detail เก็บเป็น "... → StatusName: comment"
    const itObstacles =
      lastITProcess?.detail != null
        ? (() => {
          const afterArrow = lastITProcess.detail.split(' → ').pop() ?? '';
          const idx = afterArrow.indexOf(': ');
          return idx >= 0 ? afterArrow.slice(idx + 2).trim() : null;
        })()
        : null;
    // ผู้อนุมัติในส่วนเทคโนโลยีสารสนเทศ = role IT Reviewer (It viewer)
    const IT_VIEWER_ROLES = ['IT Reviewer', 'It viewer'];
    const lastITViewerLog = [...historyLogs].reverse().find((l) =>
      IT_VIEWER_ROLES.includes(l.user?.role?.roleName ?? '')
    );
    const approvedByITViewer = lastITViewerLog?.user?.fullName ?? null;

    const currentStatusId = request.currentStatusId ?? 1;
    const currentStep = (request as { currentApprovalStep?: number }).currentApprovalStep ?? 1;
    const correctionTypeIds = (request as { correctionTypes?: { correctionTypeId: number }[] }).correctionTypes?.map((r) => r.correctionTypeId) ?? [];
    let transitions = await findPossibleTransitions({
      categoryId: request.categoryId,
      currentStatusId,
      correctionTypeIds: correctionTypeIds.length ? correctionTypeIds : undefined,
    });

    // ✅ Filter transitions: Remove if user already APPROVED this step (Parallel Check)
    if (userId) {
      const userHistory = await prisma.approvalHistory.findMany({
        where: {
          requestId: id,
          approverId: Number(userId),
          actionType: { in: ['APPROVE', 'APPROVED', 'Approve', 'IT_PROCESS', 'CONFIRM_COMPLETE'] }
        },
        select: { approvalLevel: true }
      });
      const approvedSteps = new Set(userHistory.map(h => Number(h.approvalLevel)));

      transitions = transitions.filter(t => {
        // Always allow REJECT? Or maybe not if already approved? 
        // Usually we hide everything if done.
        if (approvedSteps.has(t.stepSequence) && t.action.actionName !== 'REJECT') {
          return false;
        }
        return true;
      });
    }

    let possibleActions = getPossibleActionsFromTransitions(transitions, roleName ?? undefined);
    if (possibleActions.length === 0 && request.status === 'PENDING') {
      possibleActions = await getPossibleActionsFromStep(currentStep, request.categoryId, roleName ?? undefined);
    }

    return NextResponse.json({
      request: {
        id: request.id,
        RequestID: request.id,
        workOrderNo: request.workOrderNo,
        RequestNumber: request.workOrderNo,
        thaiName: request.thaiName,
        phone: request.phone,
        problemDetail: request.problemDetail,
        systemType: request.systemType,
        isMoneyRelated: request.isMoneyRelated,
        status: request.status,
        currentStatusId: request.currentStatusId,
        currentStatus: request.currentStatus,
        currentApprovalStep: (request as { currentApprovalStep?: number }).currentApprovalStep ?? 1,
        attachmentPath: request.attachmentPath,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        department: request.department,
        category: request.category,
        location: request.location,
        requester: request.requester,
        requesterId: request.requesterId,
      },
      history,
      possibleActions,
      resolvedBy,
      resolvedAt: resolvedAt ? resolvedAt.toISOString() : null,
      approvedByITViewer,
      itObstacles: itObstacles || null,
    });
  } catch (e) {
    console.error('GET /api/requests/[id]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** PUT /api/requests/[id] - แก้ไขคำร้อง (เฉพาะผู้ขอ เมื่อสถานะ PENDING) */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const existing = await prisma.iTRequestF07.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'ไม่พบคำร้อง' }, { status: 404 });
    if (existing.requesterId !== Number(userId)) {
      return NextResponse.json({ message: 'แก้ไขได้เฉพาะคำร้องของตัวเอง' }, { status: 403 });
    }
    if (!['PENDING', 'REVISION'].includes(existing.status ?? '')) {
      return NextResponse.json({ message: 'แก้ไขได้เฉพาะคำร้องที่รอดำเนินการหรือถูกส่งกลับแก้ไข' }, { status: 400 });
    }

    // Handle both FormData (with files) and JSON
    const contentType = request.headers.get('content-type') || '';
    let problemDetail: string | undefined;
    let existingFiles: string[] = [];
    let filesToDelete: string[] = [];
    let newFiles: File[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      problemDetail = formData.get('problemDetail')?.toString().trim();

      // Parse existing files to keep
      try {
        existingFiles = JSON.parse(formData.get('existingFiles')?.toString() || '[]');
      } catch {
        existingFiles = [];
      }

      // Parse files to delete
      try {
        filesToDelete = JSON.parse(formData.get('filesToDelete')?.toString() || '[]');
      } catch {
        filesToDelete = [];
      }

      // Get new file uploads
      const attachments = formData.getAll('attachments');
      for (const attachment of attachments) {
        if (attachment instanceof File && attachment.size > 0 && attachment.name !== 'undefined') {
          newFiles.push(attachment);
        }
      }
    } else {
      const body = await request.json();
      problemDetail = body.problemDetail != null ? String(body.problemDetail).trim() : undefined;
    }

    // Process file uploads
    const { saveFile, deleteFile } = await import('@/lib/storage');

    // Delete removed files
    for (const filePath of filesToDelete) {
      await deleteFile(filePath);
    }

    // Upload new files
    const newFilePaths: string[] = [];
    for (const file of newFiles) {
      try {
        const path = await saveFile(file);
        newFilePaths.push(path);
      } catch (e) {
        console.error('File upload failed:', e);
      }
    }

    // Combine existing (kept) files with new files
    const allAttachments = [...existingFiles, ...newFilePaths];
    const attachmentPath = allAttachments.length > 0 ? JSON.stringify(allAttachments) : null;

    const data: { problemDetail?: string; attachmentPath?: string | null; updatedAt: Date; status?: string; currentStatusId?: number; approvalToken?: string } = {
      updatedAt: new Date(),
      attachmentPath,
    };
    if (problemDetail !== undefined) data.problemDetail = problemDetail;

    // If the request is in REVISION status, resubmit it back to PENDING
    if (existing.status === 'REVISION') {
      const pendingStatus = await prisma.status.findUnique({ where: { code: 'PENDING' } });
      if (pendingStatus) {
        data.status = 'PENDING';
        data.currentStatusId = pendingStatus.id;
        data.approvalToken = (await import('crypto')).default.randomUUID();
      }
    }

    const updated = await prisma.iTRequestF07.update({
      where: { id },
      data,
    });

    // If resubmitted (was REVISION → now PENDING), create audit log and notify
    if (existing.status === 'REVISION') {
      // ✅ RESET APPROVAL HISTORY: Clear old approvals so users can approve again
      await prisma.approvalHistory.deleteMany({ where: { requestId: id } });

      await prisma.auditLog.create({
        data: {
          action: 'RESUBMIT',
          userId: Number(userId),
          detail: `Request #${existing.workOrderNo} แก้ไขและส่งกลับเข้าระบบใหม่`,
          requestId: id,
        },
      });

      // Notify next approvers (Head of Department)
      try {
        const { getNextApproversForStatus } = await import('@/lib/workflow');
        const { createNotification } = await import('@/lib/notification');
        const pendingStatus = await prisma.status.findUnique({ where: { code: 'PENDING' } });
        if (pendingStatus) {
          const nextApprovers = await getNextApproversForStatus(
            existing.categoryId,
            pendingStatus.id,
            existing.departmentId ?? undefined,
            null
          );
          for (const approver of nextApprovers) {
            if (approver.id) {
              await createNotification(approver.id, `มีใบงานแก้ไขแล้วรอพิจารณาใหม่: ${existing.workOrderNo}`, id);
            }
          }
        }
      } catch (err) {
        console.error('Notify approvers after resubmit failed:', err);
      }

      return NextResponse.json({ message: 'แก้ไขและส่งกลับเข้าระบบเรียบร้อย เริ่มพิจารณาใหม่', request: updated });
    }

    return NextResponse.json({ message: 'อัปเดตคำร้องสำเร็จ', request: updated });
  } catch (e) {
    console.error('PUT /api/requests/[id]', e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}


/** สร้าง possibleActions จาก WorkflowTransitions ตาม role ของ user (Admin ไม่มีขั้นตอนอนุมัติ) */
function getPossibleActionsFromTransitions(
  transitions: Awaited<ReturnType<typeof findPossibleTransitions>>,
  roleName: string | undefined
): { ActionName: string; ActionDisplayName: string }[] {
  if (!transitions.length) return [];
  if (roleName === 'Admin') return [];
  if (!roleName) return [];
  const allowed = transitions.filter((t) =>
    getUserRoleNamesForWorkflowRole(t.requiredRole.roleName).includes(roleName)
  );
  const seen = new Set<string>();
  return allowed
    .filter((t) => !seen.has(t.action.actionName) && (seen.add(t.action.actionName), true))
    .map((t) => ({ ActionName: t.action.actionName, ActionDisplayName: t.action.displayName }));
}

/** Fallback: possibleActions จาก WorkflowStep (เมื่อหมวดไม่มี WorkflowTransitions) — Admin ไม่มีขั้นตอนอนุมัติ */
async function getPossibleActionsFromStep(
  currentStep: number,
  categoryId: number,
  roleName: string | undefined
): Promise<{ ActionName: string; ActionDisplayName: string }[]> {
  const base = [
    { ActionName: 'APPROVE', ActionDisplayName: 'อนุมัติ' },
    { ActionName: 'REJECT', ActionDisplayName: 'ส่งกลับ/ปฏิเสธ' },
  ];
  if (roleName === 'Admin') return [];
  if (!roleName) return [];
  const step = await prisma.workflowStep.findFirst({
    where: { categoryId, stepSequence: currentStep },
    select: { approverRoleName: true },
  });
  if (step?.approverRoleName) {
    const allowedUserRoles = getUserRoleNamesForWorkflowRole(step.approverRoleName);
    if (roleName && allowedUserRoles.includes(roleName)) return base;
  }
  if (!step && ['Head of Department', 'Manager', 'หน.แผนก', 'หัวหน้าแผนก', 'User'].includes(roleName)) return base;
  return [];
}

/** DELETE /api/requests/[id] - ลบคำร้อง (Admin เท่านั้น ลบได้ทุกสถานะ) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const roleName = (session.user as { roleName?: string }).roleName;

  if (roleName !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden: Only Admin can delete' }, { status: 403 });
  }

  try {
    await prisma.auditLog.create({
      data: {
        action: 'DELETE_REQUEST',
        userId: (session.user as any).id ? Number((session.user as any).id) : null,
        detail: `Deleted Request ID ${id} by Admin`,
        requestId: null,
      },
    });

    await prisma.iTRequestF07.delete({ where: { id } });

    return NextResponse.json({ message: 'ลบคำร้องเรียบร้อย' });
  } catch (e) {
    console.error('DELETE /api/requests/[id]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
