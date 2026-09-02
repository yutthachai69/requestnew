import { describe, expect, it } from 'vitest';
import type { TransitionWithRelations } from '@/lib/workflow';
import {
  findAuthorizedTransition,
  isDepartmentAuthorized,
  isSpecialApproverAuthorized,
  resolveActionForApprovalIntent,
} from './approvalService';

function mockTransition(
  actionName: string,
  workflowRoleName = 'Accountant'
): TransitionWithRelations {
  return {
    action: { id: 1, actionName, displayName: actionName },
    requiredRole: { id: 1, roleName: workflowRoleName },
  } as TransitionWithRelations;
}

describe('resolveActionForApprovalIntent', () => {
  it('maps REJECTED to REJECT', () => {
    expect(resolveActionForApprovalIntent([], 'REJECTED')).toBe('REJECT');
  });

  it('prefers APPROVE when available', () => {
    const transitions = [
      mockTransition('IT_PROCESS'),
      mockTransition('APPROVE'),
    ];
    expect(resolveActionForApprovalIntent(transitions, 'APPROVED')).toBe('APPROVE');
  });

  it('falls back to IT_PROCESS then CONFIRM_COMPLETE', () => {
    expect(resolveActionForApprovalIntent([mockTransition('IT_PROCESS')], 'APPROVED')).toBe(
      'IT_PROCESS'
    );
    expect(
      resolveActionForApprovalIntent([mockTransition('CONFIRM_COMPLETE')], 'APPROVED')
    ).toBe('CONFIRM_COMPLETE');
  });

  it('defaults to APPROVE when no matching transition', () => {
    expect(resolveActionForApprovalIntent([], 'APPROVED')).toBe('APPROVE');
  });
});

describe('findAuthorizedTransition', () => {
  const transitions = [
    mockTransition('APPROVE', 'Accountant'),
    mockTransition('REJECT', 'Head of Department'),
  ];

  it('finds transition for mapped user role', () => {
    const found = findAuthorizedTransition(transitions, 'APPROVE', 'account');
    expect(found?.action.actionName).toBe('APPROVE');
  });

  it('returns undefined for wrong role or action', () => {
    expect(findAuthorizedTransition(transitions, 'APPROVE', 'Requester')).toBeUndefined();
    expect(findAuthorizedTransition(transitions, 'IT_PROCESS', 'account')).toBeUndefined();
  });
});

describe('approval scope guards', () => {
  it('requires matching department when transition is department-scoped', () => {
    expect(isDepartmentAuthorized({ filterByDepartment: true }, 10, 10)).toBe(true);
    expect(isDepartmentAuthorized({ filterByDepartment: true }, 10, 20)).toBe(false);
    expect(isDepartmentAuthorized({ filterByDepartment: true }, 10, null)).toBe(false);
  });

  it('allows any department when transition is not department-scoped', () => {
    expect(isDepartmentAuthorized({ filterByDepartment: false }, 10, 20)).toBe(true);
  });

  it('requires the mapped user for a special approver step', () => {
    expect(isSpecialApproverAuthorized(7, 7)).toBe(true);
    expect(isSpecialApproverAuthorized(7, 8)).toBe(false);
    expect(isSpecialApproverAuthorized(undefined, 8)).toBe(true);
  });
});
