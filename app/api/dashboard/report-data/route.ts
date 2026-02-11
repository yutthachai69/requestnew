import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** GET /api/dashboard/report-data - ข้อมูลรายงาน (filter: startDate, endDate) */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const where: { createdAt?: { gte?: Date; lte?: Date } } = {};
  if (startDate) where.createdAt = { ...where.createdAt, gte: new Date(startDate) };
  if (endDate) {
    const d = new Date(endDate);
    d.setHours(23, 59, 59, 999);
    where.createdAt = { ...where.createdAt, lte: d };
  }

  try {
    const [totalRequests, byStatus, byCategory] = await Promise.all([
      prisma.iTRequestF07.count({ where: Object.keys(where).length ? where : undefined }),
      prisma.iTRequestF07.groupBy({
        by: ['status'],
        where: Object.keys(where).length ? where : undefined,
        _count: { id: true },
      }),
      prisma.iTRequestF07.groupBy({
        by: ['categoryId'],
        where: Object.keys(where).length ? where : undefined,
        _count: { id: true },
      }),
    ]);

    const categories = await prisma.category.findMany({
      where: { id: { in: byCategory.map((b) => b.categoryId) } },
      select: { id: true, name: true },
    });
    const categoryNames = Object.fromEntries(categories.map((c) => [c.id, c.name]));

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
        categoryName: categoryNames[b.categoryId] ?? '—',
        count: b._count.id,
      })),
    });
  } catch (e) {
    console.error('GET /api/dashboard/report-data', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
