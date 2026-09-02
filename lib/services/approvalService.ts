/**
 * ศูนย์กลางดำเนินการอนุมัติ — ใช้ร่วมกันระหว่าง API และลิงก์อีเมล
 */
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserRoleNamesForWorkflowRole } from '@/lib/auth-constants';
import {
  findPossibleTransitions,
  getNextApproversForStatus,
  checkParallelApprovalsCompleted,
  type TransitionWithRelations,
} from '@/lib/workflow';
import { generateRequestNumber } from '@/lib/document-number';
import { sendApprovalEmail } from '@/lib/mail';
import { getApprovalTemplate, getRevisionEmail, getCompletionEmail } from '@/lib/email-helper';
import {
  createNotification,
  markNotificationsReadForRequests,
  notifyAdminsOfStalledRequest,
} from '@/lib/notification';
import { withTransactionRetry, TRANSACTION_OPTIONS } from '@/lib/transaction-retry';

export const ALLOWED_ACTIONS = ['APPROVE', 'REJECT', 'IT_PROCESS', 'CONFIRM_COMPLETE'] as const;
export type AllowedActionName = (typeof ALLOWED_ACTIONS)[number];

export type ApprovalSource = 'api' | 'email';

export type ApprovalErrorCode =
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'CLOSED'
  | 'INVALID_ACTION'
  | 'REJECT_NO_COMMENT'
  | 'FORBIDDEN'
  | 'NO_TRANSITION'
  | 'ALREADY_APPROVED';

export interface ApprovalActor {
  userId: number;
  roleName: string;
  userName: string;
  ipAddress?: string;
}

export interface ExecuteApprovalInput {
  requestId: number;
  actionName: string;
  comment?: string;
  actor: ApprovalActor;
  source: ApprovalSource;
}

export interface ExecuteApprovalByTokenInput {
  token: string;
  status: 'APPROVED' | 'REJECTED';
  actor: ApprovalActor;
  comment?: string;
}

type TransactionResult =
  | { type: 'REJECT'; nextStatusId: number; nextCode: string; requestData: { requestId: number; requestNumber?: string } }
  | { type: 'WAITING'; count: number; total: number }
  | {
      type: 'APPROVED';
      isClosing: boolean;
      newToken: string | null;
      nextStatusId: number;
      nextCode: string;
      nextStatusDisplayName: string;
      requestData: { requestId: number; requestNumber?: string };
    };

export type ApprovalSuccess = TransactionResult & { ok: true };
export type ApprovalFailure = { ok: false; code: ApprovalErrorCode; message: string };
export type ApprovalOutcome = ApprovalSuccess | ApprovalFailure;

const APPROVAL_HISTORY_ACTIONS = ['APPROVE', 'APPROVED', 'Approve', 'IT_PROCESS', 'CONFIRM_COMPLETE'] as const;

const requestSelect = {
  id: true,
  workOrderNo: true,
  thaiName: true,
  problemDetail: true,
  categoryId: true,
  departmentId: true,
  status: true,
  currentStatusId: true,
  currentStatus: { select: { id: true, code: true, displayName: true } },
  requesterId: true,
  requester: { select: { id: true, email: true, fullName: true } },
} as const;

type RequestRow = Prisma.ITRequestF07GetPayload<{ select: typeof requestSelect }>;

export function resolveActionForApprovalIntent(
  transitions: TransitionWithRelations[],
  intent: 'APPROVED' | 'REJECTED'
): AllowedActionName | 'REJECT' {
  if (intent === 'REJECTED') return 'REJECT';
  if (transitions.some((t) => t.action.actionName === 'APPROVE')) return 'APPROVE';
  if (transitions.some((t) => t.action.actionName === 'IT_PROCESS')) return 'IT_PROCESS';
  if (transitions.some((t) => t.action.actionName === 'CONFIRM_COMPLETE')) return 'CONFIRM_COMPLETE';
  return 'APPROVE';
}

export function findAuthorizedTransition(
  transitions: TransitionWithRelations[],
  actionName: string,
  roleName: string
): TransitionWithRelations | undefined {
  return transitions.find((t) => {
    const allowedRoles = getUserRoleNamesForWorkflowRole(t.requiredRole.roleName);
    return t.action.actionName === actionName && allowedRoles.includes(roleName);
  });
}

export function isDepartmentAuthorized(
  transition: Pick<TransitionWithRelations, 'filterByDepartment'>,
  requestDepartmentId: number,
  actorDepartmentId: number | null | undefined
): boolean {
  return !transition.filterByDepartment || actorDepartmentId === requestDepartmentId;
}

export function isSpecialApproverAuthorized(
  mappedUserId: number | null | undefined,
  actorUserId: number
): boolean {
  return mappedUserId == null || mappedUserId === actorUserId;
}

async function getCorrectionTypeIds(requestId: number): Promise<number[]> {
  const rows = await prisma.requestCorrectionType.findMany({
    where: { requestId },
    select: { correctionTypeId: true },
  });
  return rows.map((r) => r.correctionTypeId);
}

async function userAlreadyApprovedStep(
  tx: Prisma.TransactionClient,
  requestId: number,
  userId: number,
  stepSequence: number
): Promise<boolean> {
  const existing = await tx.approvalHistory.findFirst({
    where: {
      requestId,
      approverId: userId,
      approvalLevel: stepSequence,
      actionType: { in: [...APPROVAL_HISTORY_ACTIONS] },
    },
  });
  return existing != null;
}

async function loadRequest(requestId: number): Promise<RequestRow | null> {
  return prisma.iTRequestF07.findUnique({ where: { id: requestId }, select: requestSelect });
}

async function runApprovalTransaction(
  req: RequestRow,
  actionName: AllowedActionName | 'REJECT',
  transition: TransitionWithRelations,
  actor: ApprovalActor,
  comment: string,
  source: ApprovalSource
): Promise<TransactionResult> {
  const id = req.id;
  const currentStatusId = req.currentStatusId ?? 1;
  const nextStatus = transition.nextStatus;
  const nextStatusId = transition.nextStatusId;
  const nextCode = nextStatus.code;
  const sourceLabel = source === 'email' ? 'ผ่านลิงก์อีเมล' : '';

  return withTransactionRetry(() => prisma.$transaction(async (tx) => {
    let workOrderNo = req.workOrderNo;
    if (!workOrderNo && actionName !== 'REJECT') {
      workOrderNo = await generateRequestNumber(tx, req.categoryId);
      await tx.iTRequestF07.update({ where: { id }, data: { workOrderNo } });
    }

    const requestData = { requestId: id, requestNumber: workOrderNo ?? undefined };

    if (actionName === 'REJECT') {
      const rejected = await tx.iTRequestF07.updateMany({
        where: { id, currentStatusId },
        data: {
          status: nextCode,
          currentStatusId: nextStatusId,
          approvalToken: null,
          updatedAt: new Date(),
        },
      });
      if (rejected.count !== 1) throw new Error('ALREADY_APPROVED');
      await tx.auditLog.create({
        data: {
          action: 'REJECT',
          userId: actor.userId,
          ipAddress: actor.ipAddress,
          detail: `Request #${workOrderNo} ส่งกลับแก้ไข by ${actor.userName}${sourceLabel ? ` ${sourceLabel}` : ''}${comment ? `: ${comment}` : ''}`,
          requestId: id,
        },
      });
      await tx.approvalHistory.create({
        data: {
          requestId: id,
          approverId: actor.userId,
          approvalLevel: transition.stepSequence,
          actionType: 'Reject',
          comment: comment || null,
        },
      });
      return { type: 'REJECT', nextStatusId, nextCode, requestData };
    }

    const alreadyApproved = await userAlreadyApprovedStep(tx, id, actor.userId, transition.stepSequence);
    if (alreadyApproved) {
      throw new Error('ALREADY_APPROVED');
    }

    await tx.approvalHistory.create({
      data: {
        requestId: id,
        approverId: actor.userId,
        approvalLevel: transition.stepSequence,
        actionType: actionName === 'APPROVE' ? 'Approve' : actionName,
        comment: comment || null,
      },
    });

    const parallelCheck = await checkParallelApprovalsCompleted(
      id,
      currentStatusId,
      transition.stepSequence,
      tx
    );

    if (!parallelCheck.allApproved) {
      await tx.auditLog.create({
        data: {
          action: actionName,
          userId: actor.userId,
          ipAddress: actor.ipAddress,
          detail: `Request #${workOrderNo} ${actionName} by ${actor.userName}${sourceLabel ? ` ${sourceLabel}` : ''} (Waiting ${parallelCheck.totalApprovals}/${parallelCheck.totalTransitions})${comment ? `: ${comment}` : ''}`,
          requestId: id,
        },
      });
      return { type: 'WAITING', count: parallelCheck.totalApprovals, total: parallelCheck.totalTransitions };
    }

    const isClosing = nextCode === 'CLOSED';
    const newToken = isClosing ? null : crypto.randomUUID();

    const updated = await tx.iTRequestF07.updateMany({
      where: { id, currentStatusId },
      data: {
        status: nextCode,
        currentStatusId: nextStatusId,
        currentApprovalStep: transition.stepSequence,
        approvalToken: newToken,
        updatedAt: new Date(),
      },
    });
    if (updated.count !== 1) throw new Error('ALREADY_APPROVED');

    await tx.auditLog.create({
      data: {
        action: actionName,
        userId: actor.userId,
        ipAddress: actor.ipAddress,
        detail: `Request #${workOrderNo} ${actionName} by ${actor.userName}${sourceLabel ? ` ${sourceLabel}` : ''} → ${nextStatus.displayName}${comment ? `: ${comment}` : ''}`,
        requestId: id,
      },
    });

    return {
      type: 'APPROVED',
      isClosing,
      newToken,
      nextStatusId,
      nextCode,
      nextStatusDisplayName: nextStatus.displayName,
      requestData,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, ...TRANSACTION_OPTIONS }));
}

async function sendPostApprovalNotifications(
  req: RequestRow,
  result: TransactionResult,
  correctionTypeIds: number[]
): Promise<void> {
  if (result.type === 'REJECT') {
    if (req.requester?.email) {
      try {
        await createNotification(
          req.requesterId,
          `คำร้องของคุณ (#${req.workOrderNo ?? result.requestData.requestNumber}) ถูกส่งกลับแก้ไข กรุณาตรวจสอบและแก้ไขคำร้อง`,
          req.id
        );
        const { subject, body } = getRevisionEmail(result.requestData, { fullName: req.requester.fullName });
        await sendApprovalEmail({ to: [req.requester.email], subject, body });
      } catch (err) {
        console.error('ส่งเมลแจ้งผู้ยื่น (revision) ล้มเหลว:', err);
      }
    }
    return;
  }

  if (result.type === 'WAITING') {
    console.info(
      `[mail] รอผู้อนุมัติคนอื่นในขั้นเดียวกัน (${result.count}/${result.total}) — ยังไม่ส่งเมลขั้นถัดไป`
    );
    return;
  }

  if (result.isClosing) {
    if (req.requester?.email) {
      try {
        await createNotification(
          req.requesterId,
          `คำร้องของคุณ (#${req.workOrderNo ?? result.requestData.requestNumber}) ดำเนินการเสร็จสิ้นแล้ว`,
          req.id
        );
        const { subject, body } = getCompletionEmail(result.requestData, { fullName: req.requester.fullName });
        await sendApprovalEmail({ to: [req.requester.email], subject, body });
      } catch (err) {
        console.error('ส่งเมลแจ้งผู้ยื่น (completion) ล้มเหลว:', err);
      }
    }
    return;
  }

  const nextApprovers = await getNextApproversForStatus(
    req.categoryId,
    result.nextStatusId,
    req.departmentId ?? undefined,
    null,
    correctionTypeIds
  );

  if (nextApprovers.length === 0) {
    await notifyAdminsOfStalledRequest({
      requestId: req.id,
      workOrderNo: result.requestData.requestNumber ?? req.workOrderNo,
      reason: `ไม่พบผู้อนุมัติขั้นถัดไป (สถานะ "${result.nextStatusDisplayName}", statusId=${result.nextStatusId}, correctionTypes=[${correctionTypeIds.join(',')}])`,
    });
    return;
  }

  console.info(
    `[notify] แจ้งผู้อนุมัติ ${nextApprovers.length} คน — คำร้อง #${req.workOrderNo ?? req.id} → ${result.nextStatusDisplayName}`
  );

  const templateRequest = {
    id: req.id,
    workOrderNo: result.requestData.requestNumber ?? req.workOrderNo,
    thaiName: req.thaiName ?? '',
    problemDetail: req.problemDetail ?? '',
  };
  const emails = nextApprovers.map((a) => a.email).filter(Boolean);

  for (const approver of nextApprovers) {
    if (approver.id) {
      await createNotification(
        approver.id,
        `มีใบงานรออนุมัติ: ${result.requestData.requestNumber ?? req.workOrderNo} (${req.thaiName})`,
        req.id
      );
    }
  }

  if (emails.length === 0) {
    console.warn(
      `[mail] ผู้อนุมัติ ${nextApprovers.length} คน ไม่มีอีเมลในระบบ — คำร้อง #${req.workOrderNo ?? req.id}`
    );
    return;
  }

  const { subject, body: emailBody } = getApprovalTemplate(
    templateRequest,
    nextApprovers[0].fullName,
    { approvalToken: result.newToken }
  );
  const sent = await sendApprovalEmail({
    to: emails,
    subject: `[${result.nextStatusDisplayName}] ${subject}`,
    body: emailBody,
    senderName: req.thaiName || undefined,
    replyTo: req.requester?.email || undefined,
  });
  if (!sent.ok) {
    console.error('[mail] ส่งเมลผู้อนุมัติขั้นถัดไปล้มเหลว:', sent);
  }
}

function validateActionName(actionName: string): actionName is AllowedActionName {
  return ALLOWED_ACTIONS.includes(actionName as AllowedActionName);
}

/**
 * ดำเนินการอนุมัติตาม request id (ใช้จาก API)
 */
export async function executeApproval(input: ExecuteApprovalInput): Promise<ApprovalOutcome> {
  const actionName = String(input.actionName ?? '').toUpperCase();
  const comment = input.comment?.trim() ?? '';

  if (!validateActionName(actionName)) {
    return {
      ok: false,
      code: 'INVALID_ACTION',
      message: `actionName ต้องเป็นหนึ่งใน: ${ALLOWED_ACTIONS.join(', ')}`,
    };
  }

  if (actionName === 'REJECT' && !comment) {
    return { ok: false, code: 'REJECT_NO_COMMENT', message: 'กรุณาระบุเหตุผลในการปฏิเสธ' };
  }

  const req = await loadRequest(input.requestId);
  if (!req) {
    return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบคำร้อง' };
  }

  const actor = await prisma.user.findUnique({
    where: { id: input.actor.userId },
    select: { id: true, isActive: true, departmentId: true, role: { select: { roleName: true } } },
  });
  if (!actor?.isActive) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'ไม่พบผู้ใช้หรือบัญชีถูกปิดใช้งาน' };
  }

  const statusCode = req.currentStatus?.code ?? req.status ?? 'PENDING';
  if (statusCode === 'CLOSED') {
    return { ok: false, code: 'CLOSED', message: 'คำร้องนี้ปิดงานเรียบร้อยแล้ว' };
  }

  const correctionTypeIds = await getCorrectionTypeIds(req.id);
  const transitions = await findPossibleTransitions({
    categoryId: req.categoryId,
    currentStatusId: req.currentStatusId ?? 1,
    correctionTypeIds: correctionTypeIds.length ? correctionTypeIds : undefined,
  });

  const transition = findAuthorizedTransition(transitions, actionName, actor.role.roleName);
  if (!transition) {
    if (transitions.length > 0) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        message: `คุณไม่มีสิทธิ์ดำเนินการ "${actionName}" ในสถานะนี้ (ตรวจสอบสิทธิ์หรือสถานะ)`,
      };
    }
    return { ok: false, code: 'NO_TRANSITION', message: 'ไม่พบขั้นตอนถัดไปสำหรับสถานะนี้ (No Transition Found)' };
  }

  if (!isDepartmentAuthorized(transition, req.departmentId, actor.departmentId)) {
    return { ok: false, code: 'FORBIDDEN', message: 'ผู้อนุมัติอยู่นอกแผนกของคำร้องนี้' };
  }

  const specialApprover = await prisma.specialApproverMapping.findUnique({
    where: {
      categoryId_stepSequence: {
        categoryId: transition.categoryId,
        stepSequence: transition.stepSequence,
      },
    },
    select: { userId: true },
  });
  if (!isSpecialApproverAuthorized(specialApprover?.userId, actor.id)) {
    return { ok: false, code: 'FORBIDDEN', message: 'ผู้ใช้ไม่ได้ถูกกำหนดเป็นผู้อนุมัติพิเศษของขั้นตอนนี้' };
  }

  try {
    const result = await runApprovalTransaction(
      req,
      actionName,
      transition,
      input.actor,
      comment,
      input.source
    );
    await sendPostApprovalNotifications(req, result, correctionTypeIds);
    // ผู้กระทำเพิ่งอนุมัติ/ปฏิเสธคำร้องนี้ไปแล้ว — แจ้งเตือน "รออนุมัติ" เดิมของเขาถือว่าอ่านแล้ว
    // (ครอบคลุมทุกช่องทาง: dashboard, ลิงก์อีเมล)
    await markNotificationsReadForRequests(input.actor.userId, [req.id]);
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof Error && e.message === 'ALREADY_APPROVED') {
      return {
        ok: false,
        code: 'ALREADY_APPROVED',
        message: 'คุณดำเนินการขั้นนี้ไปแล้ว',
      };
    }
    throw e;
  }
}

/**
 * ดำเนินการอนุมัติผ่าน approval token (ใช้จากลิงก์อีเมล — ต้อง login)
 */
export async function executeApprovalByToken(input: ExecuteApprovalByTokenInput): Promise<ApprovalOutcome> {
  const request = await prisma.iTRequestF07.findFirst({
    where: { approvalToken: input.token },
    select: requestSelect,
  });

  if (!request) {
    return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบคำร้องหรือลิงก์หมดอายุ' };
  }

  const statusCode = request.currentStatus?.code ?? request.status ?? 'PENDING';
  if (statusCode === 'CLOSED' || statusCode === 'REJECTED') {
    return { ok: false, code: 'CLOSED', message: 'คำร้องนี้ดำเนินการเสร็จแล้ว' };
  }

  const correctionTypeIds = await getCorrectionTypeIds(request.id);
  const transitions = await findPossibleTransitions({
    categoryId: request.categoryId,
    currentStatusId: request.currentStatusId ?? 1,
    correctionTypeIds: correctionTypeIds.length ? correctionTypeIds : undefined,
  });

  if (transitions.length === 0) {
    return {
      ok: false,
      code: 'NO_TRANSITION',
      message: 'ไม่พบขั้นตอนอนุมัติสำหรับคำร้องนี้ กรุณาใช้หน้าระบบแทน',
    };
  }

  const actionName = resolveActionForApprovalIntent(transitions, input.status);
  const comment =
    input.comment?.trim() ||
    (input.status === 'REJECTED' ? 'ปฏิเสธผ่านลิงก์อีเมล' : '');

  return executeApproval({
    requestId: request.id,
    actionName,
    comment,
    actor: input.actor,
    source: 'email',
  });
}
