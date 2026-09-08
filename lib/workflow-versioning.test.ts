import { describe, expect, it } from 'vitest';
import { conditionMatches, validateWorkflowTransitions } from './workflow-versioning';

describe('workflow versioning', () => {
  it('selects the correct account recheck branch', () => {
    expect(conditionMatches('ACCOUNT_RECHECK_REQUIRED', true)).toBe(true);
    expect(conditionMatches('ACCOUNT_RECHECK_REQUIRED', false)).toBe(false);
    expect(conditionMatches('ACCOUNT_RECHECK_SKIPPED', false)).toBe(true);
  });

  it('rejects dead ends and cycles', () => {
    const result = validateWorkflowTransitions([
      { currentStatusId: 1, nextStatusId: 2, actionName: 'APPROVE' },
      { currentStatusId: 2, nextStatusId: 2, actionName: 'APPROVE' },
    ], 1, [3]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/ลูป|ปลายทางตัน/);
  });

  it('accepts a terminal route with both checkbox branches', () => {
    const result = validateWorkflowTransitions([
      { currentStatusId: 1, nextStatusId: 2, actionName: 'APPROVE' },
      { currentStatusId: 2, nextStatusId: 3, actionName: 'IT_PROCESS', conditionKey: 'ACCOUNT_RECHECK_REQUIRED' },
      { currentStatusId: 2, nextStatusId: 3, actionName: 'IT_PROCESS', conditionKey: 'ACCOUNT_RECHECK_SKIPPED' },
    ], 1, [3]);
    expect(result.valid).toBe(true);
  });

  it('rejects a workflow where only one account branch reaches a terminal state', () => {
    const result = validateWorkflowTransitions([
      { currentStatusId: 1, nextStatusId: 2, actionName: 'APPROVE' },
      { currentStatusId: 2, nextStatusId: 3, actionName: 'IT_PROCESS', conditionKey: 'ACCOUNT_RECHECK_REQUIRED' },
      { currentStatusId: 2, nextStatusId: 4, actionName: 'IT_PROCESS', conditionKey: 'ACCOUNT_RECHECK_SKIPPED' },
    ], 1, [3]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/branch|ตัน/);
  });

  it('rejects ALWAYS overlapping a conditional action for the same role', () => {
    const result = validateWorkflowTransitions([
      { currentStatusId: 1, nextStatusId: 2, actionName: 'IT_PROCESS' },
      { currentStatusId: 1, nextStatusId: 2, actionName: 'IT_PROCESS', conditionKey: 'ACCOUNT_RECHECK_REQUIRED' },
    ], 1, [2]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('ซ้อนทับ');
  });

  it('rejects a reject-only continuation and a forward route ending in REVISION', () => {
    for (const actionName of ['REJECT', 'APPROVE']) {
      expect(validateWorkflowTransitions([
        { currentStatusId: 1, nextStatusId: 2, actionName: 'APPROVE' },
        { currentStatusId: 2, nextStatusId: 4, actionName },
      ], 1, [3, 4], [3]).valid).toBe(false);
    }
  });

  it('examines a dead end hidden behind the first valid outgoing path', () => {
    expect(validateWorkflowTransitions([
      { currentStatusId: 1, nextStatusId: 3, actionName: 'APPROVE', requiredRoleId: 1 },
      { currentStatusId: 1, nextStatusId: 2, actionName: 'APPROVE', requiredRoleId: 2 },
    ], 1, [3]).valid).toBe(false);
  });

  it('allows parallel roles converging to the same state', () => {
    expect(validateWorkflowTransitions([
      { currentStatusId: 1, nextStatusId: 2, actionName: 'APPROVE', requiredRoleId: 1 },
      { currentStatusId: 1, nextStatusId: 2, actionName: 'APPROVE', requiredRoleId: 2 },
      { currentStatusId: 1, nextStatusId: 4, actionName: 'REJECT', requiredRoleId: 1 },
    ], 1, [2, 4], [2]).valid).toBe(true);
  });

  it('rejects cycles back to the initial status and unknown conditions', () => {
    expect(validateWorkflowTransitions([
      { currentStatusId: 1, nextStatusId: 2, actionName: 'APPROVE' },
      { currentStatusId: 2, nextStatusId: 1, actionName: 'APPROVE' },
    ], 1, [3]).valid).toBe(false);
    expect(validateWorkflowTransitions([
      { currentStatusId: 1, nextStatusId: 2, actionName: 'APPROVE', conditionKey: 'TYPO' },
    ], 1, [2]).valid).toBe(false);
  });
});
