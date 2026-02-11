import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** GET /api/admin/locations - list all locations */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const list = await prisma.location.findMany({
      orderBy: { id: 'asc' },
      include: { categories: { select: { id: true, name: true } } },
    });
    return NextResponse.json(
      list.map((l) => ({
        LocationID: l.id,
        LocationName: l.name,
        CategoryIDs: l.categories.map((c) => c.id),
        CategoryNames: l.categories.map((c) => c.name),
      }))
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** POST /api/admin/locations - create location */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const body = await request.json();
    const name = String(body.locationName ?? body.name ?? '').trim();
    if (!name) return NextResponse.json({ message: 'กรุณาระบุชื่อสถานที่' }, { status: 400 });
    const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds.map((id: unknown) => Number(id)).filter((n: number) => n > 0) : [];
    const created = await prisma.location.create({
      data: {
        name,
        categories: categoryIds.length ? { connect: categoryIds.map((id: number) => ({ id })) } : undefined,
      },
      include: { categories: { select: { id: true, name: true } } },
    });
    return NextResponse.json({
      LocationID: created.id,
      LocationName: created.name,
      CategoryIDs: created.categories.map((c) => c.id),
      CategoryNames: created.categories.map((c) => c.name),
    });
  } catch (e: unknown) {
    const msg =
      e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002'
        ? 'ชื่อสถานที่ซ้ำ'
        : 'Server error';
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
