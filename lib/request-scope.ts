import { prisma } from '@/lib/prisma';
import { approverRoles } from '@/lib/auth-constants';
import { conditionMatches } from '@/lib/workflow-versioning';
import { getPendingTransitionMetaForUser } from '@/lib/pending-tasks-shared';

type DateFilter = { gte?: Date; lte?: Date } | undefined;

export type RoleScopedRequestIds = {
  /** คำร้องที่อยู่ในขั้นตอนที่ Role นี้ต้องดำเนินการอยู่ตอนนี้ */
  activeIds: number[];
  /** คำร้องที่ผู้ใช้เคยดำเนินการแล้ว เก็บไว้เป็นประวัติของตนเอง */
  historyIds: number[];
  /** ขอบเขตทั้งหมดที่ควรแสดงใน Dashboard ของผู้ใช้ */
  allIds: number[];
};

/**
 * คืนขอบเขตคำร้องสำหรับผู้อนุมัติ/ผู้ดำเนินการแต่ละคน
 *
 * Admin และผู้ขอไม่ใช้ฟังก์ชันนี้ เพราะ Admin เห็นทั้งหมด ส่วนผู้ขอใช้
 * requesterId โดยตรง ฟังก์ชันนี้จึงคืน null สำหรับสองกรณีนั้น
 */
export async function getRoleScopedRequestIds(
  userId: number,
  roleName: string | null | undefined,
  dateFilter?: DateFilter,
): Promise<RoleScopedRequestIds | null> {
  if (!roleName || roleName === 'Admin' || !approverRoles.includes(roleName)) return null;

  const [meta, historyRows] = await Promise.all([
    getPendingTransitionMetaForUser(userId, roleName),
    prisma.iTRequestF07.findMany({
      where: {
        ...(dateFilter ? { createdAt: dateFilter } : {}),
        approvalHistory: { some: { approverId: userId } },
      },
      select: { id: true },
    }),
  ]);

  const historyIds = historyRows.map((row) => row.id);
  let activeIds: number[] = [];

  if (meta && meta.transitions.length > 0) {
    const categoryIds = [...new Set(meta.transitions.map((t) => t.categoryId))];
    const transitionByKey = new Map(
      meta.transitions.map((t) => [`${t.categoryId}-${t.currentStatusId}-${t.workflowVersionId ?? 0}`, t]),
    );

    const candidates = await prisma.iTRequestF07.findMany({
      where: {
        categoryId: { in: categoryIds },
        currentStatusId: { notIn: meta.closedStatusIds.length ? meta.closedStatusIds : [0] },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      select: {
        id: true,
        categoryId: true,
        workflowVersionId: true,
        currentStatusId: true,
        requiresAccountRecheck: true,
        departmentId: true,
      },
    });

    activeIds = candidates
      .filter((request) => {
        const transition = transitionByKey.get(
          `${request.categoryId}-${request.currentStatusId}-${request.workflowVersionId ?? 0}`,
        );
        if (!transition) return false;
        if (transition.filterByDepartment && request.departmentId !== meta.departmentId) return false;
        return transition.conditionKeys.some((key) => conditionMatches(key, request.requiresAccountRecheck));
      })
      .map((request) => request.id);
  }

  const allIds = [...new Set([...activeIds, ...historyIds])];
  return { activeIds, historyIds, allIds };
}
