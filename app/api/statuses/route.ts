import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** GET /api/statuses — รายการสถานะ (ชื่อที่แสดงผล + สี) สำหรับใช้แสดงในระบบ (ต้องล็อกอิน) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const list = await prisma.status.findMany({
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    });
    return NextResponse.json(
      list.map((s) => ({
        code: s.code,
        displayName: s.displayName,
        colorCode: s.colorCode,
      }))
    );
  } catch (e) {
    console.error('GET /api/statuses', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
