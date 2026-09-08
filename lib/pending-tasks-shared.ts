/**
 * Logic ร่วมสำหรับ pending tasks (list + count) — query เบา ไม่โหลด relation ทั้งก้อน
 */
import { prisma } from '@/lib/prisma';
import { approverRoles, getCanonicalRoleNamesForApprover } from '@/lib/auth-constants';
import { conditionMatches } from '@/lib/workflow-versioning';

const APPROVAL_DONE_TYPES = ['APPROVE', 'APPROVED', 'Approve', 'IT_PROCESS', 'CONFIRM_COMPLETE'];

export type PendingTransitionMeta = {
  categoryId: number;
  workflowVersionId: number | null;
  currentStatusId: number;
  filterByDepartment: boolean;
  stepSequences: number[];
  conditionKeys: string[];
};

/** โหลด transition ที่ user นี้ดูแลได้ (รวม special approver) */
export async function getPendingTransitionMetaForUser(
  userId: number,
  roleName: string
): Promise<{
  departmentId: number | null;
  transitions: PendingTransitionMeta[];
  closedStatusIds: number[];
} | null> {
  if (roleName === 'Admin' || !approverRoles.includes(roleName)) {
    return null;
  }

  const canonicalRoleNames = getCanonicalRoleNamesForApprover(roleName);

  const [currentUser, roles, closedStatusIds, mappings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    }),
    prisma.role.findMany({
      where: { roleName: { in: canonicalRoleNames } },
      select: { id: true },
    }),
    prisma.status
      .findMany({ where: { code: { in: ['CLOSED', 'REJECTED'] } }, select: { id: true } })
      .then((r) => r.map((s) => s.id)),
    prisma.specialApproverMapping
      .findMany({ select: { categoryId: true, stepSequence: true, userId: true } })
      .catch(() => [] as { categoryId: number; stepSequence: number; userId: number }[]),
  ]);

  if (!currentUser) return null;
  const roleIds = roles.map((r) => r.id);
  if (roleIds.length === 0) return null;

  const specialMap = new Map<string, number>();
  mappings.forEach((m) => specialMap.set(`${m.categoryId}-${m.stepSequence}`, m.userId));

  const rawTransitions = await prisma.workflowTransition.findMany({
    where: { requiredRoleId: { in: roleIds } },
    select: {
      categoryId: true,
      workflowVersionId: true,
      currentStatusId: true,
      filterByDepartment: true,
      stepSequence: true,
      conditionKey: true,
    },
  });

  const myTransitions = rawTransitions.filter((t) => {
    const key = `${t.categoryId}-${t.stepSequence}`;
    const specialUserId = specialMap.get(key);
    if (specialUserId != null) return specialUserId === userId;
    return true;
  });

  if (myTransitions.length === 0) return null;

  const byKey = new Map<string, PendingTransitionMeta>();
  for (const t of myTransitions) {
    const key = `${t.categoryId}-${t.currentStatusId}-${t.workflowVersionId ?? 0}`;
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.stepSequences.includes(t.stepSequence)) {
        existing.stepSequences.push(t.stepSequence);
      }
      if (t.conditionKey && !existing.conditionKeys.includes(t.conditionKey)) existing.conditionKeys.push(t.conditionKey);
    } else {
      byKey.set(key, {
        categoryId: t.categoryId,
        workflowVersionId: t.workflowVersionId,
        currentStatusId: t.currentStatusId,
        filterByDepartment: t.filterByDepartment,
        stepSequences: [t.stepSequence],
        conditionKeys: [t.conditionKey || 'ALWAYS'],
      });
    }
  }

  return {
    departmentId: currentUser.departmentId,
    transitions: [...byKey.values()],
    closedStatusIds,
  };
}

/** นับคำร้องที่รอดำเนินการ (ไม่นับที่ user อนุมัติขั้นนั้นแล้ว) */
export async function countPendingTasksForUser(userId: number, roleName: string): Promise<number> {
  const meta = await getPendingTransitionMetaForUser(userId, roleName);
  if (!meta || meta.transitions.length === 0) return 0;

  const categoryIds = [...new Set(meta.transitions.map((t) => t.categoryId))];
  const transitionByKey = new Map<string, PendingTransitionMeta>();
  meta.transitions.forEach((t) => {
    transitionByKey.set(`${t.categoryId}-${t.currentStatusId}-${t.workflowVersionId ?? 0}`, t);
  });

  const candidates = await prisma.iTRequestF07.findMany({
    where: {
      categoryId: { in: categoryIds },
      currentStatusId: { notIn: meta.closedStatusIds.length ? meta.closedStatusIds : [0] },
    },
    select: { id: true, categoryId: true, workflowVersionId: true, requiresAccountRecheck: true, approvalRound: true, currentStatusId: true, departmentId: true },
  });

  const matched = candidates.filter((r) => {
    const key = `${r.categoryId}-${r.currentStatusId ?? 1}-${r.workflowVersionId ?? 0}`;
    const t = transitionByKey.get(key);
    if (!t) return false;
    if (t.filterByDepartment && r.departmentId !== meta.departmentId) return false;
    if (!t.conditionKeys.some((key) => conditionMatches(key, r.requiresAccountRecheck))) return false;
    return true;
  });

  if (matched.length === 0) return 0;

  const histories = await prisma.approvalHistory.findMany({
    where: {
      requestId: { in: matched.map((m) => m.id) },
      approverId: userId,
      actionType: { in: APPROVAL_DONE_TYPES },
    },
    select: { requestId: true, approvalRound: true, approvalLevel: true },
  });

  const roundByRequest = new Map(matched.map((r) => [r.id, r.approvalRound]));
  const done = new Set(histories
    .filter((h) => h.approvalRound === roundByRequest.get(h.requestId))
    .map((h) => `${h.requestId}-${Number(h.approvalLevel)}`));

  return matched.filter((r) => {
    const key = `${r.categoryId}-${r.currentStatusId ?? 1}-${r.workflowVersionId ?? 0}`;
    const t = transitionByKey.get(key);
    if (!t) return false;
    if (!t.conditionKeys.some((condition) => conditionMatches(condition, r.requiresAccountRecheck))) return false;
    return t.stepSequences.some((seq) => !done.has(`${r.id}-${seq}`));
  }).length;
}
