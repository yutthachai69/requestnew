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
    // Admin / Requester: ไม่มีรายการที่ต้องอนุมัติ
    if (roleName === 'Admin') return NextResponse.json({ requests: [] });
    if (!roleName || !approverRoles.includes(roleName)) return NextResponse.json({ requests: [] });

    const canonicalRoleNames = getCanonicalRoleNamesForApprover(roleName);

    // ─── Round 1: parallel — ดึง user, roles, workflowSteps พร้อมกัน ───
    const [currentUser, roles, allSteps] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, departmentId: true },
      }),
      prisma.role.findMany({
        where: { roleName: { in: canonicalRoleNames } },
        select: { id: true },
      }),
      // ดึง workflowStep ครั้งเดียว — ใช้ทั้ง specialApproverMapping และ step-based filter
      prisma.workflowStep.findMany({
        select: { categoryId: true, stepSequence: true, approverRoleName: true, filterByDepartment: true },
      }),
    ]);

    if (!currentUser) return NextResponse.json({ error: 'User not found' }, { status: 403 });
    const roleIds = roles.map((r) => r.id);
    if (roleIds.length === 0) return NextResponse.json({ requests: [] });

    // ─── Round 2: parallel — transitions + specialApproverMapping ───
    const allCategoryIds = [...new Set(allSteps.map((s) => s.categoryId))];
    const [transitions, mappings] = await Promise.all([
      prisma.workflowTransition.findMany({
        where: { requiredRoleId: { in: roleIds } },
        select: { categoryId: true, currentStatusId: true, filterByDepartment: true, stepSequence: true },
      }),
      (async () => {
        try {
          return await (prisma as unknown as { specialApproverMapping?: { findMany: (args: { where: { categoryId: { in: number[] } }; select: { categoryId: true; stepSequence: true; userId: true } }) => Promise<{ categoryId: number; stepSequence: number; userId: number }[]> } })
            .specialApproverMapping?.findMany({
              where: { categoryId: { in: allCategoryIds } },
              select: { categoryId: true, stepSequence: true, userId: true },
            }) ?? [];
        } catch { return []; }
      })(),
    ]);

    // Build specialMap from already-fetched mappings
    const specialMap = new Map<string, number>();
    (mappings as { categoryId: number; stepSequence: number; userId: number }[])
      .forEach((m) => specialMap.set(`${m.categoryId}-${m.stepSequence}`, m.userId));

    // Filter transitions by specialApproverMapping
    const myTransitions = transitions.filter((t) => {
      const key = `${t.categoryId}-${t.stepSequence}`;
      const specialUserId = specialMap.get(key);
      if (specialUserId != null) return specialUserId === userId;
      return true;
    });

    const closedStatusIds = await prisma.status.findMany({
      where: { code: { in: ['CLOSED', 'REJECTED'] } },
      select: { id: true },
    }).then((r) => r.map((s) => s.id));

    const includeOpts = {
      department: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      requester: { select: { id: true, fullName: true, username: true } },
      currentStatus: { select: { id: true, code: true, displayName: true } },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let requests: any[] = [];
    const seenIds = new Set<number>();

    // ─── Transition-based matching ───
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
      const transitionByKey = new Map<string, { filterByDepartment: boolean }>();
      myTransitions.forEach((t) => {
        const key = `${t.categoryId}-${t.currentStatusId}`;
        if (!transitionByKey.has(key)) transitionByKey.set(key, { filterByDepartment: t.filterByDepartment });
      });
      requests = allPending.filter((r) => {
        const key = `${r.categoryId}-${r.currentStatusId ?? 1}`;
        const t = transitionByKey.get(key);
        if (!t) return false;
        if (t.filterByDepartment && r.departmentId !== currentUser.departmentId) return false;
        return true;
      });
      requests.forEach((r) => seenIds.add(r.id));
    }

    // ─── Step-based matching (reuse allSteps fetched in Round 1) ───
    const myStepKeys = new Set<string>();
    const stepFilterByDept = new Map<string, boolean>();
    for (const s of allSteps) {
      const allowed = getUserRoleNamesForWorkflowRole(s.approverRoleName).includes(roleName ?? '');
      if (!allowed) continue;
      const key = `${s.categoryId}-${s.stepSequence}`;
      myStepKeys.add(key);
      stepFilterByDept.set(key, (s as { filterByDepartment?: boolean }).filterByDepartment ?? false);
    }
    if (myStepKeys.size > 0) {
      const stepCategoryIds = [...new Set(allSteps.map((s) => s.categoryId))];
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
        const specialUserId = specialMap.get(key);
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
  status: string | null;
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
