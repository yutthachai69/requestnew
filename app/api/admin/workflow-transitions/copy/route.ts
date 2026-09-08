import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';
import { WORKFLOW_VERSION_STATUS } from '@/lib/workflow-versioning';

/** POST /api/admin/workflow-transitions/copy — คัดลอก Workflow จากหมวดหมู่ (และประเภทการแก้ไข) หนึ่งไปอีกหมวดหมู่ */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const body = await request.json();
    const sourceCategoryId = body.sourceCategoryId != null ? Number(body.sourceCategoryId) : undefined;
    const sourceCorrectionTypeId =
      body.sourceCorrectionTypeId != null && body.sourceCorrectionTypeId !== ''
        ? Number(body.sourceCorrectionTypeId)
        : null;
    const targetCategoryId = body.targetCategoryId != null ? Number(body.targetCategoryId) : undefined;
    const targetCorrectionTypeId =
      body.targetCorrectionTypeId != null && body.targetCorrectionTypeId !== ''
        ? Number(body.targetCorrectionTypeId)
        : null;

    if (sourceCategoryId == null || sourceCategoryId < 1)
      return NextResponse.json({ message: 'กรุณาเลือกหมวดหมู่ต้นทาง' }, { status: 400 });
    if (targetCategoryId == null || targetCategoryId < 1)
      return NextResponse.json({ message: 'กรุณาเลือกหมวดหมู่ปลายทาง' }, { status: 400 });
    if (sourceCategoryId === targetCategoryId && sourceCorrectionTypeId === targetCorrectionTypeId)
      return NextResponse.json({ message: 'ต้นทางและปลายทางต้องต่างกัน' }, { status: 400 });

    const sourceVersion = await prisma.workflowVersion.findFirst({ where: { categoryId: sourceCategoryId, correctionTypeId: sourceCorrectionTypeId, status: WORKFLOW_VERSION_STATUS.PUBLISHED }, orderBy: { versionNumber: 'desc' }, include: { transitions: true } });
    if (!sourceVersion) return NextResponse.json({ message: 'ไม่พบ Workflow ต้นทาง' }, { status: 404 });
    const latestVersion = await prisma.workflowVersion.findFirst({ where: { categoryId: targetCategoryId, correctionTypeId: targetCorrectionTypeId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
    const targetVersion = await prisma.workflowVersion.create({ data: { categoryId: targetCategoryId, correctionTypeId: targetCorrectionTypeId, versionNumber: (latestVersion?.versionNumber || 0) + 1, status: WORKFLOW_VERSION_STATUS.DRAFT, label: `คัดลอกจาก v${sourceVersion.versionNumber}`, createdById: auth.id } });
    const sourceList = sourceVersion.transitions;

    const created = await prisma.workflowTransition.createMany({
      data: sourceList.map((t) => ({
        workflowVersionId: targetVersion.id,
        categoryId: targetCategoryId,
        correctionTypeId: targetCorrectionTypeId,
        currentStatusId: t.currentStatusId,
        actionId: t.actionId,
        requiredRoleId: t.requiredRoleId,
        nextStatusId: t.nextStatusId,
        stepSequence: t.stepSequence,
        filterByDepartment: t.filterByDepartment,
        conditionKey: t.conditionKey,
      })),
    });

    return NextResponse.json({
      message: `คัดลอก Workflow สำเร็จ (${created.count} รายการ)`,
      count: created.count,
      versionId: targetVersion.id,
    });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2003')
      return NextResponse.json({ message: 'ไม่พบหมวดหมู่หรือข้อมูลอ้างอิง' }, { status: 400 });
    return handleApiError(e, 'POST /api/admin/workflow-transitions/copy');
  }
}
