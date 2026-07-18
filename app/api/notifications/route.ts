import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api-auth';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }

  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        message: true,
        requestId: true,
        isRead: true,
        createdAt: true,
      },
    });

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    const mapped = notifications.map((n) => ({
      NotificationID: n.id,
      Message: n.message,
      RequestID: n.requestId ?? undefined,
      IsRead: n.isRead,
      CreatedAt: n.createdAt.toISOString(),
    }));

    return NextResponse.json({ notifications: mapped, unreadCount });
  } catch (error) {
    return handleApiError(error, 'GET /api/notifications');
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    if (body.id) {
      await prisma.notification.updateMany({
        where: { id: body.id, userId: auth.id },
        data: { isRead: true },
      });
    } else if (body.all) {
      await prisma.notification.updateMany({
        where: { userId: auth.id, isRead: false },
        data: { isRead: true },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'PATCH /api/notifications');
  }
}
