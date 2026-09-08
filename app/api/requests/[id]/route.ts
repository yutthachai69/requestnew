import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { approverRoles, getUserRoleNamesForWorkflowRole } from '@/lib/auth-constants';
import { findPossibleTransitions } from '@/lib/workflow';
import { mergeAttachments, parseAttachments } from '@/lib/attachments';
import { handleApiError } from '@/lib/api-error';
import { FileValidationError, saveFile, deleteFile, validateFile } from '@/lib/storage';
import { TRANSACTION_OPTIONS, withTransactionRetry } from '@/lib/transaction-retry';
import { matchesRequestVersion, nextRequestTimestamp } from '@/lib/request-concurrency';
import { currentRoundEvidence } from '@/lib/approval-history';
import { filterTransitionsForActor } from '@/lib/services/approvalService';
import { randomUUID } from 'crypto';

class RequestConflictError extends Error {
  constructor() {
    super('REQUEST_CONFLICT');
    this.name = 'RequestConflictError';
  }
}

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
      workflowVersion: { select: { id: true, versionNumber: true, status: true, label: true } },
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
    const roundHistory = await prisma.approvalHistory.findMany({
      where: { requestId: id, approvalRound: request.approvalRound },
      orderBy: [{ approvalTimestamp: 'asc' }, { id: 'asc' }],
      include: { approver: { select: {
        fullName: true, signatureUrl: true, role: { select: { roleName: true } },
      } } },
    });
    const evidence = currentRoundEvidence(roundHistory, request.approvalRound);

    const currentStatusId = request.currentStatusId ?? 1;
    const correctionTypeIds = (request as { correctionTypes?: { correctionTypeId: number }[] }).correctionTypes?.map((r) => r.correctionTypeId) ?? [];
    let transitions = await findPossibleTransitions({
      categoryId: request.categoryId,
      currentStatusId,
      correctionTypeIds: correctionTypeIds.length ? correctionTypeIds : undefined,
      workflowVersionId: request.workflowVersionId,
      requiresAccountRecheck: request.requiresAccountRecheck,
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
    transitions = filterTransitionsForActor(transitions, {
      requestDepartmentId: request.departmentId,
      actorUserId: auth.id,
      actorDepartmentId: actor?.departmentId,
      specialApproverByStep: new Map(specialMappings.map((m) => [m.stepSequence, m.userId])),
    });

    // ✅ Filter transitions: Remove if user already APPROVED this step (Parallel Check)
    if (userId) {
      const userHistory = await prisma.approvalHistory.findMany({
        where: {
          requestId: id,
          approverId: Number(userId),
          approvalRound: request.approvalRound,
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
        requiresAccountRecheck: (request as any).requiresAccountRecheck,
        status: (request as any).status,
        currentStatusId: (request as any).currentStatusId,
        currentStatus: (request as any).currentStatus,
        currentApprovalStep: (request as any).currentApprovalStep ?? 1,
        attachmentPath: (request as any).attachmentPath,
        createdAt: (request as any).createdAt,
        updatedAt: (request as any).updatedAt,
        approvalRound: request.approvalRound,
        department: (request as any).department,
        category: (request as any).category,
        location: (request as any).location,
        requester: (request as any).requester,
        requesterId: (request as any).requesterId,
      },
      history,
      possibleActions,
      ...evidence,
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
    let requiresAccountRecheck: boolean | undefined;
    let existingFiles: string[] = [];
    let filesToDelete: string[] = [];
    let newFiles: File[] = [];
    let attachmentUpdateRequested = false;
    let existingFilesProvided = false;
    let expectedUpdatedAt: Date | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      existingFilesProvided = formData.has('existingFiles');
      attachmentUpdateRequested = existingFilesProvided || formData.has('filesToDelete') || formData.has('attachments');
      problemDetail = formData.get('problemDetail')?.toString().trim();
      if (formData.has('requiresAccountRecheck')) {
        requiresAccountRecheck = formData.get('requiresAccountRecheck') === 'true';
      }
      const updatedAtRaw = formData.get('updatedAt')?.toString();
      if (updatedAtRaw) {
        const parsed = new Date(updatedAtRaw);
        if (!Number.isNaN(parsed.getTime())) expectedUpdatedAt = parsed;
      }

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
      if (body.requiresAccountRecheck !== undefined) {
        requiresAccountRecheck =
          typeof body.requiresAccountRecheck === 'boolean'
            ? body.requiresAccountRecheck
            : String(body.requiresAccountRecheck) === 'true';
      }
      if (body.updatedAt) {
        const parsed = new Date(String(body.updatedAt));
        if (!Number.isNaN(parsed.getTime())) expectedUpdatedAt = parsed;
      }
    }

    if (!matchesRequestVersion(expectedUpdatedAt?.toISOString(), existing.updatedAt)) {
      return NextResponse.json(
        { message: 'คำร้องเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนแก้ไข', code: 'REQUEST_CONFLICT' },
        { status: 409 },
      );
    }
    // Resolve resubmission configuration before saving any uploaded files.
    const pendingStatus = existing.status === 'REVISION'
      ? await prisma.status.findUnique({ where: { code: 'PENDING' } }) : null;
    if (existing.status === 'REVISION' && !pendingStatus) throw new Error('Missing PENDING status');

    // Validate every new file before changing existing attachments or request data.
    for (const file of newFiles) {
      await validateFile(file);
    }

    // Only allow the requester to keep/remove files already attached to this
    // request. This prevents re-attaching or deleting another request's file
    // by submitting a guessed /api/files path.
    const originalFiles = parseAttachments(existing.attachmentPath);
    const originalFileSet = new Set(originalFiles);
    filesToDelete = filesToDelete.filter((filePath) => originalFileSet.has(filePath));

    // Upload new files
    const newFilePaths: string[] = [];
    try {
      for (const file of newFiles) {
        newFilePaths.push(await saveFile(file));
      }
    } catch (error) {
      // Do not leave files that were written before a later upload failed.
      for (const filePath of newFilePaths) await deleteFile(filePath);
      throw error;
    }

    // Combine existing (kept) files with new files
    const allAttachments = mergeAttachments({
      original: originalFiles,
      keep: existingFiles,
      remove: filesToDelete,
      additions: newFilePaths,
      keepListProvided: existingFilesProvided,
    });
    const data: { problemDetail?: string; requiresAccountRecheck?: boolean; attachmentPath?: string | null; updatedAt: Date; status?: string; currentStatusId?: number; currentApprovalStep?: number; approvalRound?: number; approvalToken?: string } = { updatedAt: nextRequestTimestamp(existing.updatedAt) };
    if (attachmentUpdateRequested) data.attachmentPath = allAttachments.length > 0 ? JSON.stringify(allAttachments) : null;
    if (problemDetail !== undefined) data.problemDetail = problemDetail;
    if (requiresAccountRecheck !== undefined) data.requiresAccountRecheck = requiresAccountRecheck;
    // Pending requests can already have a parallel approval. Editing starts
    // a fresh round so no vote on the previous content carries forward.
    data.approvalRound = existing.approvalRound + 1;
    data.approvalToken = randomUUID();
    data.currentApprovalStep = 1;

    // If the request is in REVISION status, resubmit it back to PENDING
    if (existing.status === 'REVISION') {
      if (pendingStatus) {
        data.status = 'PENDING';
        data.currentStatusId = pendingStatus.id;
        data.currentApprovalStep = 1;
      }
    }

    let updated;
    try {
      updated = await withTransactionRetry(() => prisma.$transaction(async (tx) => {
        // Compare the version the requester edited against the current row.
        // The conditional write makes the check atomic with the update.
        const result = await tx.iTRequestF07.updateMany({
          where: {
            id,
            requesterId: Number(userId),
            updatedAt: existing.updatedAt,
            currentStatusId: existing.currentStatusId,
            status: existing.status,
            approvalRound: existing.approvalRound,
          },
          data,
        });
        if (result.count !== 1) throw new RequestConflictError();

        await tx.auditLog.create({
            data: {
              action: existing.status === 'REVISION' ? 'RESUBMIT' : 'EDIT_REQUEST',
              userId: Number(userId),
              detail: `Request #${existing.workOrderNo} แก้ไขและเริ่มรอบพิจารณา ${data.approvalRound}`,
              requestId: id,
            },
          });
        return tx.iTRequestF07.findUnique({ where: { id } });
      }, TRANSACTION_OPTIONS));
    } catch (error) {
      // The database still points at the old attachment list; remove only the
      // new files that are not referenced by it.
      for (const filePath of newFilePaths) await deleteFile(filePath);
      if (error instanceof RequestConflictError) {
        return NextResponse.json(
          { message: 'คำร้องถูกแก้ไขหรือดำเนินการไปแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนลองใหม่', code: 'REQUEST_CONFLICT' },
          { status: 409 },
        );
      }
      throw error;
    }

    // Remove old files only after the database now references the replacement
    // list. A failed DB write therefore cannot destroy the previous files.
    if (attachmentUpdateRequested) {
      for (const filePath of filesToDelete) await deleteFile(filePath);
    }

    // If resubmitted (was REVISION → now PENDING), create audit log and notify
    if (existing.status === 'REVISION') {
      // Notify next approvers (Head of Department)
      try {
        const { getNextApproversForStatus } = await import('@/lib/workflow');
        const { createNotification, notifyAdminsOfStalledRequest } = await import('@/lib/notification');
        const pendingStatus = await prisma.status.findUnique({ where: { code: 'PENDING' } });
        if (pendingStatus) {
          const correctionTypeRows = await prisma.requestCorrectionType.findMany({
            where: { requestId: id },
            select: { correctionTypeId: true },
          });
          const nextApprovers = await getNextApproversForStatus(
            existing.categoryId,
            pendingStatus.id,
            existing.departmentId ?? undefined,
            null,
            correctionTypeRows.map((row) => row.correctionTypeId),
            existing.workflowVersionId,
            updated?.requiresAccountRecheck ?? existing.requiresAccountRecheck,
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
