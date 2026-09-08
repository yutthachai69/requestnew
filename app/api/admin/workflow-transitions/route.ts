import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';
import { WORKFLOW_VERSION_STATUS, getPublishedWorkflowVersion } from '@/lib/workflow-versioning';

/** GET /api/admin/workflow-transitions?categoryId=1&correctionTypeId= — รายการ Transition ต่อหมวดหมู่ (ขั้นตอนอนุมัติที่ใช้จริง) */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const categoryIdParam = request.nextUrl.searchParams.get('categoryId');
  const correctionTypeIdParam = request.nextUrl.searchParams.get('correctionTypeId');
  const categoryId = categoryIdParam != null ? Number(categoryIdParam) : null;
  const correctionTypeId =
    correctionTypeIdParam != null && correctionTypeIdParam !== ''
      ? Number(correctionTypeIdParam)
      : null;
  const workflowVersionIdParam = request.nextUrl.searchParams.get('workflowVersionId');
  const workflowVersionId = workflowVersionIdParam ? Number(workflowVersionIdParam) : null;
  if (categoryId == null || categoryId < 1) {
    return NextResponse.json({ message: 'กรุณาระบุ categoryId' }, { status: 400 });
  }
  try {
    const list = await prisma.workflowTransition.findMany({
      where: {
        ...(workflowVersionId ? { workflowVersionId } : { categoryId, correctionTypeId: correctionTypeId ?? null }),
      },
      orderBy: [{ stepSequence: 'asc' }, { id: 'asc' }],
      include: {
        currentStatus: { select: { id: true, code: true, displayName: true } },
        nextStatus: { select: { id: true, code: true, displayName: true } },
        action: { select: { id: true, actionName: true, displayName: true } },
        requiredRole: { select: { id: true, roleName: true } },
        category: { select: { id: true, name: true } },
        workflowVersion: { select: { id: true, versionNumber: true, status: true, label: true } },
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
        conditionKey: t.conditionKey,
        workflowVersion: t.workflowVersion,
      }))
    );
  } catch (e) {
    return handleApiError(e, 'GET /api/admin/workflow-transitions');
  }
}

/** POST /api/admin/workflow-transitions — สร้าง Transition (ขั้นตอนอนุมัติ) */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
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
    const conditionKey = typeof body.conditionKey === 'string' && body.conditionKey ? body.conditionKey : 'ALWAYS';
    const workflowVersionId = body.workflowVersionId ? Number(body.workflowVersionId) : await getPublishedWorkflowVersion(prisma, categoryId!, correctionTypeId).then((v) => v?.id ?? null);

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
    if (!workflowVersionId) return NextResponse.json({ message: 'ไม่พบ Workflow Version ที่ใช้งาน' }, { status: 400 });
    const version = await prisma.workflowVersion.findUnique({ where: { id: workflowVersionId }, select: { status: true } });
    if (version?.status === WORKFLOW_VERSION_STATUS.PUBLISHED) return NextResponse.json({ message: 'ต้องแก้ไขใน Draft แล้ว Publish ใหม่' }, { status: 409 });

    const created = await prisma.workflowTransition.create({
      data: {
        categoryId,
        workflowVersionId,
        correctionTypeId,
        currentStatusId,
        actionId,
        requiredRoleId,
        nextStatusId,
        stepSequence: stepSequence >= 0 ? stepSequence : 0,
        filterByDepartment,
        conditionKey,
      },
      include: {
        currentStatus: { select: { id: true, code: true, displayName: true } },
        nextStatus: { select: { id: true, code: true, displayName: true } },
        action: { select: { id: true, actionName: true, displayName: true } },
        requiredRole: { select: { id: true, roleName: true } },
        category: { select: { id: true, name: true } },
        workflowVersion: { select: { id: true, versionNumber: true, status: true, label: true } },
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
      conditionKey: created.conditionKey,
      workflowVersion: created.workflowVersion,
    });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2003')
      return NextResponse.json({ message: 'ไม่พบหมวดหมู่/สถานะ/Role/Action' }, { status: 400 });
    return handleApiError(e, 'POST /api/admin/workflow-transitions');
  }
}

/** DELETE /api/admin/workflow-transitions?categoryId=1&correctionTypeId= — ลบ Transition ทั้งหมดของหมวดหมู่ (และประเภทการแก้ไขถ้าระบุ) */
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const categoryIdParam = request.nextUrl.searchParams.get('categoryId');
  const correctionTypeIdParam = request.nextUrl.searchParams.get('correctionTypeId');
  const categoryId = categoryIdParam != null ? Number(categoryIdParam) : null;
  const correctionTypeId =
    correctionTypeIdParam != null && correctionTypeIdParam !== ''
      ? Number(correctionTypeIdParam)
      : null;
  const workflowVersionIdParam = request.nextUrl.searchParams.get('workflowVersionId');
  const workflowVersionId = workflowVersionIdParam ? Number(workflowVersionIdParam) : null;
  if (categoryId == null || categoryId < 1) {
    return NextResponse.json({ message: 'กรุณาระบุ categoryId' }, { status: 400 });
  }
  try {
    const result = await prisma.workflowTransition.deleteMany({
      where: {
        ...(workflowVersionId ? { workflowVersionId } : { categoryId, correctionTypeId: correctionTypeId ?? null }),
      },
    });
    return NextResponse.json({ message: `ลบ Workflow แล้ว (${result.count} รายการ)`, count: result.count });
  } catch (e) {
    return handleApiError(e, 'DELETE /api/admin/workflow-transitions');
  }
}
