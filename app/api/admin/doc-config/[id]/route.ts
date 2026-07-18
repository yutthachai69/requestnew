import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

/** PUT /api/admin/doc-config/[id] - update prefix or lastRunningNumber */
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
    const prefix = body.prefix != null ? String(body.prefix).trim() : undefined;
    const lastRunningNumber = body.lastRunningNumber != null ? Number(body.lastRunningNumber) : undefined;
    const data: { prefix?: string; lastRunningNumber?: number } = {};
    if (prefix !== undefined) data.prefix = prefix;
    if (lastRunningNumber !== undefined && lastRunningNumber >= 0) data.lastRunningNumber = lastRunningNumber;
    if (Object.keys(data).length === 0)
      return NextResponse.json({ message: 'ไม่มีข้อมูลที่จะอัปเดต' }, { status: 400 });

    const updated = await prisma.docConfig.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true } } },
    });
    return NextResponse.json({
      id: updated.id,
      year: updated.year,
      prefix: updated.prefix,
      lastRunningNumber: updated.lastRunningNumber,
      categoryId: updated.categoryId,
      categoryName: updated.category.name,
    });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2025') return NextResponse.json({ message: 'ไม่พบรายการ' }, { status: 404 });
    return handleApiError(e, 'PUT /api/admin/doc-config/[id]');
  }
}
