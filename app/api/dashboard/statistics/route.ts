import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPendingTasksCount } from '@/lib/pending-tasks-count';
import { approverRoles } from '@/lib/auth-constants';
import { getDepartmentFilter } from '@/lib/get-department-filter';

/** GET /api/dashboard/statistics - สถิติรวม (Admin: ทั้งระบบ, Approver: ตามแผนก+AuditLog, Requester: ของตัวเอง) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = Number((session.user as { id?: string }).id);
  const roleName = (session.user as { roleName?: string }).roleName;
  const isApprover = !!roleName && approverRoles.includes(roleName);

  try {
    // ─── 1) Department filter + pending count + AuditLog counts (parallel) ───
    const [roleFilter, pendingRequestCount, ...auditResults] = await Promise.all([
      getDepartmentFilter(userId, roleName),
      getPendingTasksCount(userId, roleName),
      // AuditLog counts (เฉพาะ approver)
      ...(isApprover
        ? [
          prisma.auditLog.findMany({
            where: { userId, action: { in: ['APPROVE', 'IT_PROCESS', 'CONFIRM_COMPLETE'] }, requestId: { not: null } },
            select: { requestId: true },
            distinct: ['requestId'],
          }),
          prisma.auditLog.findMany({
            where: { userId, action: 'REJECT', requestId: { not: null } },
            select: { requestId: true },
            distinct: ['requestId'],
          }),
        ]
        : []),
    ]);

    const approvedCount = auditResults[0]?.length ?? 0;
    const rejectedCount = auditResults[1]?.length ?? 0;

    // ─── 2) Main data queries (parallel — 1 round trip) ───
    const baseFilter: Record<string, unknown> = { ...roleFilter };
    const [totalRequests, byStatus, byCategory] = await Promise.all([
      prisma.iTRequestF07.count({ where: baseFilter }),
      prisma.iTRequestF07.groupBy({
        by: ['status'],
        where: baseFilter,
        _count: { id: true },
      }),
      prisma.iTRequestF07.groupBy({
        by: ['categoryId'],
        where: baseFilter,
        _count: { id: true },
      }),
    ]);

    // ─── 3) Category names (1 round trip — skip ถ้าไม่มี category) ───
    const catIds = byCategory.map((b) => b.categoryId);
    const categories = catIds.length > 0
      ? await prisma.category.findMany({
        where: { id: { in: catIds } },
        select: { id: true, name: true },
      })
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
      // แทนที่ APPROVED/REJECTED counts ด้วยค่าจาก AuditLog
      statusCounts = statusCounts.map((s) => {
        if (s.status === 'APPROVED') return { ...s, count: approvedCount };
        if (s.status === 'REJECTED') return { ...s, count: rejectedCount };
        return s;
      });
      if (!statusCounts.some((s) => s.status === 'APPROVED') && approvedCount > 0) {
        statusCounts.push({ status: 'APPROVED', count: approvedCount });
      }
      if (!statusCounts.some((s) => s.status === 'REJECTED') && rejectedCount > 0) {
        statusCounts.push({ status: 'REJECTED', count: rejectedCount });
      }
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
