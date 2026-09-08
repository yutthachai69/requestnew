import { prisma } from '@/lib/prisma';
import { approverRoles } from '@/lib/auth-constants';
import { buildDateRangeFilter } from '@/lib/date-range';
import { getRoleScopedRequestIds } from '@/lib/request-scope';

export type DashboardStatsResult = {
  totalRequests: number;
  averageApprovalTimeInHours: number | null;
  requestCountByCategory: { categoryId: number; categoryName: string; count: number }[];
  byStatus: { status: string; count: number }[];
};

export async function fetchDashboardStatistics(
  userId: number,
  roleName: string | null | undefined,
  dateRange?: { startDate?: string; endDate?: string }
): Promise<DashboardStatsResult> {
  const isAdmin = roleName === 'Admin';
  const isApprover = !!roleName && approverRoles.includes(roleName);

  const dateFilter = buildDateRangeFilter(dateRange?.startDate, dateRange?.endDate);

  let totalRequests: number;
  let byStatus: { status: string | null; _count: { id: number } }[];
  let byCategory: { categoryId: number; _count: { id: number } }[];

  if (isApprover && !isAdmin) {
    // ผู้อนุมัติ/ผู้ดำเนินการเห็นเฉพาะงานที่กำลังอยู่ในขั้นของตนเอง
    // และงานที่เคยดำเนินการแล้ว ไม่รวมใบงานทั้งแผนกแบบเดิม
    const scoped = await getRoleScopedRequestIds(userId, roleName, dateFilter);
    const rows = scoped && scoped.allIds.length > 0
      ? await prisma.iTRequestF07.findMany({
          where: { id: { in: scoped.allIds }, ...(dateFilter ? { createdAt: dateFilter } : {}) },
          select: { status: true, categoryId: true },
        })
      : [];

    totalRequests = rows.length;
    const statusMap = new Map<string, number>();
    const categoryMap = new Map<number, number>();
    for (const row of rows) {
      const status = row.status ?? '';
      statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
      categoryMap.set(row.categoryId, (categoryMap.get(row.categoryId) ?? 0) + 1);
    }
    byStatus = [...statusMap.entries()].map(([status, count]) => ({ status, _count: { id: count } }));
    byCategory = [...categoryMap.entries()].map(([categoryId, count]) => ({ categoryId, _count: { id: count } }));
  } else {
    const baseFilter: Record<string, unknown> = isAdmin ? {} : { requesterId: userId };
    if (dateFilter) baseFilter.createdAt = dateFilter;

    [totalRequests, byStatus, byCategory] = await Promise.all([
      prisma.iTRequestF07.count({ where: baseFilter }),
      prisma.iTRequestF07.groupBy({ by: ['status'], where: baseFilter, _count: { id: true } }),
      prisma.iTRequestF07.groupBy({ by: ['categoryId'], where: baseFilter, _count: { id: true } }),
    ]);
  }

  const catIds = byCategory.map((b) => b.categoryId);
  const categories =
    catIds.length > 0
      ? await prisma.category.findMany({
          where: { id: { in: catIds } },
          select: { id: true, name: true },
        })
      : [];
  const categoryNames = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  return {
    totalRequests,
    averageApprovalTimeInHours: null,
    requestCountByCategory: byCategory.map((b) => ({
      categoryId: b.categoryId,
      categoryName: categoryNames[b.categoryId] ?? '—',
      count: b._count.id,
    })),
    byStatus: byStatus.map((s) => ({ status: s.status ?? '', count: s._count.id })),
  };
}
