import { prisma } from '@/lib/prisma';
import { approverRoles } from '@/lib/auth-constants';
import {
  APPROVAL_DONE_ACTION_TYPES,
  REJECT_ACTION_TYPES,
} from '@/lib/approval-actions';
import { buildDateRangeFilter } from '@/lib/date-range';
import { getRoleScopedRequestIds } from '@/lib/request-scope';

export type RequestsListParams = {
  categoryId?: string;
  status?: string;
  excludeStatus?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
};

export type RequestsListSession = {
  userId: number;
  roleName?: string | null;
};

function stepLabelToThai(label: string | null): string {
  if (!label) return 'ผู้อนุมัติ';
  const m: Record<string, string> = {
    'Head of Department': 'หัวหน้าฝ่าย',
    Manager: 'หัวหน้าฝ่าย',
    Accountant: 'บัญชี',
    account: 'บัญชี',
    บัญชี: 'บัญชี',
    'Final Approver': 'ผู้อนุมัติขั้นสุดท้าย',
    FinalApp: 'ผู้อนุมัติขั้นสุดท้าย',
    IT: 'IT',
    'It operetor': 'IT',
    'It operator': 'IT',
    'IT Reviewer': 'ผู้ตรวจรับงาน IT',
    'It viewer': 'ผู้ตรวจรับงาน IT',
    Warehouse: 'คลัง',
  };
  return m[label] ?? label;
}

function getStatusDisplay(status: string, currentStep: number, stepLabel: string | null): string {
  if (status === 'PENDING') {
    if (currentStep <= 1) return 'รอดำเนินการ';
    const who = stepLabelToThai(stepLabel);
    return `อนุมัติจากหัวหน้าฝ่ายแล้ว รอ${who}ดำเนินการ`;
  }
  if (status === 'CLOSED') return 'ปิดงานแล้ว';
  if (status === 'REJECTED') return 'ปฏิเสธ/ส่งกลับ';
  if (status === 'APPROVED') return 'อนุมัติแล้ว';
  return status;
}

async function requestIdsFromApprovalHistory(
  approverId: number,
  tab: 'APPROVED' | 'REJECTED',
  maxIds: number
): Promise<number[]> {
  const actionTypes =
    tab === 'APPROVED' ? [...APPROVAL_DONE_ACTION_TYPES] : [...REJECT_ACTION_TYPES];
  const rows = await prisma.approvalHistory.findMany({
    where: { approverId, actionType: { in: actionTypes } },
    select: { requestId: true },
    distinct: ['requestId'],
    orderBy: { approvalTimestamp: 'desc' },
    take: maxIds,
  });
  return rows.map((r) => r.requestId);
}

export async function fetchRequestsList(
  session: RequestsListSession,
  params: RequestsListParams
) {
  const {
    categoryId,
    status,
    excludeStatus,
    search: searchQuery,
    startDate,
    endDate,
    page = 1,
    limit = 10,
  } = params;

  const userId = session.userId;
  const roleName = session.roleName;

  const where: Record<string, unknown> = {};
  if (categoryId) where.categoryId = Number(categoryId);

  if (status) {
    if (status === 'PENDING') {
      (where as { status?: { notIn: string[] } }).status = { notIn: ['CLOSED', 'REJECTED'] };
    } else {
      where.status = String(status);
    }
  } else if (excludeStatus) {
    (where as { status?: { not: string } }).status = { not: excludeStatus };
  }

  const createdAtFilter = buildDateRangeFilter(startDate, endDate);
  if (createdAtFilter) {
    (where as { createdAt?: { gte?: Date; lte?: Date } }).createdAt = createdAtFilter;
  }

  let searchFilter: Record<string, unknown>[] | null = null;
  if (searchQuery?.trim()) {
    const q = searchQuery.trim();
    searchFilter = [
      { workOrderNo: { contains: q } },
      { thaiName: { contains: q } },
      { problemDetail: { contains: q } },
    ];
  }

  if (roleName === 'Admin') {
    if (searchFilter) where.OR = searchFilter;
  } else if (roleName && approverRoles.includes(roleName)) {
    // ใช้ขอบเขตเดียวกับ Dashboard: งานที่ Role นี้รับผิดชอบอยู่
    // และประวัติที่ผู้ใช้คนนี้เคยดำเนินการแล้ว
    // ประวัติอนุมัติ/ปฏิเสธใช้ query เฉพาะของแท็บนั้น ไม่ต้องโหลด scope ปัจจุบันซ้ำ
    const scoped = status === 'APPROVED' || status === 'REJECTED'
      ? null
      : await getRoleScopedRequestIds(userId, roleName, createdAtFilter);

    if (status === 'PENDING') {
      where.id = { in: scoped?.activeIds ?? [] };
    } else if (status === 'APPROVED' || status === 'REJECTED') {
      const actedIds = await requestIdsFromApprovalHistory(
        userId,
        status as 'APPROVED' | 'REJECTED',
        300,
      );
      where.id = { in: actedIds };
      delete where.status;
    } else if (status === 'CLOSED') {
      where.id = { in: scoped?.historyIds ?? [] };
    } else {
      where.id = { in: scoped?.allIds ?? [] };
    }

    if (searchFilter) where.OR = searchFilter;
  } else {
    where.requesterId = userId;
    if (searchFilter) where.OR = searchFilter;
  }

  const [requests, total] = await Promise.all([
    prisma.iTRequestF07.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        department: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        requester: { select: { id: true, fullName: true, username: true } },
        currentStatus: { select: { id: true, code: true, displayName: true, colorCode: true } },
      },
    }),
    prisma.iTRequestF07.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    requests: requests.map((r) => {
      const currentStep = (r as { currentApprovalStep?: number }).currentApprovalStep ?? 1;
      const statusDisplay =
        (r as { currentStatus?: { displayName: string } }).currentStatus?.displayName ??
        getStatusDisplay(r.status ?? '', currentStep, null);
      return {
        id: r.id,
        RequestID: r.id,
        workOrderNo: r.workOrderNo,
        RequestNumber: r.workOrderNo,
        thaiName: r.thaiName,
        phone: r.phone,
        problemDetail: r.problemDetail,
        systemType: r.systemType,
        isMoneyRelated: r.isMoneyRelated,
        requiresAccountRecheck: r.requiresAccountRecheck,
        status: r.status,
        currentStatusId: (r as { currentStatusId?: number }).currentStatusId ?? 1,
        currentStatus: (r as {
          currentStatus?: { id: number; code: string; displayName: string; colorCode?: string };
        }).currentStatus,
        currentApprovalStep: currentStep,
        currentStepLabel: null,
        statusDisplay,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        department: r.department,
        category: r.category,
        location: r.location,
        requester: r.requester,
      };
    }),
    currentPage: page,
    totalPages,
    totalCount: total,
  };
}
