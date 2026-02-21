import { prisma } from './prisma';
import { approverRoles, getCanonicalRoleNamesForApprover } from './auth-constants';

/**
 * นับจำนวนคำร้องที่รอให้ user นี้เป็นผู้อนุมัติ/ดำเนินการ (logic เดียวกับ GET /api/requests สำหรับ tab PENDING)
 * ใช้แสดงตัวเลขบน Dashboard ให้ตรงกับหน้ารายการที่ต้องอนุมัติ
 */
export async function getPendingTasksCount(userId: number, roleName: string | undefined): Promise<number> {
  // Fast exits — ก่อน query DB ใดๆ
  if (roleName === 'Admin') return 0;
  if (!roleName || !approverRoles.includes(roleName)) return 0;

  try {
    const canonicalRoleNames = getCanonicalRoleNamesForApprover(roleName);

    // ยิง user + role พร้อมกัน (parallel — ไม่ต้องรอกัน)
    const [currentUser, roles] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, departmentId: true },
      }),
      prisma.role.findMany({
        where: { roleName: { in: canonicalRoleNames } },
        select: { id: true },
      }),
    ]);

    if (!currentUser) return 0;
    const roleIds = roles.map((r) => r.id);
    if (roleIds.length === 0) return 0;

    // หา transitions ที่ user มีสิทธิ์
    const myTransitions = await prisma.workflowTransition.findMany({
      where: { requiredRoleId: { in: roleIds } },
      select: { categoryId: true, currentStatusId: true, filterByDepartment: true },
    });

    if (myTransitions.length === 0) return 0;

    // Build strict OR conditions matching requests/route.ts logic
    const orConditions: { categoryId: number; currentStatusId: number; departmentId?: number }[] = [];
    for (const t of myTransitions) {
      const condition: { categoryId: number; currentStatusId: number; departmentId?: number } = {
        categoryId: t.categoryId,
        currentStatusId: t.currentStatusId,
      };
      if (t.filterByDepartment && currentUser.departmentId) {
        condition.departmentId = currentUser.departmentId;
      }
      orConditions.push(condition);
    }

    if (orConditions.length === 0) return 0;

    const count = await prisma.iTRequestF07.count({
      where: {
        status: { notIn: ['CLOSED', 'REJECTED'] },
        OR: orConditions,
      },
    });

    return count;
  } catch (error) {
    console.error('getPendingTasksCount error:', error);
    return 0;
  }
}
