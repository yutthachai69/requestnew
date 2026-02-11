import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** GET /api/admin/workflow-transitions?categoryId=1&correctionTypeId= — รายการ Transition ต่อหมวดหมู่ (ขั้นตอนอนุมัติที่ใช้จริง) */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  const categoryIdParam = request.nextUrl.searchParams.get('categoryId');
  const correctionTypeIdParam = request.nextUrl.searchParams.get('correctionTypeId');
  const categoryId = categoryIdParam != null ? Number(categoryIdParam) : null;
  const correctionTypeId =
    correctionTypeIdParam != null && correctionTypeIdParam !== ''
      ? Number(correctionTypeIdParam)
      : null;
  if (categoryId == null || categoryId < 1) {
    return NextResponse.json({ message: 'กรุณาระบุ categoryId' }, { status: 400 });
  }
  try {
    const list = await prisma.workflowTransition.findMany({
      where: {
        categoryId,
        correctionTypeId: correctionTypeId ?? null,
      },
      orderBy: [{ stepSequence: 'asc' }, { id: 'asc' }],
      include: {
        currentStatus: { select: { id: true, code: true, displayName: true } },
        nextStatus: { select: { id: true, code: true, displayName: true } },
        action: { select: { id: true, actionName: true, displayName: true } },
        requiredRole: { select: { id: true, roleName: true } },
        category: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(
      list.map((t) => ({
        id: t.id,
        categoryId: t.categoryId,
        categoryName: t.category.name,
        correctionTypeId: t.correctionTypeId,
        currentStatusId: t.currentStatusId,
        currentStatus: t.currentStatus,
        actionId: t.actionId,
        action: t.action,
        requiredRoleId: t.requiredRoleId,
        requiredRole: t.requiredRole,
        nextStatusId: t.nextStatusId,
        nextStatus: t.nextStatus,
        stepSequence: t.stepSequence,
        filterByDepartment: t.filterByDepartment,
      }))
    );
  } catch (e) {
    console.error('GET /api/admin/workflow-transitions', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** POST /api/admin/workflow-transitions — สร้าง Transition (ขั้นตอนอนุมัติ) */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const body = await request.json();
    const categoryId = body.categoryId != null ? Number(body.categoryId) : undefined;
    const correctionTypeId =
      body.correctionTypeId != null && body.correctionTypeId !== ''
        ? Number(body.correctionTypeId)
        : null;
    const currentStatusId = body.currentStatusId != null ? Number(body.currentStatusId) : undefined;
    const actionId = body.actionId != null ? Number(body.actionId) : undefined;
    const requiredRoleId = body.requiredRoleId != null ? Number(body.requiredRoleId) : undefined;
    const nextStatusId = body.nextStatusId != null ? Number(body.nextStatusId) : undefined;
    const stepSequence = body.stepSequence != null ? Number(body.stepSequence) : 1;
    const filterByDepartment = body.filterByDepartment === true;

    if (categoryId == null || categoryId < 1)
      return NextResponse.json({ message: 'กรุณาเลือกหมวดหมู่' }, { status: 400 });
    if (currentStatusId == null || currentStatusId < 1)
      return NextResponse.json({ message: 'กรุณาเลือกสถานะปัจจุบัน' }, { status: 400 });
    if (actionId == null || actionId < 1)
      return NextResponse.json({ message: 'กรุณาเลือก Action' }, { status: 400 });
    if (requiredRoleId == null || requiredRoleId < 1)
      return NextResponse.json({ message: 'กรุณาเลือก Role ผู้อนุมัติ' }, { status: 400 });
    if (nextStatusId == null || nextStatusId < 1)
      return NextResponse.json({ message: 'กรุณาเลือกสถานะถัดไป' }, { status: 400 });

    const created = await prisma.workflowTransition.create({
      data: {
        categoryId,
        correctionTypeId,
        currentStatusId,
        actionId,
        requiredRoleId,
        nextStatusId,
        stepSequence: stepSequence >= 0 ? stepSequence : 0,
        filterByDepartment,
      },
      include: {
        currentStatus: { select: { id: true, code: true, displayName: true } },
        nextStatus: { select: { id: true, code: true, displayName: true } },
        action: { select: { id: true, actionName: true, displayName: true } },
        requiredRole: { select: { id: true, roleName: true } },
        category: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({
      id: created.id,
      categoryId: created.categoryId,
      categoryName: created.category.name,
      correctionTypeId: created.correctionTypeId,
      currentStatusId: created.currentStatusId,
      currentStatus: created.currentStatus,
      actionId: created.actionId,
      action: created.action,
      requiredRoleId: created.requiredRoleId,
      requiredRole: created.requiredRole,
      nextStatusId: created.nextStatusId,
      nextStatus: created.nextStatus,
      stepSequence: created.stepSequence,
      filterByDepartment: created.filterByDepartment,
    });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2003')
      return NextResponse.json({ message: 'ไม่พบหมวดหมู่/สถานะ/Role/Action' }, { status: 400 });
    console.error('POST /api/admin/workflow-transitions', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** DELETE /api/admin/workflow-transitions?categoryId=1&correctionTypeId= — ลบ Transition ทั้งหมดของหมวดหมู่ (และประเภทการแก้ไขถ้าระบุ) */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  const categoryIdParam = request.nextUrl.searchParams.get('categoryId');
  const correctionTypeIdParam = request.nextUrl.searchParams.get('correctionTypeId');
  const categoryId = categoryIdParam != null ? Number(categoryIdParam) : null;
  const correctionTypeId =
    correctionTypeIdParam != null && correctionTypeIdParam !== ''
      ? Number(correctionTypeIdParam)
      : null;
  if (categoryId == null || categoryId < 1) {
    return NextResponse.json({ message: 'กรุณาระบุ categoryId' }, { status: 400 });
  }
  try {
    const result = await prisma.workflowTransition.deleteMany({
      where: {
        categoryId,
        correctionTypeId: correctionTypeId ?? null,
      },
    });
    return NextResponse.json({ message: `ลบ Workflow แล้ว (${result.count} รายการ)`, count: result.count });
  } catch (e) {
    console.error('DELETE /api/admin/workflow-transitions', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
