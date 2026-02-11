import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** GET /api/admin/audit-logs?page=1&limit=20&search=&action=&startDate=&endDate= */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  const { searchParams } = request.nextUrl;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20));
  const search = searchParams.get('search')?.trim() || '';
  const action = searchParams.get('action')?.trim() || '';
  const userId = searchParams.get('userId')?.trim() || '';
  const startDate = searchParams.get('startDate')?.trim() || '';
  const endDate = searchParams.get('endDate')?.trim() || '';

  try {
    const where: {
      action?: string;
      userId?: number;
      timestamp?: { gte?: Date; lte?: Date };
      OR?: Array<{ detail?: { contains: string }; action?: { contains: string }; user?: { OR: Array<{ fullName?: { contains: string }; username?: { contains: string } }> } }>;
    } = {};
    if (action) where.action = action;
    const uid = userId ? parseInt(userId, 10) : 0;
    if (uid > 0) where.userId = uid;
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) {
        const d = new Date(endDate);
        d.setHours(23, 59, 59, 999);
        where.timestamp.lte = d;
      }
    }
    if (search) {
      where.OR = [
        { detail: { contains: search } },
        { action: { contains: search } },
        { user: { OR: [{ fullName: { contains: search } }, { username: { contains: search } }] } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { fullName: true, username: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return NextResponse.json({
      logs: logs.map((l) => ({
        LogID: l.id,
        Timestamp: l.timestamp.toISOString(),
        Action: l.action,
        IPAddress: l.ipAddress,
        Detail: l.detail,
        FullName: l.user?.fullName ?? 'Guest',
        Username: l.user?.username ?? null,
      })),
      currentPage: page,
      totalPages,
      totalCount: total,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
