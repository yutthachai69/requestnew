import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

/** GET /api/dashboard/category-stats?startDate=&endDate= - สถิติตามหมวดหมู่ (สำหรับ Welcome/Chart) */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = String(auth.id);
  const roleName = auth.roleName;

  // ─── Parse date filter params ───
  const { searchParams } = new URL(request.url);
  const startDateParam = searchParams.get('startDate')?.trim();
  const endDateParam = searchParams.get('endDate')?.trim();

  let dateFilter: Record<string, unknown> | undefined;
  if (startDateParam || endDateParam) {
    dateFilter = {};
    if (startDateParam) (dateFilter as any).gte = new Date(startDateParam);
    if (endDateParam) {
      const d = new Date(endDateParam);
      d.setHours(23, 59, 59, 999);
      (dateFilter as any).lte = d;
    }
  }

  try {
    // Build request filter for date range
    const requestDateFilter = dateFilter ? { createdAt: dateFilter } : {};

    // Get all categories first
    const allCategories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    // Count requests per category with date filter
    const requestCounts = await prisma.iTRequestF07.groupBy({
      by: ['categoryId'],
      where: { ...requestDateFilter },
      _count: { id: true },
    });

    const countMap = new Map(requestCounts.map(r => [r.categoryId, r._count.id]));

    let list = allCategories.map((c) => ({
      categoryId: c.id,
      categoryName: c.name,
      count: countMap.get(c.id) ?? 0,
    }));

    if (roleName !== 'Admin' && userId) {
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        include: { accessibleCategories: { select: { id: true } } },
      });
      const allowedIds = new Set((user?.accessibleCategories ?? []).map((c) => c.id));
      list = list.filter((c) => allowedIds.has(c.categoryId));
    }

    return NextResponse.json(list);
  } catch (e) {
    return handleApiError(e, 'GET /api/dashboard/category-stats');
  }
}
