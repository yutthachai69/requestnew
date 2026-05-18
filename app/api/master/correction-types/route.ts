import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/master/correction-types?categoryId=X
 * คืนรายการประเภทการแก้ไขของหมวดหมู่นั้น (สำหรับฟอร์มยื่นคำร้อง)
 * ต้องล็อกอิน และมีสิทธิ์เข้าหมวดหมู่นั้น (Admin ได้ทุกหมวด, role อื่นได้ตาม accessibleCategories)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(request.url);
  const categoryIdParam = searchParams.get('categoryId');
  const categoryId = categoryIdParam ? parseInt(categoryIdParam, 10) : NaN;

  if (!Number.isFinite(categoryId) || categoryId < 1) {
    return NextResponse.json({ error: 'กรุณาระบุ categoryId' }, { status: 400 });
  }

  const roleName = auth.roleName;
  const userId = String(auth.id);

  try {
    if (roleName !== 'Admin' && userId) {
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        select: { accessibleCategories: { select: { id: true } } },
      });
      const allowedIds = user?.accessibleCategories?.map((c) => c.id) ?? [];
      if (!allowedIds.includes(categoryId)) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าหมวดหมู่นี้' }, { status: 403 });
      }
    }

    const list = await prisma.correctionType.findMany({
      where: {
        isActive: true,
        name: {
          not: 'ทั่วไป 2' // Filter out the template
        },
        categories: { some: { id: categoryId } },
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        displayOrder: true,
        templateString: true,
        fieldsConfig: true,
      },
    });

    return NextResponse.json(
      list.map((ct) => ({
        CorrectionTypeID: ct.id,
        Name: ct.name,
        DisplayOrder: ct.displayOrder,
        TemplateString: ct.templateString ?? null,
        FieldsConfig: ct.fieldsConfig ?? null,
      }))
    );
  } catch (e) {
    console.error('GET /api/master/correction-types', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
