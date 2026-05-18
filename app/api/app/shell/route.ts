import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCategoriesForUser } from '@/lib/categories-for-user';
import { countPendingTasksForUser } from '@/lib/pending-tasks-shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/app/shell — ข้อมูล layout รวมครั้งเดียว (ลด 3+ round-trips ต่อการเปลี่ยนหน้า)
 * categories + notifications + pendingCount
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = auth.id;
  const roleName = auth.roleName;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [categories, notifications, pendingCount] = await Promise.all([
      getCategoriesForUser(userId, roleName ?? undefined),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          message: true,
          requestId: true,
          isRead: true,
          createdAt: true,
        },
      }),
      countPendingTasksForUser(userId, roleName ?? ''),
    ]);

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return NextResponse.json({
      categories,
      notifications: notifications.map((n) => ({
        NotificationID: n.id,
        Message: n.message,
        RequestID: n.requestId ?? undefined,
        IsRead: n.isRead,
        CreatedAt: n.createdAt.toISOString(),
      })),
      unreadCount,
      pendingCount,
    });
  } catch (e) {
    console.error('GET /api/app/shell', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
