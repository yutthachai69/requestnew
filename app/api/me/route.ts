import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/me - ข้อมูลผู้ใช้ล็อกอิน (สำหรับฟอร์มยื่นคำร้อง pre-fill)
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ error: 'User id not found' }, { status: 401 });

  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        position: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
      },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    return NextResponse.json({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber ?? '',
      position: user.position ?? '',
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? '',
    });
  } catch (e) {
    console.error('GET /api/me', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
