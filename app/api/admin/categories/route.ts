import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** GET /api/admin/categories - list all (Admin) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const list = await prisma.category.findMany({
      orderBy: { id: 'asc' },
      include: { locations: { select: { id: true, name: true } } },
    });
    return NextResponse.json(
      list.map((c) => ({
        CategoryID: c.id,
        CategoryName: c.name,
        RequiresCCSClosing: c.requiresCCSClosing,
        locations: c.locations,
      }))
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** POST /api/admin/categories */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const body = await request.json();
    const name = String(body.name ?? body.CategoryName ?? '').trim();
    if (!name) return NextResponse.json({ message: 'กรุณาระบุชื่อหมวดหมู่' }, { status: 400 });
    const requiresCCSClosing = Boolean(body.requiresCCSClosing);
    const created = await prisma.category.create({
      data: { name, requiresCCSClosing },
    });
    return NextResponse.json({
      CategoryID: created.id,
      CategoryName: created.name,
      RequiresCCSClosing: created.requiresCCSClosing,
    });
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002'
      ? 'ชื่อหมวดหมู่ซ้ำ'
      : 'Server error';
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
