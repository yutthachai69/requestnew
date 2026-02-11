import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { approverRoles } from '@/lib/auth-constants';

/** แปลงชื่อ role ใน Workflow เป็นข้อความไทยสำหรับแสดงสถานะ */
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

/** สถานะแสดงผลตามขั้น workflow — PENDING ขั้น 2+ = อนุมัติจากหัวหน้าฝ่ายแล้ว รอบัญชีดำเนินการ */
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

/**
 * GET /api/requests - รายการคำร้อง (filter: categoryId, status, search, page, limit)
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get('categoryId');
  const status = searchParams.get('status');
  const searchQuery = searchParams.get('search')?.trim();
  const startDate = searchParams.get('startDate')?.trim();
  const endDate = searchParams.get('endDate')?.trim();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 10));

  const userId = (session.user as { id?: string }).id;
  const roleName = (session.user as { roleName?: string }).roleName;

  try {
    const where: Record<string, unknown> = {};
    if (categoryId) where.categoryId = Number(categoryId);
    if (status) {
      if (status === 'PENDING') {
        (where as { status?: { notIn: string[] } }).status = { notIn: ['CLOSED', 'REJECTED'] };
      } else {
        where.status = String(status);
      }
    }
    if (startDate || endDate) {
      (where as { createdAt?: { gte?: Date; lte?: Date } }).createdAt = {};
      if (startDate) (where.createdAt as { gte?: Date }).gte = new Date(startDate);
      if (endDate) {
        const d = new Date(endDate);
        d.setHours(23, 59, 59, 999);
        (where.createdAt as { lte?: Date }).lte = d;
      }
    }
    if (searchQuery) {
      where.OR = [
        { workOrderNo: { contains: searchQuery } },
        { thaiName: { contains: searchQuery } },
        { problemDetail: { contains: searchQuery } },
      ];
    }
    // Admin และ role ที่เป็นผู้อนุมัติ (Head of Department, IT, Manager ฯลฯ) เห็นคำร้องทั้งหมดในภาพรวม เพื่อให้กดเข้าไปอนุมัติได้
    // เฉพาะ Requester/User ที่เห็นเฉพาะคำร้องของตัวเอง
    const canSeeAllRequests = roleName === 'Admin' || (roleName && approverRoles.includes(roleName));
    if (!canSeeAllRequests && userId) {
      where.requesterId = Number(userId);
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

    const categoryIds = [...new Set(requests.map((r) => r.categoryId))];
    const steps =
      categoryIds.length > 0
        ? await prisma.workflowStep.findMany({
          where: { categoryId: { in: categoryIds } },
          select: { categoryId: true, stepSequence: true, approverRoleName: true },
        })
        : [];
    const stepLabelByKey = new Map<string, string>();
    steps.forEach((s) => stepLabelByKey.set(`${s.categoryId}-${s.stepSequence}`, s.approverRoleName));

    const totalPages = Math.ceil(total / limit);
    return NextResponse.json({
      requests: requests.map((r) => {
        const currentStep = (r as { currentApprovalStep?: number }).currentApprovalStep ?? 1;
        const stepLabel = r.status === 'PENDING' ? stepLabelByKey.get(`${r.categoryId}-${currentStep}`) ?? null : null;
        const statusDisplay =
          (r as { currentStatus?: { displayName: string } }).currentStatus?.displayName ??
          getStatusDisplay(r.status, currentStep, stepLabel);
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
          status: r.status,
          currentStatusId: (r as { currentStatusId?: number }).currentStatusId ?? 1,
          currentStatus: (r as { currentStatus?: { id: number; code: string; displayName: string } }).currentStatus,
          currentApprovalStep: currentStep,
          currentStepLabel: stepLabel,
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
    });
  } catch (e) {
    console.error('GET /api/requests', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
