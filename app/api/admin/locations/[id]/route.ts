import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** PUT /api/admin/locations/[id] */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    const body = await request.json();
    const name = body.locationName != null ? String(body.locationName).trim() : undefined;
    const categoryIds = body.categoryIds !== undefined
      ? (Array.isArray(body.categoryIds) ? body.categoryIds.map((id: unknown) => Number(id)).filter((n: number) => n > 0) : [])
      : undefined;
    const data: { name?: string; categories?: { set: { id: number }[] } } = {};
    if (name !== undefined) data.name = name;
    if (categoryIds !== undefined) data.categories = { set: categoryIds.map((id: number) => ({ id })) };
    if (Object.keys(data).length === 0) return NextResponse.json({ message: 'ไม่มีข้อมูลที่จะอัปเดต' }, { status: 400 });
    const updated = await prisma.location.update({
      where: { id },
      data,
      include: { categories: { select: { id: true, name: true } } },
    });
    return NextResponse.json({
      LocationID: updated.id,
      LocationName: updated.name,
      CategoryIDs: updated.categories.map((c) => c.id),
      CategoryNames: updated.categories.map((c) => c.name),
    });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025')
      return NextResponse.json({ message: 'ไม่พบสถานที่' }, { status: 404 });
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002')
      return NextResponse.json({ message: 'ชื่อสถานที่ซ้ำ' }, { status: 400 });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

/** DELETE /api/admin/locations/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    await prisma.location.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025')
      return NextResponse.json({ message: 'ไม่พบสถานที่' }, { status: 404 });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
