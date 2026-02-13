// lib/workflow.ts
import { prisma } from './prisma';
import { getUserRoleNamesForWorkflowRole } from './auth-constants';

// --- State Machine (WorkflowTransition) ---

export type TransitionWithRelations = Awaited<ReturnType<typeof findTransitionsByStatus>>[number];

/** ดึง transitions ที่ออกจากสถานะปัจจุบัน (ตาม category และ optional correctionType) */
export async function findTransitionsByStatus(
  categoryId: number,
  currentStatusId: number,
  correctionTypeId?: number | null
) {
  const list = await prisma.workflowTransition.findMany({
    where: {
      categoryId,
      currentStatusId,
      correctionTypeId: correctionTypeId ?? null,
    },
    orderBy: { stepSequence: 'asc' },
    include: {
      action: { select: { id: true, actionName: true, displayName: true } },
      requiredRole: { select: { id: true, roleName: true } },
      nextStatus: { select: { id: true, code: true, displayName: true } },
    },
  });
  return list;
}

/** ดึง transitions ที่ใช้ได้กับคำร้อง (สถานะปัจจุบัน + category; correctionType ใช้จากคำร้องถ้ามี) */
export async function findPossibleTransitions(request: {
  categoryId: number;
  currentStatusId: number;
  correctionTypeIds?: number[];
}) {
  const { categoryId, currentStatusId, correctionTypeIds } = request;

  // 1. ถ้ามี Correction Type ให้หา Transition ที่เฉพาะเจาะจงกับ Type นั้นก่อน (เรียง Priority ตามที่ database อาจจะมี แต่ที่นี่เราเช็คทีละตัว)
  if (correctionTypeIds && correctionTypeIds.length > 0) {
    for (const typeId of correctionTypeIds) {
      const transitions = await findTransitionsByStatus(categoryId, currentStatusId, typeId);
      if (transitions.length > 0) return transitions;
    }
  }

  // 2. ถ้าไม่เจอ (หรือไม่มี Correction Type) ให้หา Transition ทั่วไป (Generic Rules)
  return findTransitionsByStatus(categoryId, currentStatusId, null);
}

/** ตรวจสอบว่าในขั้นตอนนี้ (stepSequence) ได้รับการอนุมัติครบทุกคนหรือยัง (สำหรับ Parallel Approval) */
export async function checkParallelApprovalsCompleted(
  requestId: number,
  currentStatusId: number,
  currentStepSequence: number,
  tx?: any
) {
  const db = tx || prisma;

  // นับจำนวน Transaction ที่ต้องทำในขั้นตอนนี้
  // Query นี้ต้องแมตช์กับ logic ที่ใช้หา Transition จริงๆ (ถ้าซับซ้อนอาจต้องปรับ)
  // เบื้องต้นเช็คจาก Generic Rules สำหรับ step นี้
  const request = await db.iTRequestF07.findUnique({
    where: { id: requestId },
    include: { correctionTypes: true }
  });
  if (!request) return { allApproved: false, totalTransitions: 0, totalApprovals: 0 };

  const categoryId = request.categoryId;
  // Correction Types of request
  const correctionTypeIds = request.correctionTypes.map((c: any) => c.correctionTypeId);

  // หา Transitions ทั้งหมดที่เป็นไปได้สำหรับ Step นี้
  let possibleTransitions = await findPossibleTransitions({
    categoryId,
    currentStatusId,
    correctionTypeIds
  });

  // กรองเอาเฉพาะ transition ที่อยู่ใน stepSequence นี้ และไม่ใช่การ REJECT (การปฏิเสธมักจะทำได้เลย ไม่ต้องรอครบ)
  const transitionsInStep = possibleTransitions.filter(t =>
    t.stepSequence === currentStepSequence && t.action.actionName !== 'REJECT'
  );

  const totalTransitions = transitionsInStep.length;

  // นับจำนวนการอนุมัติที่เกิดขึ้นแล้วในขั้นตอนนี้ (จาก History)
  // ApprovalLevel ใน History เก็บ StepSequence
  // ActionType ต้อง match กับที่อนุมัติ (เช่น "อนุมัติ", "Approved" - ต้องดูว่าบันทึกอะไรลง DB)
  const approvalsInStep = await db.approvalHistory.findMany({
    where: {
      requestId,
      approvalLevel: currentStepSequence, // Prisma Decimal mapped to number/string based on config, assume compatibility or cast
      actionType: { in: ['APPROVE', 'APPROVED', 'Approve', 'IT_PROCESS', 'CONFIRM_COMPLETE'] } // ปรับตาม Action Name ที่บันทึกจริง
    },
    select: { approverId: true },
    distinct: ['approverId']
  });

  const totalApprovals = approvalsInStep.length;

  return {
    allApproved: totalApprovals >= totalTransitions,
    totalTransitions,
    totalApprovals
  };
}

/** หารายชื่อผู้อนุมัติสำหรับ transition นี้ (สำหรับส่งเมล) — ใช้ requiredRole + SpecialApproverMapping(stepSequence) + filterByDepartment */
export async function getApproversForTransition(
  transition: { requiredRoleId: number; filterByDepartment: boolean; categoryId: number; stepSequence: number },
  departmentId?: number
): Promise<{ id: number; username: string; email: string; fullName: string }[]> {
  const role = await prisma.role.findUnique({ where: { id: transition.requiredRoleId }, select: { roleName: true } });
  if (!role) return [];

  const stepSeq = transition.stepSequence > 0 ? transition.stepSequence : 1;
  try {
    const special = await (prisma as any).specialApproverMapping?.findMany({
      where: { categoryId: transition.categoryId, stepSequence: stepSeq },
      include: { user: { select: { id: true, username: true, email: true, fullName: true } } },
    });
    if (special?.length) {
      return special.map((s: any) => ({ id: s.user.id, username: s.user.username, email: s.user.email, fullName: s.user.fullName }));
    }
  } catch {
    // ignore
  }

  const roleNames = getUserRoleNamesForWorkflowRole(role.roleName);
  const users = await prisma.user.findMany({
    where: {
      role: { roleName: { in: roleNames } },
      isActive: true,
      ...(transition.filterByDepartment && departmentId != null ? { departmentId } : {}),
    },
    select: { id: true, username: true, email: true, fullName: true },
  });
  return users;
}

/** หาผู้อนุมัติคนแรกสำหรับสถานะเริ่มต้น (PENDING) — ใช้ transition แรกที่ออกจาก initial status */
export async function getFirstApproverForCategoryFromTransitions(
  categoryId: number,
  departmentId?: number
): Promise<{ id: number; username: string; email: string; fullName: string } | null> {
  const initial = await prisma.status.findFirst({ where: { isInitialState: true }, select: { id: true } });
  if (!initial) return null;
  const transitions = await findTransitionsByStatus(categoryId, initial.id, null);
  const first = transitions.find((t) => t.action.actionName === 'APPROVE') ?? transitions[0];
  if (!first) return null;
  const approvers = await getApproversForTransition(first, departmentId);
  return approvers[0] ?? null;
}

/** หารายชื่อผู้อนุมัติขั้นถัดไป หลังจากคำร้องเปลี่ยนไปอยู่ที่ currentStatusId (สำหรับส่งเมล) */
export async function getNextApproversForStatus(
  categoryId: number,
  currentStatusId: number,
  departmentId?: number,
  correctionTypeId?: number | null
): Promise<{ id: number; username: string; email: string; fullName: string }[]> {
  const transitions = await findTransitionsByStatus(categoryId, currentStatusId, correctionTypeId);
  const first = transitions.find((t) => t.action.actionName === 'APPROVE') ?? transitions.find((t) => t.action.actionName === 'IT_PROCESS') ?? transitions[0];
  if (!first) return [];
  return getApproversForTransition(first, departmentId);
}

/** หาผู้อนุมัติตาม Workflow ของ category — ขั้นที่ stepSequence (1 = หัวหน้าฝ่าย, 2 = บัญชี, ...) */
export async function getApproverForStep(
  categoryId: number,
  stepSequence: number,
  departmentId?: number
): Promise<{ id: number; username: string; email: string; fullName: string } | null> {
  const step = await prisma.workflowStep.findFirst({
    where: { categoryId, stepSequence },
    orderBy: { stepSequence: 'asc' },
  });
  if (!step) return null;

  const filterByDept = (step as { filterByDepartment?: boolean }).filterByDepartment ?? false;

  try {
    const special = await (prisma as any).specialApproverMapping?.findUnique({
      where: { categoryId_stepSequence: { categoryId, stepSequence } },
      include: { user: { select: { id: true, username: true, email: true, fullName: true } } },
    });
    if (special?.user) return { id: special.user.id, username: special.user.username, email: special.user.email, fullName: special.user.fullName };
  } catch {
    // ตาราง SpecialApproverMapping ยังไม่มี
  }

  const roleNames = getUserRoleNamesForWorkflowRole(step.approverRoleName);
  const users = await prisma.user.findMany({
    where: {
      role: { roleName: { in: roleNames } },
      isActive: true,
      ...(filterByDept && departmentId != null ? { departmentId } : {}),
    },
    select: { id: true, username: true, email: true, fullName: true, departmentId: true },
  });
  if (users.length === 0) return null;
  if (departmentId != null && !filterByDept) {
    const inDept = users.find((u) => u.departmentId === departmentId);
    if (inDept) return { id: inDept.id, username: inDept.username, email: inDept.email, fullName: inDept.fullName };
  }
  return { id: users[0].id, username: users[0].username, email: users[0].email, fullName: users[0].fullName };
}

/** หาผู้อนุมัติขั้นที่ 1 (เทียบ getFirstApproverForCategory เดิม) */
export async function getFirstApproverForCategory(categoryId: number, departmentId?: number) {
  return getApproverForStep(categoryId, 1, departmentId);
}

/** นับจำนวนขั้นใน Workflow ของ category (ขั้นสุดท้าย = ปิดงาน) */
export async function getWorkflowStepCount(categoryId: number): Promise<number> {
  const steps = await prisma.workflowStep.findMany({
    where: { categoryId },
    orderBy: { stepSequence: 'asc' },
    select: { stepSequence: true },
  });
  if (steps.length === 0) return 0;
  return Math.max(...steps.map((s) => s.stepSequence));
}

/** @deprecated ใช้ getFirstApproverForCategory ก่อน; fallback เมื่อ category ไม่มี Workflow กำหนด */
export async function getDeptManagerEmail(departmentId: number) {
  const manager = await prisma.user.findFirst({
    where: {
      departmentId: departmentId,
      role: {
        roleName: {
          in: ['Head of Department', 'Approver'],
        },
      },
      isActive: true,
    },
    select: { id: true, username: true, email: true, fullName: true },
  });
  return manager || null;
}