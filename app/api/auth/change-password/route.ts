import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/hash';

/** PUT /api/auth/change-password - เปลี่ยนรหัสผ่าน (ต้องล็อกอิน) */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (!user) return NextResponse.json({ message: 'ไม่พบผู้ใช้' }, { status: 404 });
    if (user.password !== hashPassword(oldPassword)) {
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
