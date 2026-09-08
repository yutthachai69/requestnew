import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { WORKFLOW_VERSION_STATUS } from '@/lib/workflow-versioning';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const categoryId = Number(request.nextUrl.searchParams.get('categoryId'));
  const correctionRaw = request.nextUrl.searchParams.get('correctionTypeId');
  const correctionTypeId = correctionRaw == null || correctionRaw === '' ? undefined : Number(correctionRaw);
  if (!categoryId) return NextResponse.json({ message: 'กรุณาระบุ categoryId' }, { status: 400 });
  try {
    const rows = await prisma.workflowVersion.findMany({
      where: { categoryId, ...(correctionTypeId === undefined ? {} : { correctionTypeId }) },
      orderBy: [{ versionNumber: 'desc' }, { id: 'desc' }],
      include: { correctionType: { select: { id: true, name: true } }, createdBy: { select: { fullName: true } }, _count: { select: { requests: true, transitions: true } } },
    });
    return NextResponse.json(rows);
  } catch (e) { return handleApiError(e, 'GET workflow versions'); }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const body = await request.json();
    const categoryId = Number(body.categoryId);
    const correctionTypeId = body.correctionTypeId == null || body.correctionTypeId === '' ? null : Number(body.correctionTypeId);
    const sourceVersionId = body.sourceVersionId ? Number(body.sourceVersionId) : null;
    if (!categoryId) return NextResponse.json({ message: 'กรุณาระบุ categoryId' }, { status: 400 });
    const created = await prisma.$transaction(async (tx) => {
      const latest = await tx.workflowVersion.findFirst({ where: { categoryId, correctionTypeId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
      const source = sourceVersionId ? await tx.workflowVersion.findUnique({ where: { id: sourceVersionId }, include: { transitions: true } }) : await tx.workflowVersion.findFirst({ where: { categoryId, correctionTypeId, status: WORKFLOW_VERSION_STATUS.PUBLISHED }, orderBy: { versionNumber: 'desc' }, include: { transitions: true } });
      const version = await tx.workflowVersion.create({ data: { categoryId, correctionTypeId, versionNumber: (latest?.versionNumber || 0) + 1, status: WORKFLOW_VERSION_STATUS.DRAFT, label: body.label || null, createdById: auth.id } });
      if (source?.transitions.length) await tx.workflowTransition.createMany({ data: source.transitions.map((t) => ({ workflowVersionId: version.id, categoryId, correctionTypeId, currentStatusId: t.currentStatusId, actionId: t.actionId, requiredRoleId: t.requiredRoleId, nextStatusId: t.nextStatusId, stepSequence: t.stepSequence, filterByDepartment: t.filterByDepartment, conditionKey: t.conditionKey })) });
      return version;
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) { return handleApiError(e, 'POST workflow versions'); }
}
