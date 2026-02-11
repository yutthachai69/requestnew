import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** GET /api/admin/statuses — รายการสถานะทั้งหมด (Admin) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
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
