import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** PUT /api/admin/workflows/[id] - update workflow step */
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
    const stepSequence = body.stepSequence != null ? Number(body.stepSequence) : undefined;
    const approverRoleName = body.approverRoleName != null ? String(body.approverRoleName).trim() : undefined;
    const filterByDepartment = body.filterByDepartment;
    const data: { stepSequence?: number; approverRoleName?: string; filterByDepartment?: boolean } = {};
    if (stepSequence != null && stepSequence >= 1) data.stepSequence = stepSequence;
    if (approverRoleName !== undefined) data.approverRoleName = approverRoleName;
    if (filterByDepartment !== undefined) data.filterByDepartment = Boolean(filterByDepartment);
    if (Object.keys(data).length === 0)
      return NextResponse.json({ message: 'ไม่มีข้อมูลที่จะอัปเดต' }, { status: 400 });

    const updated = await prisma.workflowStep.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true } } },
    });
    return NextResponse.json({
      id: updated.id,
      stepSequence: updated.stepSequence,
      approverRoleName: updated.approverRoleName,
      filterByDepartment: (updated as { filterByDepartment?: boolean }).filterByDepartment ?? false,
      categoryId: updated.categoryId,
      categoryName: updated.category.name,
    });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2025') return NextResponse.json({ message: 'ไม่พบขั้นตอน' }, { status: 404 });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

/** DELETE /api/admin/workflows/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    await prisma.workflowStep.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025')
      return NextResponse.json({ message: 'ไม่พบขั้นตอน' }, { status: 404 });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
