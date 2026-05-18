import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** GET /api/admin/statuses — รายการสถานะทั้งหมด (Admin) */
export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const list = await prisma.status.findMany({
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    });
    return NextResponse.json(
      list.map((s) => ({
        id: s.id,
        code: s.code,
        displayName: s.displayName,
        colorCode: s.colorCode,
        displayOrder: s.displayOrder,
      }))
    );
  } catch (e) {
    console.error('GET /api/admin/statuses', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
