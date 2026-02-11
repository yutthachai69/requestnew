
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ notifications: [], unreadCount: 0 }); // Return empty for unauth instead of 401 for UX
    }
    const userId = Number((session.user as any).id);

    try {
        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
                id: true,
                message: true,
                requestId: true,
                isRead: true,
                createdAt: true,
            }
        });

        const unreadCount = await prisma.notification.count({
            where: { userId, isRead: false }
        });

        // Map to frontend expected format
        const mapped = notifications.map(n => ({
            NotificationID: n.id,
            Message: n.message,
            RequestID: n.requestId ?? undefined,
            IsRead: n.isRead,
            CreatedAt: n.createdAt.toISOString()
        }));

        return NextResponse.json({ notifications: mapped, unreadCount });
    } catch (error) {
        console.error('GET /api/notifications error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = Number((session.user as any).id);

    try {
        const body = await req.json();
        // Mark Single
        if (body.id) {
            await prisma.notification.updateMany({
                where: { id: body.id, userId }, // Ensuring ownership
                data: { isRead: true }
            });
        }
        // Mark All
        else if (body.all) {
            await prisma.notification.updateMany({
                where: { userId, isRead: false },
                data: { isRead: true }
            });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}
