import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/hash';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** PUT /api/admin/users/[id] - update user (optional new password) */
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
    const fullName = body.fullName != null ? String(body.fullName).trim() : undefined;
    const email = body.email != null ? String(body.email).trim() : undefined;
    const roleId = body.roleId != null ? Number(body.roleId) : undefined;
    const departmentId = body.departmentId != null ? Number(body.departmentId) : undefined;
    const position = body.position !== undefined ? (body.position ? String(body.position).trim() : null) : undefined;
    const phoneNumber = body.phoneNumber !== undefined ? (body.phoneNumber ? String(body.phoneNumber).trim() : null) : undefined;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;
    const password = body.password != null ? String(body.password).trim() : undefined;
    const categoryIds = body.categoryIds;

    if (password !== undefined && password.length > 0 && password.length < 6)
      return NextResponse.json({ message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 });

    const noDeptRoles = ['Admin', 'Final Approver'];
    const roleIdForDept = roleId !== undefined ? roleId : (await prisma.user.findUnique({ where: { id }, select: { roleId: true } }))?.roleId;
    const roleForDept = roleIdForDept != null ? await prisma.role.findUnique({ where: { id: roleIdForDept }, select: { roleName: true } }) : null;
    const canOmitDept = roleForDept && noDeptRoles.includes(roleForDept.roleName);

    const data: {
      fullName?: string;
      email?: string;
      roleId?: number;
      departmentId?: number | null;
      position?: string | null;
      phoneNumber?: string | null;
      isActive?: boolean;
      password?: string;
      accessibleCategories?: { set: { id: number }[] };
    } = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (email !== undefined) data.email = email;
    if (roleId !== undefined) data.roleId = roleId;
    if (departmentId !== undefined) {
      if (departmentId == null || departmentId < 1) {
        if (!canOmitDept) return NextResponse.json({ message: 'กรุณาเลือกแผนก' }, { status: 400 });
        data.departmentId = null;
      } else {
        data.departmentId = departmentId;
      }
    }
    if (position !== undefined) data.position = position;
    if (phoneNumber !== undefined) data.phoneNumber = phoneNumber;
    if (isActive !== undefined) data.isActive = isActive;
    if (password !== undefined && password.length > 0) data.password = hashPassword(password);
    if (categoryIds !== undefined) {
      const ids = Array.isArray(categoryIds)
        ? (categoryIds as number[]).filter((n) => typeof n === 'number' && n >= 1)
        : [];
      data.accessibleCategories = { set: ids.map((id) => ({ id })) };
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      include: { role: true, department: true, accessibleCategories: { select: { id: true } } },
    });
    return NextResponse.json({
      UserID: updated.id,
      Username: updated.username,
      FullName: updated.fullName,
      Email: updated.email,
      RoleName: updated.role.roleName,
      DepartmentName: updated.department?.name ?? null,
      IsActive: updated.isActive,
      CategoryIDs: updated.accessibleCategories.map((c) => c.id),
    });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2025') return NextResponse.json({ message: 'ไม่พบผู้ใช้' }, { status: 404 });
    if (code === 'P2002') return NextResponse.json({ message: 'อีเมลซ้ำ' }, { status: 400 });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

/** DELETE /api/admin/users/[id] */
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
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025')
      return NextResponse.json({ message: 'ไม่พบผู้ใช้' }, { status: 404 });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
