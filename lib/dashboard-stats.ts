import { prisma } from '@/lib/prisma';
import { approverRoles } from '@/lib/auth-constants';
import { buildDateRangeFilter } from '@/lib/date-range';

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

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true, accessibleCategories: { select: { id: true } } },
  });

  let baseFilter: Record<string, unknown> = {};
  if (isAdmin) {
    baseFilter = {};
  } else if (isApprover) {
    const allowedCategories = currentUser?.accessibleCategories?.map((c) => c.id) || [];
    const orClauses: Record<string, unknown>[] = [];
    if (currentUser?.departmentId) orClauses.push({ departmentId: currentUser.departmentId });
    if (allowedCategories.length > 0) orClauses.push({ categoryId: { in: allowedCategories } });
    baseFilter = orClauses.length > 0 ? { OR: orClauses } : { requesterId: userId };
  } else {
    baseFilter = { requesterId: userId };
  }

  if (dateFilter) {
    baseFilter.createdAt = dateFilter;
  }

  const [totalRequests, byStatus, byCategory] = await Promise.all([
    prisma.iTRequestF07.count({ where: baseFilter }),
    prisma.iTRequestF07.groupBy({ by: ['status'], where: baseFilter, _count: { id: true } }),
    prisma.iTRequestF07.groupBy({ by: ['categoryId'], where: baseFilter, _count: { id: true } }),
  ]);

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
