import { prisma } from '@/lib/prisma';

export const WORKFLOW_VERSION_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;

export const WORKFLOW_CONDITIONS = {
  ALWAYS: 'ALWAYS',
  ACCOUNT_RECHECK_REQUIRED: 'ACCOUNT_RECHECK_REQUIRED',
  ACCOUNT_RECHECK_SKIPPED: 'ACCOUNT_RECHECK_SKIPPED',
} as const;

type Db = typeof prisma | any;

export function conditionMatches(conditionKey: string | null | undefined, requiresAccountRecheck?: boolean) {
  const key = conditionKey || WORKFLOW_CONDITIONS.ALWAYS;
  if (key === WORKFLOW_CONDITIONS.ALWAYS) return true;
  if (requiresAccountRecheck == null) return true;
  if (key === WORKFLOW_CONDITIONS.ACCOUNT_RECHECK_REQUIRED) return requiresAccountRecheck;
  if (key === WORKFLOW_CONDITIONS.ACCOUNT_RECHECK_SKIPPED) return !requiresAccountRecheck;
  return false;
}

export async function getPublishedWorkflowVersion(
  db: Db,
  categoryId: number,
  correctionTypeId?: number | null,
) {
  const where = {
    categoryId,
    status: WORKFLOW_VERSION_STATUS.PUBLISHED,
    ...(correctionTypeId == null ? { correctionTypeId: null } : { correctionTypeId }),
  };
  return db.workflowVersion.findFirst({ where, orderBy: { versionNumber: 'desc' } });
}

export async function resolveWorkflowVersionId(
  db: Db,
  categoryId: number,
  correctionTypeIds?: number[],
) {
  for (const correctionTypeId of correctionTypeIds || []) {
    const specific = await getPublishedWorkflowVersion(db, categoryId, correctionTypeId);
    if (specific) return specific.id;
  }
  // `ทั่วไป` is retained as a system workflow template, not a selectable
  // request category. New categories can inherit its published baseline when
  // they do not yet have an explicit override. The migration-created
  // `Baseline v1` rows are treated as inherited copies, so future changes to
  // the central workflow apply to categories that have not been customized.
  const templateCategory = await db.category.findFirst({
    where: { isWorkflowTemplate: true },
    select: { id: true },
  });
  const generic = await getPublishedWorkflowVersion(db, categoryId, null);
  if (generic && (!templateCategory || generic.label !== 'Baseline v1')) return generic.id;
  if (!templateCategory) return generic?.id ?? null;

  for (const correctionTypeId of correctionTypeIds || []) {
    const specific = await getPublishedWorkflowVersion(db, templateCategory.id, correctionTypeId);
    if (specific) return specific.id;
  }
  const templateGeneric = await getPublishedWorkflowVersion(db, templateCategory.id, null);
  return templateGeneric?.id ?? null;
}

export function validateWorkflowTransitions(
  transitions: Array<{
    id?: number;
    currentStatusId: number;
    nextStatusId: number;
    requiredRoleId?: number;
    action?: { actionName?: string } | null;
    actionName?: string;
    conditionKey?: string | null;
  }>,
  initialStatusId: number,
  terminalStatusIds: number[],
  successfulStatusIds: number[] = terminalStatusIds,
) {
  const errors = new Set<string>();
  const warnings: string[] = [];
  const terminal = new Set(terminalStatusIds);
  const success = new Set(successfulStatusIds);
  const reachable = new Set<number>();
  const actionOf = (t: (typeof transitions)[number]) => t.action?.actionName || t.actionName || '';
  const conditions = new Set<string>(Object.values(WORKFLOW_CONDITIONS));
  const actions = new Set(['APPROVE', 'REJECT', 'IT_PROCESS', 'CONFIRM_COMPLETE']);
  for (const t of transitions) {
    if (!conditions.has(t.conditionKey || WORKFLOW_CONDITIONS.ALWAYS)) {
      errors.add(`ไม่รู้จัก condition: ${t.conditionKey}`);
    }
    if (!actions.has(actionOf(t))) errors.add(`ไม่รู้จัก action: ${actionOf(t)}`);
  }

  // Explore every forward edge for each runtime value. REJECT is a reset,
  // never evidence that a request can successfully complete.
  for (const recheck of [true, false]) {
    const visiting = new Set<number>();
    const visited = new Set<number>();
    const walk = (current: number) => {
      reachable.add(current);
      if (success.has(current)) return;
      if (terminal.has(current)) {
        errors.add(`branch ตรวจบัญชีซ้ำ=${recheck} จบที่สถานะ ${current} โดยไม่ปิดงาน`);
        return;
      }
      if (visiting.has(current)) {
        errors.add(`พบลูปใน branch ตรวจบัญชีซ้ำ=${recheck} ที่สถานะ ${current}`);
        return;
      }
      if (visited.has(current)) return;
      visiting.add(current);
      const outgoing = transitions.filter(t =>
        t.currentStatusId === current && conditionMatches(t.conditionKey, recheck));
      const seen = new Set<string>();
      for (const t of outgoing) {
        const key = `${actionOf(t)}|${t.requiredRoleId ?? 'unspecified'}`;
        if (seen.has(key)) {
          errors.add(`transition ซ้ำหรือ condition ซ้อนทับที่สถานะ ${current}, ${key}, ตรวจบัญชีซ้ำ=${recheck}`);
        }
        seen.add(key);
      }
      const forward = outgoing.filter(t => actionOf(t) !== 'REJECT');
      if (!forward.length) errors.add(`branch ตรวจบัญชีซ้ำ=${recheck} เป็นปลายทางตันที่สถานะ ${current}`);
      // Parallel approvals share one status update: all approvers must agree
      // on its destination, otherwise the last actor would choose the route.
      if (new Set(forward.map(t => t.nextStatusId)).size > 1) {
        errors.add(`ขั้นตอนอนุมัติที่สถานะ ${current} มีปลายทางขัดแย้งกัน ตรวจบัญชีซ้ำ=${recheck}`);
      }
      for (const t of forward) walk(t.nextStatusId);
      visiting.delete(current);
      visited.add(current);
    };
    walk(initialStatusId);
  }
  if (!transitions.length) errors.add('ยังไม่มีขั้นตอนใน Workflow');
  if (transitions.some(t => !reachable.has(t.currentStatusId))) {
    warnings.push('มี transition บางรายการที่ไม่สามารถเดินทางถึงจากสถานะเริ่มต้นได้');
  }
  return { valid: errors.size === 0, errors: [...errors], warnings, reachableStatusIds: [...reachable] };
}

export async function validateWorkflowVersion(db: Db, versionId: number) {
  const [version, initial, terminals] = await Promise.all([
    db.workflowVersion.findUnique({
      where: { id: versionId },
      include: { transitions: { include: { action: { select: { actionName: true } } } } },
    }),
    db.status.findFirst({ where: { isInitialState: true }, select: { id: true } }),
    db.status.findMany({ where: { code: { in: ['CLOSED', 'REJECTED', 'REVISION'] } }, select: { id: true, code: true } }),
  ]);
  if (!version) return { valid: false, errors: ['ไม่พบ Workflow Version'], warnings: [] };
  if (!initial) return { valid: false, errors: ['ไม่พบสถานะเริ่มต้น'], warnings: [] };
  return validateWorkflowTransitions(version.transitions, initial.id,
    terminals.map((s: { id: number }) => s.id),
    terminals.filter((s: { code: string }) => s.code === 'CLOSED').map((s: { id: number }) => s.id));
}

export async function simulateWorkflow(db: Db, versionId: number, requiresAccountRecheck: boolean) {
  const version = await db.workflowVersion.findUnique({
    where: { id: versionId },
    include: {
      transitions: {
        include: {
          currentStatus: { select: { id: true, code: true, displayName: true } },
          nextStatus: { select: { id: true, code: true, displayName: true } },
          action: { select: { actionName: true, displayName: true } },
          requiredRole: { select: { roleName: true } },
        },
        orderBy: [{ stepSequence: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (!version) return { valid: false, errors: ['ไม่พบ Workflow Version'], path: [] };
  const initial = await db.status.findFirst({ where: { isInitialState: true }, select: { id: true, code: true, displayName: true } });
  if (!initial) return { valid: false, errors: ['ไม่พบสถานะเริ่มต้น'], path: [] };
  const terminals = await db.status.findMany({
    where: { code: { in: ['CLOSED', 'REJECTED', 'REVISION'] } }, select: { id: true, code: true },
  });
  const validation = validateWorkflowTransitions(version.transitions, initial.id,
    terminals.map((s: { id: number }) => s.id),
    terminals.filter((s: { code: string }) => s.code === 'CLOSED').map((s: { id: number }) => s.id));
  if (!validation.valid) return { ...validation, path: [], versionId, requiresAccountRecheck };
  const path: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  let current = initial.id;
  const seen = new Set<number>();
  for (let i = 0; i <= version.transitions.length; i++) {
    const outgoing = version.transitions.filter((t: any) => t.currentStatusId === current && conditionMatches(t.conditionKey, requiresAccountRecheck));
    const chosen = outgoing.find((t: any) => t.action.actionName !== 'REJECT');
    path.push({ statusId: current, statusCode: i === 0 ? initial.code : path[path.length - 1]?.nextStatusCode, transitions: outgoing.map((t: any) => ({ id: t.id, action: t.action.actionName, nextStatusCode: t.nextStatus.code, conditionKey: t.conditionKey })) });
    if (!chosen) {
      errors.push(`ปลายทางตันที่สถานะ ${current}`);
      break;
    }
    if (chosen.nextStatus.code === 'CLOSED') {
      path.push({ transitionId: chosen.id, action: chosen.action.actionName, nextStatusCode: chosen.nextStatus.code, nextStatusId: chosen.nextStatusId, conditionKey: chosen.conditionKey });
      break;
    }
    if (seen.has(chosen.nextStatusId)) {
      errors.push(`พบลูปที่สถานะ ${chosen.nextStatus.code}`);
      break;
    }
    seen.add(current);
    path.push({ transitionId: chosen.id, action: chosen.action.actionName, nextStatusCode: chosen.nextStatus.code, nextStatusId: chosen.nextStatusId, conditionKey: chosen.conditionKey });
    current = chosen.nextStatusId;
  }
  return { valid: errors.length === 0, errors, path, versionId, requiresAccountRecheck };
}
