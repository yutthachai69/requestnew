import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { approverRoles, getCanonicalRoleNamesForApprover } from '@/lib/auth-constants';

/** POST /api/requests/bulk-action - ดำเนินการกลุ่ม (อนุมัติ/ปฏิเสธหลายรายการ) */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as { id?: string }).id;
  const userName = session.user.name ?? '';
  const roleName = (session.user as { roleName?: string }).roleName;

  // ─── 🔒 Security Check 1: ต้องเป็น role ที่มีสิทธิ์อนุมัติ ───
  if (!roleName || !approverRoles.includes(roleName)) {
    return NextResponse.json(
      { message: 'คุณไม่มีสิทธิ์ดำเนินการแบบกลุ่ม (Role ไม่อนุญาต)' },
      { status: 403 }
    );
  }

  // ─── 🔒 Security Check 2: ตรวจ allowBulkActions จาก Role ใน DB ───
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const currentUser = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: {
      id: true,
      departmentId: true,
      role: { select: { allowBulkActions: true, roleName: true } },
    },
  });
  if (!currentUser?.role?.allowBulkActions) {
    return NextResponse.json(
      { message: 'Role ของคุณไม่ได้เปิดสิทธิ์ดำเนินการแบบกลุ่ม (Bulk Actions) กรุณาติดต่อ Admin' },
      { status: 403 }
    );
  }

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

    // ─── 🔒 Security Check 3: ตรวจ WorkflowTransition สำหรับแต่ละคำร้อง ───
    // หา roleIds ที่ตรงกับ user
    const canonicalRoleNames = getCanonicalRoleNamesForApprover(roleName);
    const matchingRoles = await prisma.role.findMany({
      where: { roleName: { in: canonicalRoleNames } },
      select: { id: true },
    });
    const myRoleIds = matchingRoles.map((r) => r.id);

    // หา transitions ที่ user นี้มีสิทธิ์ทำ
    const myTransitions = await prisma.workflowTransition.findMany({
      where: { requiredRoleId: { in: myRoleIds } },
      select: { categoryId: true, currentStatusId: true, filterByDepartment: true, nextStatusId: true },
    });

    // สร้าง lookup map: "categoryId-currentStatusId" → transition info
    const transitionMap = new Map<string, { filterByDepartment: boolean; nextStatusId: number }>();
    for (const t of myTransitions) {
      const key = `${t.categoryId}-${t.currentStatusId}`;
      if (!transitionMap.has(key)) {
        transitionMap.set(key, { filterByDepartment: t.filterByDepartment, nextStatusId: t.nextStatusId });
      }
    }

    // ดึงคำร้องที่เลือกมา (ต้องไม่ปิดงานแล้ว)
    const closedStatusIds = await prisma.status.findMany({
      where: { code: { in: ['CLOSED', 'REJECTED'] } },
      select: { id: true },
    }).then((r) => r.map((s) => s.id));

    const selectedRequests = await prisma.iTRequestF07.findMany({
      where: {
        id: { in: requestIds },
        currentStatusId: { notIn: closedStatusIds.length > 0 ? closedStatusIds : [0] },
      },
      select: { id: true, workOrderNo: true, categoryId: true, currentStatusId: true, departmentId: true },
    });

    // กรองเฉพาะคำร้องที่ user มีสิทธิ์จริง
    const rejectedStatus = await prisma.status.findFirst({ where: { code: 'REJECTED' }, select: { id: true } });
    const allowedRequests: { id: number; workOrderNo: string | null; nextStatusId: number }[] = [];
    const skippedRequests: string[] = [];

    for (const req of selectedRequests) {
      const key = `${req.categoryId}-${req.currentStatusId}`;
      const transition = transitionMap.get(key);

      if (!transition) {
        // ไม่มี transition ที่ตรง → user ไม่มีสิทธิ์
        skippedRequests.push(req.workOrderNo ?? `#${req.id}`);
        continue;
      }

      if (transition.filterByDepartment && req.departmentId !== currentUser.departmentId) {
        // ต้องเป็นแผนกเดียวกัน แต่ไม่ใช่
        skippedRequests.push(req.workOrderNo ?? `#${req.id}`);
        continue;
      }

      // กรณีปฏิเสธ → ใช้ status REJECTED, กรณีอนุมัติ → ใช้ nextStatusId จาก transition
      const nextId = actionName === 'REJECT' ? rejectedStatus?.id : transition.nextStatusId;
      allowedRequests.push({ id: req.id, workOrderNo: req.workOrderNo, nextStatusId: nextId ?? transition.nextStatusId });
    }

    if (allowedRequests.length === 0) {
      return NextResponse.json({
        message: `ไม่มีคำร้องที่คุณมีสิทธิ์ดำเนินการ${skippedRequests.length > 0 ? ` (ข้าม ${skippedRequests.length} รายการที่ไม่ตรงสิทธิ์/แผนก)` : ''}`,
      }, { status: 400 });
    }

    // ดำเนินการ: อัพเดตทีละรายการเพราะ nextStatusId อาจต่างกัน
    const nextStatusLookup = new Map<number, { code: string }>();
    const uniqueNextIds = [...new Set(allowedRequests.map((r) => r.nextStatusId))];
    const nextStatuses = await prisma.status.findMany({
      where: { id: { in: uniqueNextIds } },
      select: { id: true, code: true },
    });
    nextStatuses.forEach((s) => nextStatusLookup.set(s.id, { code: s.code }));

    await prisma.$transaction([
      // อัพเดตแต่ละคำร้อง
      ...allowedRequests.map((r) =>
        prisma.iTRequestF07.update({
          where: { id: r.id },
          data: {
            status: nextStatusLookup.get(r.nextStatusId)?.code ?? (actionName === 'REJECT' ? 'REJECTED' : 'APPROVED'),
            currentStatusId: r.nextStatusId,
            updatedAt: new Date(),
          },
        })
      ),
      // สร้าง Audit Log
      ...allowedRequests.map((r) =>
        prisma.auditLog.create({
          data: {
            action: actionName,
            userId: Number(userId),
            detail: `Bulk: Request #${r.workOrderNo} ${actionName} by ${userName} (${roleName})${comment ? `: ${comment}` : ''}`,
            requestId: r.id,
          },
        })
      ),
    ]);

    const resultMsg = `ดำเนินการ ${actionName === 'APPROVE' ? 'อนุมัติ' : 'ปฏิเสธ'} ${allowedRequests.length} รายการสำเร็จ`;
    const skippedMsg = skippedRequests.length > 0
      ? ` (ข้าม ${skippedRequests.length} รายการที่ไม่ตรงสิทธิ์: ${skippedRequests.join(', ')})`
      : '';

    return NextResponse.json({
      message: resultMsg + skippedMsg,
      count: allowedRequests.length,
      skipped: skippedRequests,
    });
  } catch (e) {
    console.error('POST /api/requests/bulk-action', e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
