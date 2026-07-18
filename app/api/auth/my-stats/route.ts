import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

/** GET /api/auth/my-stats - สถิติของผู้ใช้ปัจจุบัน (จำนวนคำร้องที่สร้าง, จำนวนครั้งที่ดำเนินการ) */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = String(auth.id);
  if (!userId) return NextResponse.json({ requestsCreated: 0, actionsTaken: 0 });

  try {
    const uid = Number(userId);
    const [requestsCreated, actionsTaken] = await Promise.all([
      prisma.iTRequestF07.count({ where: { requesterId: uid } }),
      prisma.auditLog.count({
        where: {
          userId: uid,
          action: { in: ['APPROVE', 'REJECT'] },
        },
      }),
    ]);

    return NextResponse.json({ requestsCreated, actionsTaken });
  } catch (e) {
    return handleApiError(e, 'GET /api/auth/my-stats');
  }
}
