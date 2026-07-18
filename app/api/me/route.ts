import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

/**
 * GET /api/me - ข้อมูลผู้ใช้ล็อกอิน (สำหรับฟอร์มยื่นคำร้อง pre-fill)
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = String(auth.id);
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
        signatureUrl: true,
        department: { select: { id: true, name: true } },
      },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    return NextResponse.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber ?? '',
        position: user.position ?? '',
        departmentId: user.departmentId,
        departmentName: user.department?.name ?? '',
        signatureUrl: user.signatureUrl,
      }
    });
  } catch (e) {
    return handleApiError(e, 'GET /api/me');
  }
}
