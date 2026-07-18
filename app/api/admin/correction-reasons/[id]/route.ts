import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

/** PUT /api/admin/correction-reasons/[id] */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
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
    return handleApiError(e, 'PUT /api/admin/correction-reasons/[id]');
  }
}

/** DELETE /api/admin/correction-reasons/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    await prisma.correctionReason.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'P2025') return NextResponse.json({ message: 'ไม่พบเหตุผลการแก้ไข' }, { status: 404 });
    return handleApiError(e, 'DELETE /api/admin/correction-reasons/[id]');
  }
}
