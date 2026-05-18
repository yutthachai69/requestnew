import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import {
  ALLOWED_ACTIONS,
  executeApproval,
  type ApprovalErrorCode,
} from '@/lib/services/approvalService';
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit';

const ERROR_STATUS: Record<ApprovalErrorCode, number> = {
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  CLOSED: 400,
  INVALID_ACTION: 400,
  REJECT_NO_COMMENT: 400,
  FORBIDDEN: 403,
  NO_TRANSITION: 400,
  ALREADY_APPROVED: 400,
};

/**
 * POST /api/requests/[id]/action - ดำเนินการตาม WorkflowTransitions (State Machine)
 * body: { actionName: 'APPROVE' | 'REJECT' | 'IT_PROCESS' | 'CONFIRM_COMPLETE', comment?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const userId = String(auth.id);
  const roleName = auth.roleName ?? '';
  const userName = auth.name ?? '';

  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rlKey = getRateLimitKey(userId, '/api/requests/action');
  const rl = checkRateLimit(rlKey, { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { message: 'ดำเนินการบ่อยเกินไป กรุณารอสักครู่' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

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

    const outcome = await executeApproval({
      requestId: id,
      actionName,
      comment,
      actor: {
        userId: Number(userId),
        roleName,
        userName,
      },
      source: 'api',
    });

    if (!outcome.ok) {
      return NextResponse.json(
        { message: outcome.message },
        { status: ERROR_STATUS[outcome.code] }
      );
    }

    if (outcome.type === 'REJECT') {
      return NextResponse.json({
        message: 'ส่งกลับแก้ไขเรียบร้อย',
        request: { id, status: outcome.nextCode, currentStatusId: outcome.nextStatusId },
      });
    }

    if (outcome.type === 'WAITING') {
      return NextResponse.json({
        message: `บันทึกการอนุมัติเรียบร้อย (รอผู้อื่น ${outcome.count}/${outcome.total})`,
        request: { id },
      });
    }

    if (outcome.isClosing) {
      return NextResponse.json({
        message: 'อนุมัติและปิดงานเรียบร้อย',
        request: { id, status: 'CLOSED', currentStatusId: outcome.nextStatusId },
      });
    }

    return NextResponse.json({
      message: 'ดำเนินการสำเร็จ ส่งต่อขั้นถัดไปแล้ว',
      request: { id, status: outcome.nextCode, currentStatusId: outcome.nextStatusId },
    });
  } catch (e) {
    console.error('POST /api/requests/[id]/action', e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
