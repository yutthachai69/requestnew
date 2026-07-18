import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

/** GET /api/admin/statuses/[id] — ดึงสถานะเดียว (Admin) */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    const s = await prisma.status.findUnique({ where: { id } });
    if (!s) return NextResponse.json({ error: 'ไม่พบสถานะ' }, { status: 404 });
    return NextResponse.json({
      id: s.id,
      code: s.code,
      displayName: s.displayName,
      colorCode: s.colorCode,
      displayOrder: s.displayOrder,
    });
  } catch (e) {
    return handleApiError(e, 'GET /api/admin/statuses/[id]');
  }
}

/** PUT /api/admin/statuses/[id] — แก้ไขชื่อที่แสดงผลและสี (Admin) */
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
    const displayName = body.displayName != null ? String(body.displayName).trim() : undefined;
    const colorCode = body.colorCode != null ? String(body.colorCode).trim() : undefined;
    const displayOrder =
      body.displayOrder !== undefined ? Number(body.displayOrder) : undefined;
    const data: { displayName?: string; colorCode?: string; displayOrder?: number } = {};
    if (displayName !== undefined) data.displayName = displayName;
    if (colorCode !== undefined) data.colorCode = colorCode;
    if (displayOrder !== undefined && !Number.isNaN(displayOrder)) data.displayOrder = displayOrder;
    const updated = await prisma.status.update({
      where: { id },
      data,
    });
    return NextResponse.json({
      id: updated.id,
      code: updated.code,
      displayName: updated.displayName,
      colorCode: updated.colorCode,
      displayOrder: updated.displayOrder,
    });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025')
      return NextResponse.json({ message: 'ไม่พบสถานะ' }, { status: 404 });
    return handleApiError(e, 'PUT /api/admin/statuses/[id]');
  }
}
