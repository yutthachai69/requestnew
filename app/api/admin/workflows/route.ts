import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

/** GET /api/admin/workflows?categoryId=1 - list workflow steps (all or by category) */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const categoryIdParam = request.nextUrl.searchParams.get('categoryId');
  const categoryId = categoryIdParam != null ? Number(categoryIdParam) : null;
  try {
    const where = categoryId != null && !Number.isNaN(categoryId) ? { categoryId } : {};
    const steps = await prisma.workflowStep.findMany({
      where,
      orderBy: [{ categoryId: 'asc' }, { stepSequence: 'asc' }],
      include: { category: { select: { id: true, name: true } } },
    });
    const categoryIds = [...new Set(steps.map((s) => s.categoryId))];
    let mappings: { categoryId: number; stepSequence: number; user: { id: number; fullName: string; email: string } }[] = [];
    try {
      if (categoryIds.length) {
        mappings = await (prisma as unknown as { specialApproverMapping?: { findMany: (args: { where: { categoryId: { in: number[] } }; include: { user: { select: { id: true; fullName: true; email: true } } } }) => Promise<typeof mappings> } })
          .specialApproverMapping?.findMany({
            where: { categoryId: { in: categoryIds } },
            include: { user: { select: { id: true, fullName: true, email: true } } },
          }) ?? [];
      }
    } catch {
      // ตาราง SpecialApproverMapping ยังไม่มีหรือยังไม่ได้ migrate
    }
    const mapByCatAndSeq = new Map<string, { id: number; fullName: string; email: string }>();
    mappings.forEach((m) => mapByCatAndSeq.set(`${m.categoryId}-${m.stepSequence}`, m.user));

    return NextResponse.json(
      steps.map((s) => {
        const special = mapByCatAndSeq.get(`${s.categoryId}-${s.stepSequence}`);
        return {
          id: s.id,
          stepSequence: s.stepSequence,
          approverRoleName: s.approverRoleName,
          filterByDepartment: (s as { filterByDepartment?: boolean }).filterByDepartment ?? false,
          categoryId: s.categoryId,
          categoryName: s.category.name,
          specialApproverUserId: special?.id ?? null,
          specialApproverFullName: special?.fullName ?? null,
        };
      })
    );
  } catch (e) {
    return handleApiError(e, 'GET /api/admin/workflows');
  }
}

/** POST /api/admin/workflows - create workflow step */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const body = await request.json();
    const categoryId = body.categoryId != null ? Number(body.categoryId) : undefined;
    const stepSequence = body.stepSequence != null ? Number(body.stepSequence) : undefined;
    const approverRoleName = body.approverRoleName != null ? String(body.approverRoleName).trim() : undefined;
    const filterByDepartment = body.filterByDepartment === true;
    if (categoryId == null || categoryId < 1)
      return NextResponse.json({ message: 'กรุณาเลือกหมวดหมู่' }, { status: 400 });
    if (stepSequence == null || stepSequence < 1)
      return NextResponse.json({ message: 'ลำดับขั้นต้องเป็นตัวเลขอย่างน้อย 1' }, { status: 400 });
    if (!approverRoleName)
      return NextResponse.json({ message: 'กรุณาระบุชื่อสิทธิ์ผู้อนุมัติ' }, { status: 400 });

    const created = await prisma.workflowStep.create({
      data: { categoryId, stepSequence, approverRoleName, filterByDepartment },
      include: { category: { select: { id: true, name: true } } },
    });
    return NextResponse.json({
      id: created.id,
      stepSequence: created.stepSequence,
      approverRoleName: created.approverRoleName,
      filterByDepartment: (created as { filterByDepartment?: boolean }).filterByDepartment ?? false,
      categoryId: created.categoryId,
      categoryName: created.category.name,
    });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2003')
      return NextResponse.json({ message: 'ไม่พบหมวดหมู่' }, { status: 400 });
    return handleApiError(e, 'POST /api/admin/workflows');
  }
}
