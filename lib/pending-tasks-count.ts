import { prisma } from './prisma';
import { approverRoles, getCanonicalRoleNamesForApprover, getUserRoleNamesForWorkflowRole } from './auth-constants';

/**
 * นับจำนวนคำร้องที่รอให้ user นี้เป็นผู้อนุมัติ/ดำเนินการ (logic เดียวกับ GET /api/pending-tasks)
 * ใช้แสดงตัวเลขบน Dashboard ให้ตรงกับหน้ารายการที่ต้องอนุมัติ
 */
export async function getPendingTasksCount(userId: number, roleName: string | undefined): Promise<number> {
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, departmentId: true },
  });
  if (!currentUser) return 0;

  if (roleName === 'Admin') {
    return 0;
  }

  if (!roleName || !approverRoles.includes(roleName)) return 0;

  const canonicalRoleNames = getCanonicalRoleNamesForApprover(roleName);
  const roles = await prisma.role.findMany({
    where: { roleName: { in: canonicalRoleNames } },
    select: { id: true },
  });
  const roleIds = roles.map((r) => r.id);
  if (roleIds.length === 0) return 0;

  const transitions = await prisma.workflowTransition.findMany({
    where: { requiredRoleId: { in: roleIds } },
    select: { categoryId: true, currentStatusId: true, filterByDepartment: true, stepSequence: true },
  });

  const allCategoryIdsForMapping = new Set(transitions.map((t) => t.categoryId));
  const specialMap = new Map<string, number>();
  try {
    const stepsForMapping = await prisma.workflowStep.findMany({ select: { categoryId: true } });
    stepsForMapping.forEach((s) => allCategoryIdsForMapping.add(s.categoryId));
    const mappings =
      (await (prisma as { specialApproverMapping?: { findMany: (args: { where: { categoryId: { in: number[] } }; select: { categoryId: true; stepSequence: true; userId: true } }) => Promise<{ categoryId: number; stepSequence: number; userId: number }[]> } })
        .specialApproverMapping?.findMany({
          where: { categoryId: { in: [...allCategoryIdsForMapping] } },
          select: { categoryId: true, stepSequence: true, userId: true },
        })) ?? [];
    mappings.forEach((m) => specialMap.set(`${m.categoryId}-${m.stepSequence}`, m.userId));
  } catch {
    // ignore
  }

  const myTransitions = transitions.filter((t) => {
    const key = `${t.categoryId}-${t.stepSequence}`;
    const specialUserId = specialMap.get(key);
    if (specialUserId != null) return specialUserId === userId;
    return true;
  });

  const closedStatusIds = await prisma.status
    .findMany({ where: { code: { in: ['CLOSED', 'REJECTED'] } }, select: { id: true } })
    .then((r) => r.map((s) => s.id));

  const countedIds = new Set<number>();

  if (myTransitions.length > 0) {
    const statusIdsByCategory = new Map<number, Set<number>>();
    for (const t of myTransitions) {
      if (!statusIdsByCategory.has(t.categoryId)) statusIdsByCategory.set(t.categoryId, new Set());
      statusIdsByCategory.get(t.categoryId)!.add(t.currentStatusId);
    }
    const categoryIds = [...statusIdsByCategory.keys()];
    const transitionKey = (catId: number, statusId: number) => `${catId}-${statusId}`;
    const transitionByKey = new Map<string, { filterByDepartment: boolean }>();
    myTransitions.forEach((t) => {
      const key = transitionKey(t.categoryId, t.currentStatusId);
      if (!transitionByKey.has(key)) transitionByKey.set(key, { filterByDepartment: t.filterByDepartment });
    });
    const allPending = await prisma.iTRequestF07.findMany({
      where: {
        categoryId: { in: categoryIds },
        currentStatusId: { notIn: closedStatusIds.length ? closedStatusIds : [0] },
      },
      select: { id: true, categoryId: true, currentStatusId: true, departmentId: true },
    });
    allPending.forEach((r) => {
      const key = transitionKey(r.categoryId, r.currentStatusId ?? 1);
      const t = transitionByKey.get(key);
      if (t && (!t.filterByDepartment || r.departmentId === currentUser.departmentId)) countedIds.add(r.id);
    });
  }

  const steps = await prisma.workflowStep.findMany({
    select: { categoryId: true, stepSequence: true, filterByDepartment: true, approverRoleName: true },
  });
  const myStepKeys = new Set<string>();
  const stepFilterByDept = new Map<string, boolean>();
  for (const s of steps) {
    if (!getUserRoleNamesForWorkflowRole(s.approverRoleName).includes(roleName ?? '')) continue;
    const key = `${s.categoryId}-${s.stepSequence}`;
    myStepKeys.add(key);
    stepFilterByDept.set(key, (s as { filterByDepartment?: boolean }).filterByDepartment ?? false);
  }
  if (myStepKeys.size > 0) {
    const stepCategoryIds = [...new Set(steps.map((s) => s.categoryId))];
    const stepPending = await prisma.iTRequestF07.findMany({
      where: {
        categoryId: { in: stepCategoryIds },
        status: { notIn: ['CLOSED', 'REJECTED'] },
      },
      select: { id: true, categoryId: true, departmentId: true, currentApprovalStep: true },
    });
    stepPending.forEach((r) => {
      const key = `${r.categoryId}-${(r as { currentApprovalStep?: number }).currentApprovalStep ?? 1}`;
      if (!myStepKeys.has(key) || countedIds.has(r.id)) return;
      const filterDept = stepFilterByDept.get(key);
      if (filterDept && r.departmentId !== currentUser.departmentId) return;
      const specialUserId = specialMap.get(key);
      if (specialUserId != null && specialUserId !== userId) return;
      countedIds.add(r.id);
    });
  }

  return countedIds.size;
}
