import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/hash';
import { handleApiError } from '@/lib/api-error';

/** PUT /api/admin/users/[id] - update user (optional new password) */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
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
    if (code === 'P2002') return NextResponse.json({ message: 'ชื่อผู้ใช้ซ้ำ' }, { status: 400 });
    return handleApiError(e, 'PUT /api/admin/users/[id]');
  }
}

/** DELETE /api/admin/users/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    // A user who has already acted in the system is referenced by AuditLog /
    // ApprovalHistory / ITRequestF07 rows that must not be rewritten or lost.
    // Refuse with a message the admin can act on instead of letting the FK
    // violation surface as a 500.
    const [auditCount, approvalCount, requestCount] = await Promise.all([
      prisma.auditLog.count({ where: { userId: id } }),
      prisma.approvalHistory.count({ where: { approverId: id } }),
      prisma.iTRequestF07.count({ where: { requesterId: id } }),
    ]);
    if (auditCount > 0 || approvalCount > 0 || requestCount > 0) {
      return NextResponse.json(
        {
          message:
            'ไม่สามารถลบผู้ใช้นี้ได้ เพราะมีประวัติการใช้งานในระบบ (คำร้อง/การอนุมัติ/บันทึกการตรวจสอบ) กรุณาปิดใช้งานบัญชีแทนการลบ',
        },
        { status: 409 }
      );
    }

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025')
      return NextResponse.json({ message: 'ไม่พบผู้ใช้' }, { status: 404 });
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2003')
      return NextResponse.json(
        { message: 'ไม่สามารถลบผู้ใช้นี้ได้ เพราะมีข้อมูลอื่นอ้างอิงอยู่ กรุณาปิดใช้งานบัญชีแทน' },
        { status: 409 }
      );
    return handleApiError(e, 'DELETE /api/admin/users/[id]');
  }
}
