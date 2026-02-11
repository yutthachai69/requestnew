import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** PUT /api/admin/workflow-transitions/[id] — แก้ไข Transition */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ message: 'Invalid id' }, { status: 400 });
  try {
    const body = await request.json();
    const data: {
      currentStatusId?: number;
      actionId?: number;
      requiredRoleId?: number;
      nextStatusId?: number;
      stepSequence?: number;
      filterByDepartment?: boolean;
      correctionTypeId?: number | null;
    } = {};
    if (body.currentStatusId != null) data.currentStatusId = Number(body.currentStatusId);
    if (body.actionId != null) data.actionId = Number(body.actionId);
    if (body.requiredRoleId != null) data.requiredRoleId = Number(body.requiredRoleId);
    if (body.nextStatusId != null) data.nextStatusId = Number(body.nextStatusId);
    if (body.stepSequence != null) data.stepSequence = Number(body.stepSequence);
    if (body.filterByDepartment !== undefined) data.filterByDepartment = body.filterByDepartment === true;
    if (body.correctionTypeId !== undefined)
      data.correctionTypeId = body.correctionTypeId == null || body.correctionTypeId === '' ? null : Number(body.correctionTypeId);

    const updated = await prisma.workflowTransition.update({
      where: { id },
      data,
      include: {
        currentStatus: { select: { id: true, code: true, displayName: true } },
        nextStatus: { select: { id: true, code: true, displayName: true } },
        action: { select: { id: true, actionName: true, displayName: true } },
        requiredRole: { select: { id: true, roleName: true } },
        category: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({
      id: updated.id,
      categoryId: updated.categoryId,
      categoryName: updated.category.name,
      correctionTypeId: updated.correctionTypeId,
      currentStatusId: updated.currentStatusId,
      currentStatus: updated.currentStatus,
      actionId: updated.actionId,
      action: updated.action,
      requiredRoleId: updated.requiredRoleId,
      requiredRole: updated.requiredRole,
      nextStatusId: updated.nextStatusId,
      nextStatus: updated.nextStatus,
      stepSequence: updated.stepSequence,
      filterByDepartment: updated.filterByDepartment,
    });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2025') return NextResponse.json({ message: 'ไม่พบรายการ' }, { status: 404 });
    if (code === 'P2003') return NextResponse.json({ message: 'ข้อมูลอ้างอิงไม่ถูกต้อง' }, { status: 400 });
    console.error('PUT /api/admin/workflow-transitions/[id]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** DELETE /api/admin/workflow-transitions/[id] — ลบ Transition */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ message: 'Invalid id' }, { status: 400 });
  try {
    await prisma.workflowTransition.delete({ where: { id } });
    return NextResponse.json({ message: 'ลบรายการแล้ว' });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2025') return NextResponse.json({ message: 'ไม่พบรายการ' }, { status: 404 });
    console.error('DELETE /api/admin/workflow-transitions/[id]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
