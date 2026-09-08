import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { approverRoles } from '@/lib/auth-constants';
import { executeApproval } from '@/lib/services/approvalService';
import { handleApiError } from '@/lib/api-error';

const MAX_BULK_REQUESTS = 100;

/** POST /api/requests/bulk-action - execute the same workflow as a single action. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  if (!auth.roleName || !approverRoles.includes(auth.roleName)) {
    return NextResponse.json(
      { message: 'คุณไม่มีสิทธิ์ดำเนินการแบบกลุ่ม' },
      { status: 403 }
    );
  }

  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: auth.id },
      select: { role: { select: { allowBulkActions: true } } },
    });
    if (!currentUser?.role?.allowBulkActions) {
      return NextResponse.json(
        { message: 'Role ของคุณไม่ได้เปิดสิทธิ์ดำเนินการแบบกลุ่ม' },
        { status: 403 }
      );
    }

    const body = await request.json() as {
      requestIds?: unknown;
      actionName?: unknown;
      comment?: unknown;
      versions?: Record<string, unknown>;
    };
    const requestIds = Array.isArray(body.requestIds)
      ? [...new Set(body.requestIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    const actionName = String(body.actionName ?? '').toUpperCase();
    const comment = body.comment != null ? String(body.comment).trim() : '';

    if (requestIds.length === 0) {
      return NextResponse.json({ message: 'กรุณาเลือกรายการอย่างน้อย 1 รายการ' }, { status: 400 });
    }
    if (requestIds.length > MAX_BULK_REQUESTS) {
      return NextResponse.json(
        { message: `ดำเนินการแบบกลุ่มได้ไม่เกิน ${MAX_BULK_REQUESTS} รายการต่อครั้ง` },
        { status: 400 }
      );
    }
    if (actionName !== 'APPROVE' && actionName !== 'REJECT') {
      return NextResponse.json(
        { message: 'actionName ต้องเป็น APPROVE หรือ REJECT' },
        { status: 400 }
      );
    }
    if (actionName === 'REJECT' && !comment) {
      return NextResponse.json({ message: 'กรุณาระบุเหตุผลในการปฏิเสธ' }, { status: 400 });
    }

    const selectedRequests = await prisma.iTRequestF07.findMany({
      where: { id: { in: requestIds } },
      select: { id: true, workOrderNo: true },
    });
    const requestLabels = new Map(
      selectedRequests.map((item) => [item.id, item.workOrderNo ?? `#${item.id}`])
    );

    const processed: string[] = [];
    const skipped: string[] = [];

    // Sequential execution keeps each transition based on the latest database
    // state and avoids concurrent actions racing the same request.
    for (const requestId of requestIds) {
      const result = await executeApproval({
        expectedUpdatedAt: typeof body.versions?.[requestId] === 'string' ? body.versions[requestId] as string : '',
        requestId,
        actionName,
        comment,
        actor: {
          userId: auth.id,
          roleName: auth.roleName,
          userName: auth.name ?? '',
          ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || undefined,
        },
        source: 'api',
      });
      const label = requestLabels.get(requestId) ?? `#${requestId}`;

      if (result.ok) {
        processed.push(label);
      } else {
        skipped.push(`${label} (${result.code})`);
      }
    }

    if (processed.length === 0) {
      return NextResponse.json(
        {
          message: 'ไม่มีคำร้องที่คุณมีสิทธิ์ดำเนินการ',
          count: 0,
          skipped,
        },
        { status: 400 }
      );
    }

    const skippedMessage = skipped.length > 0
      ? ` ข้าม ${skipped.length} รายการที่ไม่ผ่านสิทธิ์หรือสถานะที่กำหนด`
      : '';
    return NextResponse.json({
      message: `ดำเนินการ${actionName === 'APPROVE' ? 'อนุมัติ' : 'ปฏิเสธ'} ${processed.length} รายการสำเร็จ${skippedMessage}`,
      count: processed.length,
      processed,
      skipped,
    });
  } catch (error) {
    return handleApiError(error, 'POST /api/requests/bulk-action');
  }
}
