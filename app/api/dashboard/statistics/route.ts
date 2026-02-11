import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPendingTasksCount } from '@/lib/pending-tasks-count';

/** GET /api/dashboard/statistics - สถิติรวม (Admin: ทั้งระบบ, คนอื่น: ตามสิทธิ์) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = Number((session.user as { id?: string }).id);
  const roleName = (session.user as { roleName?: string }).roleName;

  try {
    const [pendingRequestCount, totalRequests, byStatus, byCategory] = await Promise.all([
      getPendingTasksCount(userId, roleName),
      prisma.iTRequestF07.count(),
      prisma.iTRequestF07.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      prisma.iTRequestF07.groupBy({
        by: ['categoryId'],
        _count: { id: true },
      }),
    ]);

    const categories = await prisma.category.findMany({
      where: { id: { in: byCategory.map((b) => b.categoryId) } },
      select: { id: true, name: true },
    });
    const categoryNames = Object.fromEntries(categories.map((c) => [c.id, c.name]));

    const requestCountByCategory = byCategory.map((b) => ({
      categoryId: b.categoryId,
      categoryName: categoryNames[b.categoryId] ?? '—',
      count: b._count.id,
    }));

    const result = {
      pendingRequestCount,
      totalRequests,
      averageApprovalTimeInHours: null as number | null,
      requestCountByCategory,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
    };

    return NextResponse.json(result);
  } catch (e) {
    console.error('GET /api/dashboard/statistics', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
