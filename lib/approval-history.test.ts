import { describe, expect, it } from 'vitest';
import { currentRoundEvidence } from './approval-history';

describe('approval evidence after resubmission', () => {
  const approval = (approvalRound: number, actionType: string, roleName = 'Accountant') => ({
    approvalRound, actionType, approvalTimestamp: new Date('2026-01-01'), comment: 'old obstacle',
    approver: { fullName: `Reviewer round ${approvalRound}`, signatureUrl: '/signature.png', role: { roleName } },
  });
  it('keeps old signatures, IT resolution and close approval out of a new round', () => {
    const rows = [approval(1, 'Approve'), approval(1, 'IT_PROCESS'), approval(1, 'CONFIRM_COMPLETE', 'IT Reviewer')];
    expect(currentRoundEvidence(rows, 2)).toEqual({
      currentRoundHistory: [], resolvedBy: null, resolvedAt: null, itObstacles: null, approvedByITViewer: null,
    });
    expect(rows).toHaveLength(3);
  });
  it('includes only current approvals and never treats rejection as an IT signature', () => {
    const result = currentRoundEvidence([
      approval(1, 'Approve'), approval(2, 'Approve'), approval(2, 'Reject', 'IT Reviewer'), approval(2, 'IT_PROCESS'),
    ], 2);
    expect(result.currentRoundHistory).toHaveLength(3);
    expect(result.currentRoundHistory[0].ActionType).toBe('อนุมัติ');
    expect(result.resolvedBy).toBe('Reviewer round 2');
    expect(result.approvedByITViewer).toBeNull();
  });
});
