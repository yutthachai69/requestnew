import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** GET /api/admin/correction-types - list all (Admin) */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const perPage = Math.min(50, Math.max(5, parseInt(searchParams.get('perPage') ?? '10', 10)));
    const skip = (page - 1) * perPage;

    const [list, total] = await Promise.all([
      prisma.correctionType.findMany({
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        include: { categories: { select: { id: true, name: true } } },
        skip,
        take: perPage,
      }),
      prisma.correctionType.count(),
    ]);

    return NextResponse.json(
      list.map((ct) => ({
        CorrectionTypeID: ct.id,
        Name: ct.name,
        DisplayOrder: ct.displayOrder,
        IsActive: ct.isActive,
        TemplateString: ct.templateString ?? '',
        FieldsConfig: ct.fieldsConfig ?? null,
        CategoryIDs: ct.categories.map((c) => c.id),
        CategoryNames: ct.categories.map((c) => c.name),
      })),
      {
        headers: {
          'X-Total-Count': String(total),
          'X-Page': String(page),
          'X-Per-Page': String(perPage),
        },
      }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** POST /api/admin/correction-types */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const body = await request.json();
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ message: 'กรุณาระบุชื่อประเภทการแก้ไข' }, { status: 400 });
    const displayOrder = typeof body.displayOrder === 'number' ? body.displayOrder : parseInt(String(body.displayOrder ?? '10'), 10) || 10;
    const isActive = body.isActive !== false;
    const templateString = body.templateString != null ? String(body.templateString) : null;
    const fieldsConfig = body.fieldsConfig != null ? (typeof body.fieldsConfig === 'string' ? body.fieldsConfig : JSON.stringify(body.fieldsConfig)) : null;
    const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds.map((id: unknown) => Number(id)).filter((n: number) => n > 0) : [];

    const created = await prisma.correctionType.create({
      data: {
        name,
        displayOrder,
        isActive,
        templateString: templateString || null,
        fieldsConfig: fieldsConfig || null,
        categories: categoryIds.length ? { connect: categoryIds.map((id: number) => ({ id })) } : undefined,
      },
      include: { categories: { select: { id: true, name: true } } },
    });

    return NextResponse.json({
      CorrectionTypeID: created.id,
      Name: created.name,
      DisplayOrder: created.displayOrder,
      IsActive: created.isActive,
      TemplateString: created.templateString ?? '',
      FieldsConfig: created.fieldsConfig ?? null,
      CategoryIDs: created.categories.map((c) => c.id),
      CategoryNames: created.categories.map((c) => c.name),
    });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === 'P2002') {
      return NextResponse.json({ message: 'ชื่อประเภทการแก้ไขซ้ำ' }, { status: 400 });
    }
    console.error('POST /api/admin/correction-types', e);
    const isMissingColumn = typeof err?.message === 'string' && err.message.includes('no such column');
    const message = isMissingColumn
      ? 'ฐานข้อมูลยังไม่มีคอลัมน์ templateString/fieldsConfig — กรุณารัน: npx tsx scripts/add-correction-type-fields.ts'
      : (err?.message ?? 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์');
    return NextResponse.json({ message }, { status: 500 });
  }
}
