import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** PUT /api/admin/roles/[id] */
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
    const roleName = body.roleName != null ? String(body.roleName).trim() : undefined;
    const description = body.description !== undefined ? (body.description == null || body.description === '' ? null : String(body.description).trim()) : undefined;
    const allowBulkActions =
      body.allowBulkActions !== undefined ? Boolean(body.allowBulkActions) : undefined;
    const data: { roleName?: string; description?: string | null; allowBulkActions?: boolean } = {};
    if (roleName !== undefined) data.roleName = roleName;
    if (description !== undefined) data.description = description;
    if (allowBulkActions !== undefined) data.allowBulkActions = allowBulkActions;
    const updated = await prisma.role.update({
      where: { id },
      data,
    });
    return NextResponse.json({
      RoleID: updated.id,
      RoleName: updated.roleName,
      Description: updated.description,
      AllowBulkActions: updated.allowBulkActions,
    });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025')
      return NextResponse.json({ message: 'ไม่พบสิทธิ์' }, { status: 404 });
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002')
      return NextResponse.json({ message: 'ชื่อสิทธิ์ซ้ำ' }, { status: 400 });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

/** DELETE /api/admin/roles/[id] */
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
    const role = await prisma.role.findUnique({ where: { id }, include: { users: true } });
    if (role && role.users.length > 0)
      return NextResponse.json(
        { message: 'ไม่สามารถลบได้ เนื่องจากมีผู้ใช้งานในสิทธิ์นี้' },
        { status: 400 }
      );
    await prisma.role.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025')
      return NextResponse.json({ message: 'ไม่พบสิทธิ์' }, { status: 404 });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
