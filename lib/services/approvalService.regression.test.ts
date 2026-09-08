import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  findRequest: vi.fn(), findToken: vi.fn(), transaction: vi.fn(), claim: vi.fn(), update: vi.fn(),
  history: vi.fn(), existingApproval: vi.fn(), audit: vi.fn(), transitions: vi.fn(), parallel: vi.fn(),
  approvers: vi.fn(), number: vi.fn(), notification: vi.fn(), markRead: vi.fn(), stalled: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {
  iTRequestF07: { findUnique: mocks.findRequest, findFirst: mocks.findToken },
  user: { findUnique: vi.fn(async () => ({ id: 10, isActive: true, departmentId: 1, role: { roleName: 'Accountant' } })) },
  requestCorrectionType: { findMany: vi.fn(async () => []) },
  specialApproverMapping: { findUnique: vi.fn(async () => null) },
  $transaction: mocks.transaction,
} }));
vi.mock('@/lib/workflow', () => ({
  findPossibleTransitions: mocks.transitions, checkParallelApprovalsCompleted: mocks.parallel,
  getNextApproversForStatus: mocks.approvers,
}));
vi.mock('@/lib/document-number', () => ({ generateRequestNumber: mocks.number }));
vi.mock('@/lib/mail', () => ({ sendApprovalEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/notification', () => ({
  createNotification: mocks.notification, markNotificationsReadForRequests: mocks.markRead,
  notifyAdminsOfStalledRequest: mocks.stalled,
}));
import { executeApproval, executeApprovalByToken, type ExecuteApprovalInput } from './approvalService';

const timestamp = new Date('2026-01-01T00:00:00Z');
const row = () => ({
  id: 1, categoryId: 1, departmentId: 1, currentStatusId: 2, currentStatus: { code: 'WAITING_ACCOUNT' },
  status: 'WAITING_ACCOUNT', approvalRound: 2, updatedAt: timestamp, workOrderNo: 'R-1',
  approvalToken: 'token', requiresAccountRecheck: false, workflowVersionId: 1, requesterId: 20,
  requester: { id: 20, fullName: 'Requester', email: null },
});
const input = (): ExecuteApprovalInput => ({
  requestId: 1, actionName: 'APPROVE', expectedUpdatedAt: timestamp.toISOString(),
  actor: { userId: 10, roleName: 'Accountant', userName: 'Reviewer' }, source: 'api',
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findRequest.mockResolvedValue(row());
  mocks.findToken.mockResolvedValue(row());
  mocks.transitions.mockResolvedValue([{
    categoryId: 1, currentStatusId: 2, nextStatusId: 3, stepSequence: 2, filterByDepartment: false,
    action: { actionName: 'APPROVE' }, requiredRole: { roleName: 'Accountant' },
    nextStatus: { code: 'WAITING_IT', displayName: 'IT' },
  }]);
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.existingApproval.mockResolvedValue(null);
  mocks.parallel.mockResolvedValue({ allApproved: false, totalApprovals: 1, totalTransitions: 2 });
  mocks.approvers.mockResolvedValue([]);
  mocks.notification.mockResolvedValue(undefined);
  mocks.markRead.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async callback => callback({
    iTRequestF07: { updateMany: mocks.claim, update: mocks.update },
    approvalHistory: { create: mocks.history, findFirst: mocks.existingApproval },
    auditLog: { create: mocks.audit },
  }));
});

describe('approval transaction regressions', () => {
  it.each(['', 'invalid', '2025-01-01T00:00:00Z'])('rejects unreviewed version %s before writing', async expectedUpdatedAt => {
    expect(await executeApproval({ ...input(), expectedUpdatedAt })).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([true, false])('claims before history/legacy numbering when a concurrent edit wins (legacy=%s)', async legacy => {
    mocks.findRequest.mockResolvedValue({ ...row(), workOrderNo: legacy ? null : 'R-1' });
    mocks.claim.mockResolvedValue({ count: 0 });
    expect(await executeApproval(input())).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.number).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('advances the version even while waiting and scopes the vote to the current round', async () => {
    expect(await executeApproval(input())).toMatchObject({ ok: true, type: 'WAITING' });
    const claim = mocks.claim.mock.calls[0][0];
    expect(claim.where).toMatchObject({ updatedAt: timestamp, approvalRound: 2, currentStatusId: 2 });
    expect(claim.data.updatedAt.getTime()).toBeGreaterThan(timestamp.getTime());
    expect(mocks.history).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ approvalRound: 2 }) }));
    expect(mocks.existingApproval).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ approvalRound: 2 }) }));
    mocks.findRequest.mockResolvedValue({ ...row(), updatedAt: claim.data.updatedAt });
    expect(await executeApproval(input())).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(mocks.history).toHaveBeenCalledTimes(1);
  });

  it('keeps committed success when notification lookup and marking read both fail', async () => {
    mocks.parallel.mockResolvedValue({ allApproved: true, totalApprovals: 1, totalTransitions: 1 });
    mocks.approvers.mockRejectedValue(new Error('Notification lookup unavailable'));
    mocks.markRead.mockRejectedValue(new Error('Notification update unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await executeApproval(input())).toMatchObject({ ok: true, type: 'APPROVED' });
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.markRead).toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it('notifies a rejected requester in-app even without an email address', async () => {
    const transitions = await mocks.transitions();
    transitions[0].action.actionName = 'REJECT';
    transitions[0].nextStatus.code = 'REVISION';
    expect(await executeApproval({ ...input(), actionName: 'REJECT', comment: 'Please correct' }))
      .toMatchObject({ ok: true, type: 'REJECT' });
    expect(mocks.notification).toHaveBeenCalledWith(20, expect.any(String), 1);
  });

  it('notifies the next approvers in-app and warns admins when none of them has an email', async () => {
    mocks.parallel.mockResolvedValue({ allApproved: true, totalApprovals: 1, totalTransitions: 1 });
    mocks.approvers.mockResolvedValue([
      { id: 31, fullName: 'No Mailbox', email: null },
      { id: 32, fullName: 'Also No Mailbox', email: '' },
    ]);
    expect(await executeApproval(input())).toMatchObject({ ok: true, type: 'APPROVED' });
    expect(mocks.notification).toHaveBeenCalledWith(31, expect.any(String), 1);
    expect(mocks.notification).toHaveBeenCalledWith(32, expect.any(String), 1);
    expect(mocks.stalled).toHaveBeenCalledWith(expect.objectContaining({ requestId: 1 }));
  });

  it('refuses a second approval from the same approver in the same round', async () => {
    mocks.existingApproval.mockResolvedValue({ id: 99 });
    expect(await executeApproval(input())).toMatchObject({ ok: false, code: 'ALREADY_APPROVED' });
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.parallel).not.toHaveBeenCalled();
  });

  it('refuses a double-click reject once the first one has advanced the version', async () => {
    const transitions = await mocks.transitions();
    transitions[0].action.actionName = 'REJECT';
    transitions[0].nextStatus.code = 'REVISION';
    const reject = { ...input(), actionName: 'REJECT', comment: 'Please correct' };
    expect(await executeApproval(reject)).toMatchObject({ ok: true, type: 'REJECT' });
    // The claim moved the row forward; the resent click still carries the old version.
    mocks.claim.mockResolvedValue({ count: 0 });
    expect(await executeApproval(reject)).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(mocks.history).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });

  it('replays a retryable abort against the same version, so history is written once', async () => {
    const aborted = new Prisma.PrismaClientKnownRequestError('Transaction has not begun', {
      code: 'ENOTBEGUN', clientVersion: 'test',
    });
    const run = mocks.transaction.getMockImplementation()!;
    mocks.transaction.mockReset();
    mocks.transaction.mockRejectedValueOnce(aborted).mockImplementation(run);

    expect(await executeApproval(input())).toMatchObject({ ok: true, type: 'WAITING' });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.history).toHaveBeenCalledTimes(1);
    // The replay must not accept a version the first attempt could have committed.
    expect(mocks.claim.mock.calls[0][0].where).toMatchObject({ updatedAt: timestamp, approvalRound: 2 });
  });

  it('rejects a token rotated between the email lookup and the approval lookup', async () => {
    mocks.findRequest.mockResolvedValue({ ...row(), approvalToken: 'new-token' });
    expect(await executeApprovalByToken({
      token: 'token', status: 'APPROVED', expectedUpdatedAt: timestamp.toISOString(), actor: input().actor,
    })).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
