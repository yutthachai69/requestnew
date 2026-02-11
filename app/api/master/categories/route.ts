import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/master/categories
 * คืนรายการหมวดหมู่: Admin ได้ทั้งหมด, role อื่นได้ตาม accessibleCategories
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id;
  const roleName = (session.user as { roleName?: string }).roleName;

  try {
    if (roleName === 'Admin') {
      const categories = await prisma.category.findMany({
        orderBy: { name: 'asc' },
        include: { locations: { select: { id: true, name: true } } },
      });
      return NextResponse.json(
        categories.map((c) => ({
          CategoryID: c.id,
          CategoryName: c.name,
          RequiresCCSClosing: c.requiresCCSClosing,
          locations: c.locations,
        }))
      );
    }

    if (!userId) {
      return NextResponse.json([]);
    }

    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      include: {
        accessibleCategories: {
          orderBy: { name: 'asc' },
          include: { locations: { select: { id: true, name: true } } },
        },
      },
    });

    if (!user) return NextResponse.json([]);

    const list = user.accessibleCategories.map((c) => ({
      CategoryID: c.id,
      CategoryName: c.name,
      RequiresCCSClosing: c.requiresCCSClosing,
      locations: c.locations,
    }));

    return NextResponse.json(list);
  } catch (e) {
    console.error('GET /api/master/categories', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
