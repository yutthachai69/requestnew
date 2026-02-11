import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** GET /api/auth/my-stats - สถิติของผู้ใช้ปัจจุบัน (จำนวนคำร้องที่สร้าง, จำนวนครั้งที่ดำเนินการ) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as { id?: string }).id;
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
    console.error('GET /api/auth/my-stats', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
