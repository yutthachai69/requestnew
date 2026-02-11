import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** PUT /api/admin/categories/[id] */
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
    const requiresCCSClosing = body.requiresCCSClosing !== undefined ? Boolean(body.requiresCCSClosing) : undefined;
    const data: { name?: string; requiresCCSClosing?: boolean } = {};
    if (name !== undefined) data.name = name;
    if (requiresCCSClosing !== undefined) data.requiresCCSClosing = requiresCCSClosing;
    const updated = await prisma.category.update({
      where: { id },
      data,
    });
    return NextResponse.json({
      CategoryID: updated.id,
      CategoryName: updated.name,
      RequiresCCSClosing: updated.requiresCCSClosing,
    });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025')
      return NextResponse.json({ message: 'ไม่พบหมวดหมู่' }, { status: 404 });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

/** DELETE /api/admin/categories/[id] */
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
    const [requestCount, transitionCount, docConfigCount] = await Promise.all([
      prisma.iTRequestF07.count({ where: { categoryId: id } }),
      prisma.workflowTransition.count({ where: { categoryId: id } }),
      prisma.docConfig.count({ where: { categoryId: id } }),
    ]);
    if (requestCount > 0) {
      return NextResponse.json(
        { message: `ไม่สามารถลบได้ เพราะมีคำร้องที่ใช้หมวดหมู่นี้อยู่ ${requestCount} รายการ` },
        { status: 409 }
      );
    }
    if (transitionCount > 0) {
      return NextResponse.json(
        { message: `ไม่สามารถลบได้ เพราะมีขั้นตอน Workflow ที่ใช้หมวดหมู่นี้อยู่ กรุณาลบหรือเปลี่ยนหมวดหมู่ใน "ตั้งค่า Workflow" ก่อน` },
        { status: 409 }
      );
    }
    if (docConfigCount > 0) {
      return NextResponse.json(
        { message: `ไม่สามารถลบได้ เพราะมีการตั้งค่าเลขที่เอกสารของหมวดหมู่นี้อยู่ กรุณาลบที่ "ตั้งค่าเลขที่เอกสาร" ก่อน` },
        { status: 409 }
      );
    }
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025')
      return NextResponse.json({ message: 'ไม่พบหมวดหมู่' }, { status: 404 });
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2003')
      return NextResponse.json({ message: 'ไม่สามารถลบได้ เพราะมีข้อมูลอื่นอ้างอิงหมวดหมู่นี้อยู่' }, { status: 409 });
    console.error('DELETE /api/admin/categories/[id]', e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
