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

/** GET /api/admin/users - list all users (with role & department) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const list = await prisma.user.findMany({
      orderBy: { username: 'asc' },
      include: { role: true, department: true, accessibleCategories: { select: { id: true } } },
    });
    return NextResponse.json(
      list.map((u) => ({
        UserID: u.id,
        Username: u.username,
        FullName: u.fullName,
        Email: u.email,
        Position: u.position,
        PhoneNumber: u.phoneNumber,
        IsActive: u.isActive,
        RoleID: u.role.id,
        RoleName: u.role.roleName,
        DepartmentID: u.department?.id ?? null,
        DepartmentName: u.department?.name ?? null,
        CategoryIDs: u.accessibleCategories.map((c) => c.id),
      }))
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** POST /api/admin/users - create user */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const body = await request.json();
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '').trim();
    const fullName = String(body.fullName ?? body.name ?? '').trim();
    const email = String(body.email ?? '').trim();
    const roleId = body.roleId != null ? Number(body.roleId) : undefined;
    const departmentId = body.departmentId != null ? Number(body.departmentId) : undefined;
    const position = body.position != null ? String(body.position).trim() : null;
    const phoneNumber = body.phoneNumber != null ? String(body.phoneNumber).trim() : null;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : true;

    if (!username) return NextResponse.json({ message: 'กรุณาระบุชื่อผู้ใช้' }, { status: 400 });
    if (!password || password.length < 6)
      return NextResponse.json({ message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
    if (!fullName) return NextResponse.json({ message: 'กรุณาระบุชื่อ-นามสกุล' }, { status: 400 });
    if (!email) return NextResponse.json({ message: 'กรุณาระบุอีเมล' }, { status: 400 });
    if (roleId == null || roleId < 1)
      return NextResponse.json({ message: 'กรุณาเลือกสิทธิ์' }, { status: 400 });
    const role = await prisma.role.findUnique({ where: { id: roleId }, select: { roleName: true } });
    const noDeptRoles = ['Admin', 'Final Approver'];
    if (departmentId == null || departmentId < 1) {
      if (!role || !noDeptRoles.includes(role.roleName))
        return NextResponse.json({ message: 'กรุณาเลือกแผนก' }, { status: 400 });
    }

    const categoryIds = Array.isArray(body.categoryIds)
      ? (body.categoryIds as number[]).filter((n) => typeof n === 'number' && n >= 1)
      : [];
    const created = await prisma.user.create({
      data: {
        username,
        password: hashPassword(password),
        fullName,
        email,
        position: position || undefined,
        phoneNumber: phoneNumber || undefined,
        roleId,
        departmentId: departmentId != null && departmentId >= 1 ? departmentId : null,
        isActive,
        accessibleCategories: categoryIds.length > 0 ? { connect: categoryIds.map((id) => ({ id })) } : undefined,
      },
      include: { role: true, department: true, accessibleCategories: { select: { id: true } } },
    });
    return NextResponse.json({
      UserID: created.id,
      Username: created.username,
      FullName: created.fullName,
      Email: created.email,
      RoleName: created.role.roleName,
      DepartmentName: created.department?.name ?? null,
      IsActive: created.isActive,
      CategoryIDs: created.accessibleCategories.map((c) => c.id),
    });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2002')
      return NextResponse.json({ message: 'ชื่อผู้ใช้หรืออีเมลซ้ำ' }, { status: 400 });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
