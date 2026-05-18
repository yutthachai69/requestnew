import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** GET /api/statuses — รายการสถานะ (ชื่อที่แสดงผล + สี) สำหรับใช้แสดงในระบบ (ต้องล็อกอิน) */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
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
