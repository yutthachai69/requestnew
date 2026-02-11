import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** GET /api/admin/correction-types/[id] */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    const ct = await prisma.correctionType.findUnique({
      where: { id },
      include: { categories: { select: { id: true, name: true } } },
    });
    if (!ct) return NextResponse.json({ message: 'ไม่พบประเภทการแก้ไข' }, { status: 404 });
    return NextResponse.json({
      CorrectionTypeID: ct.id,
      Name: ct.name,
      DisplayOrder: ct.displayOrder,
      IsActive: ct.isActive,
      TemplateString: ct.templateString ?? '',
      FieldsConfig: ct.fieldsConfig ?? null,
      CategoryIDs: ct.categories.map((c) => c.id),
      CategoryNames: ct.categories.map((c) => c.name),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** PUT /api/admin/correction-types/[id] */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    const body = await request.json();
    const name = body.name != null ? String(body.name).trim() : undefined;
    const displayOrder = body.displayOrder !== undefined ? (typeof body.displayOrder === 'number' ? body.displayOrder : parseInt(String(body.displayOrder), 10) || 10) : undefined;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;
    const templateString = body.templateString !== undefined ? (body.templateString == null || body.templateString === '' ? null : String(body.templateString)) : undefined;
    const fieldsConfig = body.fieldsConfig !== undefined ? (body.fieldsConfig == null ? null : typeof body.fieldsConfig === 'string' ? body.fieldsConfig : JSON.stringify(body.fieldsConfig)) : undefined;
    const categoryIds = body.categoryIds !== undefined
      ? (Array.isArray(body.categoryIds) ? body.categoryIds.map((id: unknown) => Number(id)).filter((n: number) => n > 0) : [])
      : undefined;

    const data: {
      name?: string;
      displayOrder?: number;
      isActive?: boolean;
      templateString?: string | null;
      fieldsConfig?: string | null;
      categories?: { set: { id: number }[] };
    } = {};
    if (name !== undefined) data.name = name;
    if (displayOrder !== undefined) data.displayOrder = displayOrder;
    if (isActive !== undefined) data.isActive = isActive;
    if (templateString !== undefined) data.templateString = templateString;
    if (fieldsConfig !== undefined) data.fieldsConfig = fieldsConfig;
    if (categoryIds !== undefined) data.categories = { set: categoryIds.map((id: number) => ({ id })) };

    const updated = await prisma.correctionType.update({
      where: { id },
      data,
      include: { categories: { select: { id: true, name: true } } },
    });

    return NextResponse.json({
      CorrectionTypeID: updated.id,
      Name: updated.name,
      DisplayOrder: updated.displayOrder,
      IsActive: updated.isActive,
      TemplateString: updated.templateString ?? '',
      FieldsConfig: updated.fieldsConfig ?? null,
      CategoryIDs: updated.categories.map((c) => c.id),
      CategoryNames: updated.categories.map((c) => c.name),
    });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === 'P2025')
      return NextResponse.json({ message: 'ไม่พบประเภทการแก้ไข' }, { status: 404 });
    if (err?.code === 'P2002')
      return NextResponse.json({ message: 'ชื่อประเภทการแก้ไขซ้ำ' }, { status: 400 });
    console.error('PUT /api/admin/correction-types/[id]', e);
    const isMissingColumn = typeof err?.message === 'string' && err.message.includes('no such column');
    const message = isMissingColumn
      ? 'ฐานข้อมูลยังไม่มีคอลัมน์ templateString/fieldsConfig — กรุณารัน: npx tsx scripts/add-correction-type-fields.ts'
      : (err?.message ?? 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์');
    return NextResponse.json({ message }, { status: 500 });
  }
}

/** DELETE /api/admin/correction-types/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    await prisma.correctionType.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025')
      return NextResponse.json({ message: 'ไม่พบประเภทการแก้ไข' }, { status: 404 });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
