import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** GET /api/admin/actions — รายการ Action ทั้งหมด (สำหรับตั้งค่า Workflow Transitions) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const list = await prisma.action.findMany({
      orderBy: { id: 'asc' },
    });
    return NextResponse.json(
      list.map((a) => ({
        id: a.id,
        actionName: a.actionName,
        displayName: a.displayName,
      }))
    );
  } catch (e) {
    console.error('GET /api/admin/actions', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
