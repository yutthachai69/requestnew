import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDepartmentFilter } from '@/lib/get-department-filter';
import { handleApiError } from '@/lib/api-error';
import { buildDateRangeFilter, isValidDateInput } from '@/lib/date-range';

/** GET /api/dashboard/report-data - ข้อมูลรายงาน (filter ตาม role + วันที่) */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = auth.id;
  const roleName = auth.roleName;

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  if (startDate && !isValidDateInput(startDate)) {
    return NextResponse.json({ error: 'Invalid startDate' }, { status: 400 });
  }
  if (endDate && !isValidDateInput(endDate)) {
    return NextResponse.json({ error: 'Invalid endDate' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};
  const createdAt = buildDateRangeFilter(startDate, endDate);
  if (createdAt) where.createdAt = createdAt;

  try {
    // ─── 1) หา department filter (2 round trips แทน 3 เดิม) ───
    const roleFilter = await getDepartmentFilter(userId, roleName);
    Object.assign(where, roleFilter);

    // ─── 2) ยิง query ทั้งหมดพร้อมกัน (1 round trip) ───
    // ไม่ต้อง count() แยก เพราะ sum จาก byStatus ได้เลย
    const [byStatus, byCategory] = await Promise.all([
      prisma.iTRequestF07.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      prisma.iTRequestF07.groupBy({
        by: ['categoryId'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);

    // ─── 3) ดึงชื่อ category (1 round trip) ───
    const catIds = byCategory.map((b) => b.categoryId);
    const categories = catIds.length > 0
      ? await prisma.category.findMany({
        where: { id: { in: catIds } },
        select: { id: true, name: true },
      })
      : [];
    const categoryNames = Object.fromEntries(categories.map((c) => [c.id, c.name]));

    // ─── สรุปผล ───
    const totalRequests = byStatus.reduce((sum, s) => sum + s._count.id, 0);
    const completed = byStatus.find((s) => s.status === 'APPROVED')?._count.id ?? 0;
    const rejected = byStatus.find((s) => s.status === 'REJECTED')?._count.id ?? 0;

    return NextResponse.json({
      summary: {
        totalRequests,
        completedRequests: completed,
        rejectedRequests: rejected,
        avgCompletionHours: null,
      },
      byStatus: byStatus.map((s) => ({ StatusName: s.status, count: s._count.id })),
      byCategory: byCategory.map((b) => ({
        categoryId: b.categoryId,
        categoryName: categoryNames[b.categoryId] ?? '—',
        count: b._count.id,
      })),
    });
  } catch (e) {
    return handleApiError(e, 'GET /api/dashboard/report-data');
  }
}
