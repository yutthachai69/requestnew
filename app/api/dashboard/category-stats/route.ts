import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** GET /api/dashboard/category-stats - สถิติตามหมวดหมู่ (สำหรับ Welcome/Chart) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as { id?: string }).id;
  const roleName = (session.user as { roleName?: string }).roleName;

  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { requests: true } },
      },
    });

    let list = categories.map((c) => ({
      categoryId: c.id,
      categoryName: c.name,
      count: c._count.requests,
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
    console.error('GET /api/dashboard/category-stats', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
