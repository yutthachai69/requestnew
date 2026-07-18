import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { approverRoles } from '@/lib/auth-constants';
import { getPendingTransitionMetaForUser } from '@/lib/pending-tasks-shared';
import { handleApiError } from '@/lib/api-error';

const APPROVAL_DONE_TYPES = ['APPROVE', 'APPROVED', 'Approve', 'IT_PROCESS', 'CONFIRM_COMPLETE'];

/**
 * GET /api/pending-tasks — รายการคำร้องที่รอให้ผู้ล็อกอินดำเนินการ
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = auth.id;
  const roleName = auth.roleName;

  try {
    if (roleName === 'Admin') return NextResponse.json({ requests: [] });
    if (!roleName || !approverRoles.includes(roleName)) return NextResponse.json({ requests: [] });

    const meta = await getPendingTransitionMetaForUser(userId, roleName);
    if (!meta || meta.transitions.length === 0) return NextResponse.json({ requests: [] });

    const categoryIds = [...new Set(meta.transitions.map((t) => t.categoryId))];
    const transitionByKey = new Map(meta.transitions.map((t) => [`${t.categoryId}-${t.currentStatusId}`, t]));

    const includeOpts = {
      department: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      requester: { select: { id: true, fullName: true, username: true } },
      currentStatus: { select: { id: true, code: true, displayName: true } },
    };

    const allPending = await prisma.iTRequestF07.findMany({
      where: {
        categoryId: { in: categoryIds },
        currentStatusId: { notIn: meta.closedStatusIds.length ? meta.closedStatusIds : [0] },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: includeOpts,
    });

    let requests = allPending.filter((r) => {
      const key = `${r.categoryId}-${r.currentStatusId ?? 1}`;
      const t = transitionByKey.get(key);
      if (!t) return false;
      if (t.filterByDepartment && r.departmentId !== meta.departmentId) return false;
      return true;
    });

    if (requests.length > 0) {
      const histories = await prisma.approvalHistory.findMany({
        where: {
          requestId: { in: requests.map((r) => r.id) },
          approverId: userId,
          actionType: { in: APPROVAL_DONE_TYPES },
        },
        select: { requestId: true, approvalLevel: true },
      });
      const done = new Set(histories.map((h) => `${h.requestId}-${Number(h.approvalLevel)}`));

      requests = requests.filter((r) => {
        const key = `${r.categoryId}-${r.currentStatusId ?? 1}`;
        const t = transitionByKey.get(key);
        if (!t) return false;
        return t.stepSequences.some((seq) => !done.has(`${r.id}-${seq}`));
      });
    }

    return NextResponse.json({
      requests: requests.map((r) => toPendingItem(r)),
    });
  } catch (e) {
    return handleApiError(e, 'GET /api/pending-tasks');
  }
}

function toPendingItem(r: {
  id: number;
  workOrderNo: string | null;
  thaiName?: string;
  problemDetail: string;
  status: string | null;
  createdAt: Date;
  approvalToken: string | null;
  currentStatusId?: number;
  currentApprovalStep?: number;
  department: { id: number; name: string };
  category: { id: number; name: string };
  location: { id: number; name: string };
  requester: { id: number; fullName: string; username: string };
  currentStatus?: { id: number; code: string; displayName: string };
}) {
  return {
    id: r.id,
    workOrderNo: r.workOrderNo,
    RequestNumber: r.workOrderNo,
    thaiName: r.thaiName ?? r.requester?.fullName,
    problemDetail: r.problemDetail,
    status: r.status,
    statusDisplay: r.currentStatus?.displayName ?? r.status,
    currentStatusId: r.currentStatusId ?? 1,
    currentStatus: r.currentStatus,
    currentApprovalStep: r.currentApprovalStep ?? 1,
    approvalToken: r.approvalToken,
    createdAt: r.createdAt,
    department: r.department,
    category: r.category,
    location: r.location,
    requester: r.requester,
  };
}
