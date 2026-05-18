import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/hash';
import { requireAuth, isAuthError } from '@/lib/api-auth';

/** PUT /api/auth/change-password - เปลี่ยนรหัสผ่าน (ต้องล็อกอิน) */
export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const oldPassword = String(body.oldPassword ?? '').trim();
    const newPassword = String(body.newPassword ?? '').trim();

    if (!oldPassword || !newPassword) {
      return NextResponse.json({ message: 'กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: auth.id } });
    if (!user) return NextResponse.json({ message: 'ไม่พบผู้ใช้' }, { status: 404 });

    const check = verifyPassword(oldPassword, user.password);
    if (!check.ok) {
      return NextResponse.json({ message: 'รหัสผ่านเดิมไม่ถูกต้อง' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashPassword(newPassword) },
    });

    return NextResponse.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
  } catch (e) {
    console.error('PUT /api/auth/change-password', e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
