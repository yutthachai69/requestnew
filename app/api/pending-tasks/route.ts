import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { approverRoles, getCanonicalRoleNamesForApprover, getUserRoleNamesForWorkflowRole } from '@/lib/auth-constants';

/**
 * GET /api/pending-tasks
 * รายการคำร้องที่รอให้ผู้ล็อกอินเป็นผู้อนุมัติ/ดำเนินการ (ตาม WorkflowTransitions + requiredRole)
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = Number((session.user as { id?: string }).id);
  const roleName = (session.user as { roleName?: string }).roleName;

  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, departmentId: true },
    });
    if (!currentUser) return NextResponse.json({ error: 'User not found' }, { status: 403 });

    // Admin: ไม่มีขั้นตอนอนุมัติ — ไม่แสดงรายการที่ต้องอนุมัติ
    if (roleName === 'Admin') {
      return NextResponse.json({ requests: [] });
    }

    if (!roleName || !approverRoles.includes(roleName)) {
      return NextResponse.json({ requests: [] });
    }

    const canonicalRoleNames = getCanonicalRoleNamesForApprover(roleName);
    const roles = await prisma.role.findMany({
      where: { roleName: { in: canonicalRoleNames } },
      select: { id: true },
    });
    const roleIds = roles.map((r) => r.id);
    if (roleIds.length === 0) return NextResponse.json({ requests: [] });

    const transitions = await prisma.workflowTransition.findMany({
      where: { requiredRoleId: { in: roleIds } },
      select: { categoryId: true, currentStatusId: true, filterByDepartment: true, stepSequence: true },
    });

    const allCategoryIdsForMapping = new Set(transitions.map((t) => t.categoryId));
    const specialMap = new Map<string, number>();
    try {
      const stepsForMapping = await prisma.workflowStep.findMany({ select: { categoryId: true } });
      stepsForMapping.forEach((s) => allCategoryIdsForMapping.add(s.categoryId));
      const mappings = await (prisma as { specialApproverMapping?: { findMany: (args: { where: { categoryId: { in: number[] } }; select: { categoryId: true; stepSequence: true; userId: true } }) => Promise<{ categoryId: number; stepSequence: number; userId: number }[]> } })
        .specialApproverMapping?.findMany({
          where: { categoryId: { in: [...allCategoryIdsForMapping] } },
          select: { categoryId: true, stepSequence: true, userId: true },
        }) ?? [];
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

    const closedStatusIds = await prisma.status.findMany({ where: { code: { in: ['CLOSED', 'REJECTED'] } }, select: { id: true } }).then((r) => r.map((s) => s.id));
    const includeOpts = {
      department: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      requester: { select: { id: true, fullName: true, username: true } },
      currentStatus: { select: { id: true, code: true, displayName: true } },
    };

    let requests: Awaited<ReturnType<typeof prisma.iTRequestF07.findMany>> = [];
    const seenIds = new Set<number>();

    if (myTransitions.length > 0) {
      const statusIdsByCategory = new Map<number, Set<number>>();
      for (const t of myTransitions) {
        if (!statusIdsByCategory.has(t.categoryId)) statusIdsByCategory.set(t.categoryId, new Set());
        statusIdsByCategory.get(t.categoryId)!.add(t.currentStatusId);
      }
      const categoryIds = [...statusIdsByCategory.keys()];
      const allPending = await prisma.iTRequestF07.findMany({
        where: {
          categoryId: { in: categoryIds },
          currentStatusId: { notIn: closedStatusIds.length ? closedStatusIds : [0] },
        },
        orderBy: { createdAt: 'desc' },
        include: includeOpts,
      });
      const transitionKey = (catId: number, statusId: number) => `${catId}-${statusId}`;
      const transitionByKey = new Map<string, { filterByDepartment: boolean }>();
      myTransitions.forEach((t) => {
        const key = transitionKey(t.categoryId, t.currentStatusId);
        if (!transitionByKey.has(key)) transitionByKey.set(key, { filterByDepartment: t.filterByDepartment });
      });
      requests = allPending.filter((r) => {
        const key = transitionKey(r.categoryId, r.currentStatusId ?? 1);
        const t = transitionByKey.get(key);
        if (!t) return false;
        if (t.filterByDepartment && r.departmentId !== currentUser.departmentId) return false;
        return true;
      });
      requests.forEach((r) => seenIds.add(r.id));
    }

    const steps = await prisma.workflowStep.findMany({
      select: { categoryId: true, stepSequence: true, filterByDepartment: true, approverRoleName: true },
    });
    const myStepKeys = new Set<string>();
    const stepFilterByDept = new Map<string, boolean>();
    for (const s of steps) {
      const allowed = getUserRoleNamesForWorkflowRole(s.approverRoleName).includes(roleName ?? '');
      if (!allowed) continue;
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
        orderBy: { createdAt: 'desc' },
        include: includeOpts,
      });
      const fromSteps = stepPending.filter((r) => {
        const key = `${r.categoryId}-${(r as { currentApprovalStep?: number }).currentApprovalStep ?? 1}`;
        if (!myStepKeys.has(key)) return false;
        if (seenIds.has(r.id)) return false;
        const filterDept = stepFilterByDept.get(key);
        if (filterDept && r.departmentId !== currentUser.departmentId) return false;
        const specialKey = `${r.categoryId}-${(r as { currentApprovalStep?: number }).currentApprovalStep ?? 1}`;
        const specialUserId = specialMap.get(specialKey);
        if (specialUserId != null && specialUserId !== userId) return false;
        return true;
      });
      requests = [...requests, ...fromSteps].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    return NextResponse.json({
      requests: requests.map((r) => toPendingItem(r)),
    });
  } catch (e) {
    console.error('GET /api/pending-tasks', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

function toPendingItem(r: {
  id: number;
  workOrderNo: string | null;
  thaiName?: string;
  problemDetail: string;
  status: string;
  createdAt: Date;
  approvalToken: string | null;
  currentStatusId?: number;
  department: { id: number; name: string };
  category: { id: number; name: string };
  location: { id: number; name: string };
  requester: { id: number; fullName: string; username: string };
  currentStatus?: { id: number; code: string; displayName: string };
}) {
  return {
    id: r.id,
    workOrderNo: r.workOrderNo,
    RequestNumber: r.workOrderNo,
    thaiName: r.thaiName ?? r.requester?.fullName,
    problemDetail: r.problemDetail,
    status: r.status,
    currentStatusId: r.currentStatusId ?? 1,
    currentStatus: r.currentStatus,
    currentApprovalStep: 1,
    approvalToken: r.approvalToken,
    createdAt: r.createdAt,
    department: r.department,
    category: r.category,
    location: r.location,
    requester: r.requester,
  };
}
