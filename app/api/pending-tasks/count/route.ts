import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api-auth';
import { countPendingTasksForUser } from '@/lib/pending-tasks-shared';

/** GET /api/pending-tasks/count — badge รายการรออนุมัติ */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ count: 0 });

  try {
    const count = await countPendingTasksForUser(user.id, user.roleName ?? '');
    return NextResponse.json({ count });
  } catch (e) {
    console.error('GET /api/pending-tasks/count', e);
    return NextResponse.json({ count: 0 });
  }
}
