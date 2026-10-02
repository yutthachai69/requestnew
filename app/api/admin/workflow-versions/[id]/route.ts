import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { validateWorkflowVersion, workflowVersionDeleteBlocker, WORKFLOW_VERSION_STATUS } from '@/lib/workflow-versioning';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(); if (isAuthError(auth)) return auth;
  const id = Number((await params).id); if (!id) return NextResponse.json({ message: 'Invalid id' }, { status: 400 });
  try { return NextResponse.json(await prisma.workflowVersion.findUnique({ where: { id }, include: { transitions: { include: { currentStatus: true, nextStatus: true, action: true, requiredRole: true } }, category: true, correctionType: true } })); }
  catch (e) { return handleApiError(e, 'GET workflow version'); }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(); if (isAuthError(auth)) return auth;
  const id = Number((await params).id); if (!id) return NextResponse.json({ message: 'Invalid id' }, { status: 400 });
  try {
    const body = await request.json();
    const version = await prisma.workflowVersion.findUnique({ where: { id } });
    if (!version) return NextResponse.json({ message: 'ไม่พบ Workflow Version' }, { status: 404 });
    const action = body.action || 'rename';
    if (action === 'validate') return NextResponse.json(await validateWorkflowVersion(prisma, id));
    if (action === 'publish') {
      const validation = await validateWorkflowVersion(prisma, id);
      if (!validation.valid) return NextResponse.json(validation, { status: 422 });
      const published = await prisma.$transaction(async (tx) => {
        await tx.workflowVersion.updateMany({ where: { categoryId: version.categoryId, correctionTypeId: version.correctionTypeId, status: WORKFLOW_VERSION_STATUS.PUBLISHED, id: { not: id } }, data: { status: WORKFLOW_VERSION_STATUS.ARCHIVED } });
        return tx.workflowVersion.update({ where: { id }, data: { status: WORKFLOW_VERSION_STATUS.PUBLISHED, publishedAt: new Date(), label: body.label ?? version.label } });
      });
      return NextResponse.json({ ...published, validation });
    }
    if (action === 'archive') {
      // Archiving the live PUBLISHED version directly (instead of replacing
      // it by publishing another) can leave the category with none: routing
      // then falls back to an unscoped query across every version ever
      // created for it, silently doubling "required approvals" counts on
      // steps that have a single approver and stalling requests forever.
      // Publishing a replacement is the only supported way to retire one.
      if (version.status === WORKFLOW_VERSION_STATUS.PUBLISHED) {
        return NextResponse.json(
          { message: 'เวอร์ชันนี้กำลังใช้งานอยู่ ต้อง Publish เวอร์ชันใหม่แทนที่ก่อนจึงจะ Archive เวอร์ชันนี้ได้' },
          { status: 409 },
        );
      }
      return NextResponse.json(await prisma.workflowVersion.update({ where: { id }, data: { status: WORKFLOW_VERSION_STATUS.ARCHIVED } }));
    }
    if (version.status === WORKFLOW_VERSION_STATUS.PUBLISHED) return NextResponse.json({ message: 'ต้องสร้าง Draft ใหม่ก่อนแก้ไขเวอร์ชันที่ Publish แล้ว' }, { status: 409 });
    return NextResponse.json(await prisma.workflowVersion.update({ where: { id }, data: { label: body.label == null ? version.label : String(body.label) } }));
  } catch (e) { return handleApiError(e, 'PUT workflow version'); }
}

/** DELETE /api/admin/workflow-versions/[id] — remove an unused draft (and its transitions). Nothing else is deletable. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(); if (isAuthError(auth)) return auth;
  const id = Number((await params).id); if (!id) return NextResponse.json({ message: 'Invalid id' }, { status: 400 });
  try {
    // The check and the delete share one transaction: a draft published a moment ago must not be removed.
    const outcome = await prisma.$transaction(async (tx) => {
      const version = await tx.workflowVersion.findUnique({ where: { id }, select: { status: true, _count: { select: { requests: true } } } });
      if (!version) return { notFound: true as const };
      const blocker = workflowVersionDeleteBlocker({ status: version.status, requestCount: version._count.requests });
      if (blocker) return { blocker };
      await tx.workflowTransition.deleteMany({ where: { workflowVersionId: id } });
      await tx.workflowVersion.delete({ where: { id } });
      return { ok: true as const };
    });
    if ('notFound' in outcome) return NextResponse.json({ message: 'ไม่พบ Workflow Version' }, { status: 404 });
    if ('blocker' in outcome) return NextResponse.json({ message: outcome.blocker }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleApiError(e, 'DELETE workflow version'); }
}
