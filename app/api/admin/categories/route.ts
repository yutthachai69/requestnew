import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** GET /api/admin/categories - list all (Admin) */
export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
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
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
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
