import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { approverRoles, getCanonicalRoleNamesForApprover } from '@/lib/auth-constants';

/**
 * GET /api/dashboard/statistics
 * Inlines getDepartmentFilter + getPendingTasksCount logic to fetch user+roles ONCE
 * แทนที่จะเรียก 2 helper functions ที่ต่างคน ต่าง query user+roles ซ้ำกัน
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = Number((session.user as { id?: string }).id);
  const roleName = (session.user as { roleName?: string }).roleName;
  const isAdmin = roleName === 'Admin';
  const isApprover = !!roleName && approverRoles.includes(roleName);

  try {
    // ─── Round 1: parallel — user + roles + auditLogs ───
    const canonicalNames = isApprover ? getCanonicalRoleNamesForApprover(roleName!) : [];

    const [currentUser, matchingRoles, approvedLogs, rejectedLogs] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } }),
      canonicalNames.length > 0
        ? prisma.role.findMany({ where: { roleName: { in: canonicalNames } }, select: { id: true } })
        : Promise.resolve([]),
      isApprover
        ? prisma.auditLog.findMany({
          where: { userId, action: { in: ['APPROVE', 'IT_PROCESS', 'CONFIRM_COMPLETE'] }, requestId: { not: null } },
          select: { requestId: true },
          distinct: ['requestId'],
        })
        : Promise.resolve([]),
      isApprover
        ? prisma.auditLog.findMany({
          where: { userId, action: 'REJECT', requestId: { not: null } },
          select: { requestId: true },
          distinct: ['requestId'],
        })
        : Promise.resolve([]),
    ]);

    const roleIds = matchingRoles.map((r) => r.id);
    const approvedCount = approvedLogs.length;
    const rejectedCount = rejectedLogs.length;

    // ─── Round 2: transitions (ต้องรอ roleIds) ───
    const transitions = roleIds.length > 0
      ? await prisma.workflowTransition.findMany({
        where: { requiredRoleId: { in: roleIds } },
        select: { categoryId: true, currentStatusId: true, filterByDepartment: true },
      })
      : [];

    // ─── คำนวณ departmentFilter และ pendingCount จาก transitions ชุดเดียวกัน ───
    const hasDeptFilter = transitions.some((t) => t.filterByDepartment);
    const deptId = hasDeptFilter ? currentUser?.departmentId : undefined;

    // baseFilter สำหรับ main queries
    let baseFilter: Record<string, unknown> = {};
    if (isAdmin) {
      baseFilter = {};
    } else if (isApprover) {
      if (deptId) baseFilter = { departmentId: deptId };
    } else {
      baseFilter = { requesterId: userId };
    }

    // pendingCount จาก transitions (reuse data ที่ดึงมาแล้ว)
    let pendingRequestCount = 0;
    if (isApprover && transitions.length > 0) {
      const orConditions = transitions.map((t) => ({
        categoryId: t.categoryId,
        currentStatusId: t.currentStatusId,
        ...(t.filterByDepartment && deptId ? { departmentId: deptId } : {}),
      }));
      pendingRequestCount = await prisma.iTRequestF07.count({
        where: { status: { notIn: ['CLOSED', 'REJECTED'] }, OR: orConditions },
      });
    }

    // ─── Round 3: main queries (parallel) ───
    const [totalRequests, byStatus, byCategory] = await Promise.all([
      prisma.iTRequestF07.count({ where: baseFilter }),
      prisma.iTRequestF07.groupBy({ by: ['status'], where: baseFilter, _count: { id: true } }),
      prisma.iTRequestF07.groupBy({ by: ['categoryId'], where: baseFilter, _count: { id: true } }),
    ]);

    // ─── Round 4: category names (1 query) ───
    const catIds = byCategory.map((b) => b.categoryId);
    const categories = catIds.length > 0
      ? await prisma.category.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } })
      : [];
    const categoryNames = Object.fromEntries(categories.map((c) => [c.id, c.name]));

    const requestCountByCategory = byCategory.map((b) => ({
      categoryId: b.categoryId,
      categoryName: categoryNames[b.categoryId] ?? '—',
      count: b._count.id,
    }));

    // ─── สร้าง status counts ───
    let statusCounts = byStatus.map((s) => ({ status: s.status, count: s._count.id }));
    if (isApprover) {
      statusCounts = statusCounts.map((s) => {
        if (s.status === 'APPROVED') return { ...s, count: approvedCount };
        if (s.status === 'REJECTED') return { ...s, count: rejectedCount };
        return s;
      });
      if (!statusCounts.some((s) => s.status === 'APPROVED') && approvedCount > 0)
        statusCounts.push({ status: 'APPROVED', count: approvedCount });
      if (!statusCounts.some((s) => s.status === 'REJECTED') && rejectedCount > 0)
        statusCounts.push({ status: 'REJECTED', count: rejectedCount });
    }

    return NextResponse.json({
      pendingRequestCount,
      totalRequests,
      averageApprovalTimeInHours: null as number | null,
      requestCountByCategory,
      byStatus: statusCounts,
    });
  } catch (e) {
    console.error('GET /api/dashboard/statistics', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
