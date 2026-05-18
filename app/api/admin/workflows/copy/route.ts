import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** POST /api/admin/workflows/copy - คัดลอก Workflow จากหมวดหมู่หนึ่งไปอีกหมวดหมู่ (เทียบระบบเก่า copyWorkflow) */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const body = await request.json();
    const fromCategoryId = body.fromCategoryId != null ? Number(body.fromCategoryId) : undefined;
    const toCategoryId = body.toCategoryId != null ? Number(body.toCategoryId) : undefined;
    if (fromCategoryId == null || fromCategoryId < 1)
      return NextResponse.json({ message: 'กรุณาเลือกหมวดหมู่ต้นทาง' }, { status: 400 });
    if (toCategoryId == null || toCategoryId < 1)
      return NextResponse.json({ message: 'กรุณาเลือกหมวดหมู่ปลายทาง' }, { status: 400 });
    if (fromCategoryId === toCategoryId)
      return NextResponse.json({ message: 'หมวดหมู่ต้นทางและปลายทางต้องต่างกัน' }, { status: 400 });

    const sourceSteps = await prisma.workflowStep.findMany({
      where: { categoryId: fromCategoryId },
      orderBy: { stepSequence: 'asc' },
    });
    if (sourceSteps.length === 0)
      return NextResponse.json({ message: 'หมวดหมู่ต้นทางไม่มีขั้นตอนใน Workflow' }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      const existing = await tx.workflowStep.findMany({ where: { categoryId: toCategoryId } });
      if (existing.length > 0) {
        await tx.workflowStep.deleteMany({ where: { categoryId: toCategoryId } });
      }
      for (const s of sourceSteps) {
        await tx.workflowStep.create({
          data: {
            categoryId: toCategoryId,
            stepSequence: s.stepSequence,
            approverRoleName: s.approverRoleName,
            filterByDepartment: (s as { filterByDepartment?: boolean }).filterByDepartment ?? false,
          },
        });
      }
    });

    return NextResponse.json({
      ok: true,
      message: `คัดลอก Workflow จากหมวดหมู่ต้นทางไปปลายทางสำเร็จ (${sourceSteps.length} ขั้นตอน)`,
    });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2003') return NextResponse.json({ message: 'ไม่พบหมวดหมู่' }, { status: 400 });
    console.error(e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
