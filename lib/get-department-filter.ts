import { prisma } from '@/lib/prisma';
import { approverRoles, getCanonicalRoleNamesForApprover } from '@/lib/auth-constants';

/**
 * คืน departmentId filter สำหรับ role ปัจจุบัน
 * - Admin → null (เห็นทั้งระบบ)
 * - Approver ที่มี filterByDepartment → departmentId ของ user
 * - Approver ที่ไม่มี filterByDepartment → null (เห็นทั้งระบบ)
 * - Requester → ไม่ใช้ฟังก์ชันนี้ (ใช้ requesterId แทน)
 *
 * ใช้ single query แทน 3 queries เดิม (role → transition → user)
 */
export async function getDepartmentFilter(
    userId: number,
    roleName: string | null | undefined,
): Promise<{ departmentId?: number; requesterId?: number }> {
    // Admin: ไม่ filter
    if (roleName === 'Admin') return {};

    // Requester: filter ด้วย requesterId
    if (!roleName || !approverRoles.includes(roleName)) {
        return { requesterId: userId };
    }

    // Approver: query role + transition + user พร้อมกัน (1 round trip แทน 3)
    const canonicalNames = getCanonicalRoleNamesForApprover(roleName);

    // ยิง role lookup กับ user lookup พร้อมกัน
    const [matchingRoles, currentUser] = await Promise.all([
        prisma.role.findMany({
            where: { roleName: { in: canonicalNames } },
            select: { id: true },
        }),
        prisma.user.findUnique({
            where: { id: userId },
            select: { departmentId: true },
        }),
    ]);

    const myRoleIds = matchingRoles.map((r) => r.id);
    if (myRoleIds.length === 0) return {};

    // หา transition (ต้องรอ roleIds ก่อน)
    const myTransitions = await prisma.workflowTransition.findMany({
        where: { requiredRoleId: { in: myRoleIds } },
        select: { filterByDepartment: true },
    });

    const hasDeptFilter = myTransitions.some((t) => t.filterByDepartment);
    if (hasDeptFilter && currentUser?.departmentId) {
        return { departmentId: currentUser.departmentId };
    }

    return {};
}
