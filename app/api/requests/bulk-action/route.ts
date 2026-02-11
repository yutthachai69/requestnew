import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** POST /api/requests/bulk-action - ดำเนินการกลุ่ม (อนุมัติ/ปฏิเสธหลายรายการ) */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as { id?: string }).id;
  const userName = session.user.name ?? '';

  try {
    const body = await request.json();
    const requestIds = Array.isArray(body.requestIds) ? body.requestIds.map(Number) : [];
    const actionName = String(body.actionName ?? '').toUpperCase();
    const comment = body.comment != null ? String(body.comment).trim() : '';

    if (requestIds.length === 0) {
      return NextResponse.json({ message: 'กรุณาเลือกอย่างน้อย 1 รายการ' }, { status: 400 });
    }
    if (actionName !== 'APPROVE' && actionName !== 'REJECT') {
      return NextResponse.json({ message: 'actionName ต้องเป็น APPROVE หรือ REJECT' }, { status: 400 });
    }
    if (actionName === 'REJECT' && !comment) {
      return NextResponse.json({ message: 'กรุณาระบุเหตุผลในการปฏิเสธ' }, { status: 400 });
    }

    const newStatus = actionName === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const pending = await prisma.iTRequestF07.findMany({
      where: { id: { in: requestIds }, status: 'PENDING' },
      select: { id: true, workOrderNo: true },
    });

    await prisma.$transaction([
      prisma.iTRequestF07.updateMany({
        where: { id: { in: pending.map((r) => r.id) } },
        data: { status: newStatus, updatedAt: new Date() },
      }),
      ...pending.map((r) =>
        prisma.auditLog.create({
          data: {
            action: actionName,
            userId: userId ? Number(userId) : null,
            detail: `Bulk: Request #${r.workOrderNo} ${actionName} by ${userName}${comment ? `: ${comment}` : ''}`,
          },
        })
      ),
    ]);

    return NextResponse.json({
      message: `ดำเนินการ ${actionName === 'APPROVE' ? 'อนุมัติ' : 'ปฏิเสธ'} ${pending.length} รายการสำเร็จ`,
      count: pending.length,
    });
  } catch (e) {
    console.error('POST /api/requests/bulk-action', e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
