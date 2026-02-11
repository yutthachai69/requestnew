import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** PUT /api/admin/correction-reasons/[id] */
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
    const text = body.text != null ? String(body.text).trim() : undefined;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;
    const data: { text?: string; isActive?: boolean } = {};
    if (text !== undefined) data.text = text;
    if (isActive !== undefined) data.isActive = isActive;
    const updated = await prisma.correctionReason.update({
      where: { id },
      data,
    });
    return NextResponse.json({
      ReasonID: updated.id,
      Text: updated.text,
      IsActive: updated.isActive,
    });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'P2025') return NextResponse.json({ message: 'ไม่พบเหตุผลการแก้ไข' }, { status: 404 });
    console.error('PUT /api/admin/correction-reasons/[id]', e);
    return NextResponse.json({ message: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' }, { status: 500 });
  }
}

/** DELETE /api/admin/correction-reasons/[id] */
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
    await prisma.correctionReason.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'P2025') return NextResponse.json({ message: 'ไม่พบเหตุผลการแก้ไข' }, { status: 404 });
    return NextResponse.json({ message: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' }, { status: 500 });
  }
}
