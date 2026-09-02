import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { approverRoles, getUserRoleNamesForWorkflowRole } from '@/lib/auth-constants';
import { findPossibleTransitions } from '@/lib/workflow';
import { parseAttachments } from '@/lib/attachments';
import { handleApiError } from '@/lib/api-error';
import { FileValidationError, saveFile, deleteFile, validateFile } from '@/lib/storage';
import { TRANSACTION_OPTIONS } from '@/lib/transaction-retry';

/**
 * GET /api/requests/[id] - รายละเอียดคำร้องเดียว
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const userId = String(auth.id);
  const roleName = auth.roleName;

  try {
    const request = await prisma.iTRequestF07.findUnique({
      where: { id },
      include: {
        department: true,
        category: true,
        location: true,
        currentStatus: { select: { id: true, code: true, displayName: true, colorCode: true } },
        requester: { select: { id: true, fullName: true, username: true, email: true, position: true, signatureUrl: true } },
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
      include: {
        user: {
          select: {
            fullName: true,
            signatureUrl: true,
            role: { select: { roleName: true } }
          }
        }
      },
    });
    const actionTypeLabel: Record<string, string> = {
      APPROVE: 'อนุมัติ',
      REJECT: 'ส่งกลับ/ปฏิเสธ',
      IT_PROCESS: 'ดำเนินการเสร็จสิ้น (IT)',
      CONFIRM_COMPLETE: 'ยืนยันปิดงาน',
    };
    const history = (historyLogs as any[]).map((log) => ({
      FullName: log.user?.fullName ?? '—',
      RoleName: log.user?.role?.roleName ?? '—',
      ActionType: actionTypeLabel[log.action] ?? log.action,
      Comment: log.detail ?? null,
      ApprovalTimestamp: log.timestamp,
      SignatureUrl: log.user?.signatureUrl ?? null,
    }));
    const lastITProcess = [...(historyLogs as any[])].reverse().find((l) => l.action === 'IT_PROCESS');
    const resolvedBy = lastITProcess?.user?.fullName ?? null;
    const resolvedAt = lastITProcess?.timestamp ?? null;
    // ปัญหาอุปสรรค (ถ้ามี) จาก comment ของ IT_PROCESS — detail เก็บเป็น "... → StatusName: comment"
    const itObstacles =
      lastITProcess?.detail != null
        ? (() => {
          const afterArrow = (lastITProcess as any).detail.split(' → ').pop() ?? '';
          const idx = afterArrow.indexOf(': ');
          return idx >= 0 ? afterArrow.slice(idx + 2).trim() : null;
        })()
        : null;
    // ผู้อนุมัติในส่วนเทคโนโลยีสารสนเทศ = role IT Reviewer (It viewer)
    const IT_VIEWER_ROLES = ['IT Reviewer', 'It viewer'];
    const lastITViewerLog = [...(historyLogs as any[])].reverse().find((l) =>
      IT_VIEWER_ROLES.includes(l.user?.role?.roleName ?? '')
    );
    const approvedByITViewer = lastITViewerLog?.user?.fullName ?? null;

    const currentStatusId = request.currentStatusId ?? 1;
    const correctionTypeIds = (request as { correctionTypes?: { correctionTypeId: number }[] }).correctionTypes?.map((r) => r.correctionTypeId) ?? [];
    let transitions = await findPossibleTransitions({
      categoryId: request.categoryId,
      currentStatusId,
      correctionTypeIds: correctionTypeIds.length ? correctionTypeIds : undefined,
    });

    // Keep the UI's available actions consistent with the server-side action
    // authorization: department-scoped transitions and special approvers are
    // filtered before possibleActions is returned.
    const stepSequences = [...new Set(transitions.map((t) => t.stepSequence))];
    const [actor, specialMappings] = await Promise.all([
      prisma.user.findUnique({ where: { id: auth.id }, select: { departmentId: true } }),
      prisma.specialApproverMapping.findMany({
        where: { categoryId: request.categoryId, stepSequence: { in: stepSequences } },
        select: { stepSequence: true, userId: true },
      }),
    ]);
    const specialByStep = new Map(specialMappings.map((mapping) => [mapping.stepSequence, mapping.userId]));
    transitions = transitions.filter((transition) => {
      const departmentAllowed =
        !transition.filterByDepartment || actor?.departmentId === request.departmentId;
      const mappedUserId = specialByStep.get(transition.stepSequence);
      const specialApproverAllowed = mappedUserId == null || mappedUserId === auth.id;
      return departmentAllowed && specialApproverAllowed;
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

    const possibleActions = getPossibleActionsFromTransitions(transitions, roleName ?? undefined);

    return NextResponse.json({
      request: {
        id: (request as any).id,
        RequestID: (request as any).id,
        workOrderNo: (request as any).workOrderNo,
        RequestNumber: (request as any).workOrderNo,
        thaiName: (request as any).thaiName,
        phone: (request as any).phone,
        problemDetail: (request as any).problemDetail,
        systemType: (request as any).systemType,
        isMoneyRelated: (request as any).isMoneyRelated,
        status: (request as any).status,
        currentStatusId: (request as any).currentStatusId,
        currentStatus: (request as any).currentStatus,
        currentApprovalStep: (request as any).currentApprovalStep ?? 1,
        attachmentPath: (request as any).attachmentPath,
        createdAt: (request as any).createdAt,
        updatedAt: (request as any).updatedAt,
        department: (request as any).department,
        category: (request as any).category,
        location: (request as any).location,
        requester: (request as any).requester,
        requesterId: (request as any).requesterId,
      },
      history,
      possibleActions,
      resolvedBy,
      resolvedAt: resolvedAt ? resolvedAt.toISOString() : null,
      approvedByITViewer,
      itObstacles: itObstacles || null,
    });
  } catch (e) {
    return handleApiError(e, 'GET /api/requests/[id]');
  }
}

/** PUT /api/requests/[id] - แก้ไขคำร้อง (เฉพาะผู้ขอ เมื่อสถานะ PENDING) */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const userId = String(auth.id);
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
        const parsed = JSON.parse(formData.get('existingFiles')?.toString() || '[]');
        existingFiles = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
      } catch {
        existingFiles = [];
      }

      // Parse files to delete
      try {
        const parsed = JSON.parse(formData.get('filesToDelete')?.toString() || '[]');
        filesToDelete = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
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

    // Validate every new file before changing existing attachments or request data.
    for (const file of newFiles) {
      await validateFile(file);
    }

    // Only allow the requester to keep/remove files already attached to this
    // request. This prevents re-attaching or deleting another request's file
    // by submitting a guessed /api/files path.
    const originalFiles = new Set(parseAttachments(existing.attachmentPath));
    const filesMarkedForDelete = new Set(filesToDelete.filter((filePath) => originalFiles.has(filePath)));
    existingFiles = existingFiles.filter((filePath) => originalFiles.has(filePath) && !filesMarkedForDelete.has(filePath));
    filesToDelete = [...filesMarkedForDelete];

    // Delete removed files
    for (const filePath of filesToDelete) {
      await deleteFile(filePath);
    }

    // Upload new files
    const newFilePaths: string[] = [];
    for (const file of newFiles) {
      newFilePaths.push(await saveFile(file));
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
        const { createNotification, notifyAdminsOfStalledRequest } = await import('@/lib/notification');
        const pendingStatus = await prisma.status.findUnique({ where: { code: 'PENDING' } });
        if (pendingStatus) {
          const nextApprovers = await getNextApproversForStatus(
            existing.categoryId,
            pendingStatus.id,
            existing.departmentId ?? undefined,
            null
          );
          if (nextApprovers.length === 0) {
            // แก้ไขส่งกลับเข้าระบบแล้วแต่ไม่มีใครรับพิจารณา — อย่าปล่อยให้เงียบ
            await notifyAdminsOfStalledRequest({
              requestId: id,
              workOrderNo: existing.workOrderNo,
              reason: 'คำร้องถูกแก้ไขและส่งกลับเข้าระบบ แต่ไม่พบผู้อนุมัติที่จะรับพิจารณา',
            });
          }
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
    if (e instanceof FileValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return handleApiError(e, 'PUT /api/requests/[id]');
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

/** DELETE /api/requests/[id] - ลบคำร้อง (Admin เท่านั้น ลบได้ทุกสถานะ) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const roleName = auth.roleName;

  if (roleName !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden: Only Admin can delete' }, { status: 403 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Explicitly remove request-owned rows whose FK is NoAction in SQL Server.
      await tx.notification.deleteMany({ where: { requestId: id } });
      await tx.auditLog.deleteMany({ where: { requestId: id } });
      await tx.approvalHistory.deleteMany({ where: { requestId: id } });
      await tx.requestCorrectionType.deleteMany({ where: { requestId: id } });
      await tx.iTRequestF07.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE_REQUEST',
          userId: auth.id,
          detail: `Deleted Request ID ${id} by Admin`,
          requestId: null,
        },
      });
    }, TRANSACTION_OPTIONS);

    return NextResponse.json({ message: 'ลบคำร้องเรียบร้อย' });
  } catch (e) {
    return handleApiError(e, 'DELETE /api/requests/[id]');
  }
}
