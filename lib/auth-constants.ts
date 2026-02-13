/**
 * ค่าคงที่สำหรับ auth ใช้ใน middleware (Edge Runtime)
 * ไม่ import prisma หรือ Node modules เพื่อให้รันบน Edge ได้
 *
 * อ้างอิงสเปก: Role และโมดูลของระบบขอแก้ไขข้อมูลออนไลน์
 * Roles: Admin, Requester, Head of Department, Accountant, Final Approver, IT Reviewer
 */

/** Role ที่เข้า Dashboard ได้ — ใช้ role ที่สร้างจาก Admin > จัดการสิทธิ์ (แสดงให้ครบ) */
export const allowedDashboardRoles = [
  'Admin',
  'Requester',
  'Head of Department',
  'Accountant',
  'Final Approver',
  'IT Reviewer',
  'Warehouse',
  'warehouse',
  'IT',
  'User',
  // ชื่อที่อาจใช้ใน Admin (บัญชี, FinalApp, IT operator/viewer, คลัง)
  'account',
  'acc',
  'FinalApp',
  'It operetor',
  'It operator',
  'IT Operator',
  'It Operator',
  'It viewer',
  'IT Veiwer', // typo ที่อาจใช้ใน DB
  // ชื่อ role ภาษาไทย
  'หน.แผนก',
  'หัวหน้าแผนก',
  'บัญชี',
  // Fix for 'Request' role found in DB
  'Request',
  // หัวหน้าห้องชั่ง
  'Head of Weighbridge',
];

/** Role ที่เข้า /report ได้ — ทุก role ที่ login แล้ว (middleware จะตรวจ auth อยู่แล้ว) */
export const reportRoles: string[] | null = null; // null = ทุก role เข้าได้

/** Role ที่มีสิทธิ์อนุมัติ/ดำเนินการ — แสดงเมนู "รายการที่ต้องอนุมัติ/ดำเนินการ" (รวมชื่อภาษาไทยที่ใช้ในระบบ) */
export const approverRoles = [
  'Admin',
  'Head of Department',
  'Accountant',
  'Final Approver',
  'IT Reviewer',
  'IT',
  'Warehouse',
  'warehouse',
  'account',
  'acc',
  'FinalApp',
  'It operetor',
  'It operator',
  'IT Operator',
  'It Operator',
  'It viewer',
  'IT Veiwer',
  // ชื่อ role ภาษาไทยที่อาจใช้ใน DB/เมนู
  'หน.แผนก',
  'หัวหน้าแผนก',
  'บัญชี',
  // หัวหน้าห้องชั่ง
  'Head of Weighbridge',
];

/** Role ที่เป็นผู้ขอ (เห็นเฉพาะคำร้องของตัวเอง, แก้ไข/ลบได้เมื่อ PENDING) */
export const requesterRoles = ['Requester', 'User', 'Request'];

/**
 * ใช้สำหรับ flow อนุมัติ: ชื่อใน WorkflowStep (approverRoleName) → ชื่อ role ของ User ที่ถือว่าเป็นผู้อนุมัติขั้นนั้นได้
 * ใช้ใน pending-tasks, getPossibleActions, action API, getApproverForStep
 */
export const WORKFLOW_ROLE_TO_USER_ROLES: Record<string, string[]> = {
  'Accountant': ['Accountant', 'account', 'acc', 'บัญชี'],
  'บัญชี': ['Accountant', 'account', 'acc', 'บัญชี'],
  'Final Approver': ['Final Approver', 'FinalApp'],
  'IT': ['IT', 'It operetor', 'It operator', 'IT Operator', 'It Operator'],
  'IT Reviewer': ['IT Reviewer', 'It viewer', 'IT Veiwer'],
  'Head of Department': ['Head of Department', 'หน.แผนก', 'หัวหน้าแผนก', 'Head of Weighbridge'],
  'หน.แผนก': ['Head of Department', 'หน.แผนก', 'หัวหน้าแผนก', 'Head of Weighbridge'],
  'หัวหน้าแผนก': ['Head of Department', 'หน.แผนก', 'หัวหน้าแผนก', 'Head of Weighbridge'],
  'Head of Weighbridge': ['Head of Department', 'หน.แผนก', 'หัวหน้าแผนก', 'Head of Weighbridge'],
  'Warehouse': ['Warehouse', 'warehouse'],
  'Admin': ['Admin'],
};

/** User role name → รายการ Workflow approverRoleName ที่ user นี้ถือว่าอนุมัติขั้นนั้นได้ (รวมชื่อที่ตรงกับ role ของ user) */
export function getWorkflowRoleNamesForUser(userRoleName: string): string[] {
  if (!userRoleName) return [];
  const out: string[] = [];
  for (const [workflowRole, userRoles] of Object.entries(WORKFLOW_ROLE_TO_USER_ROLES)) {
    if (userRoles.includes(userRoleName)) out.push(workflowRole);
  }
  if (out.length === 0) out.push(userRoleName);
  else if (!out.includes(userRoleName)) out.push(userRoleName);
  return out;
}

/** Workflow approverRoleName → รายการ User role name ที่ถือว่าเป็นผู้อนุมัติขั้นนั้น (ใช้หา user ส่งเมล/แสดงปุ่ม) */
export function getUserRoleNamesForWorkflowRole(workflowRoleName: string): string[] {
  const list = WORKFLOW_ROLE_TO_USER_ROLES[workflowRoleName];
  return list?.length ? list : [workflowRoleName];
}

/**
 * คืนรายการ role name (รวมชื่อที่ใช้ใน DB) ที่ถือว่าเป็นผู้อนุมัติได้เทียบเท่า user นี้
 * ใช้สำหรับหา Role.id จาก DB ให้ตรงกับ WorkflowTransition.requiredRoleId (ที่ seed ใช้ชื่ออังกฤษ)
 */
export function getCanonicalRoleNamesForApprover(userRoleName: string): string[] {
  const workflowKeys = getWorkflowRoleNamesForUser(userRoleName);
  const names = new Set<string>();
  for (const k of workflowKeys) {
    for (const n of getUserRoleNamesForWorkflowRole(k)) names.add(n);
  }
  if (names.size === 0) names.add(userRoleName);
  return [...names];
}

/** ลำดับสิทธิ์ (Admin สูงสุด) – ใช้เปรียบเทียบหรือซ่อนเมนูตาม role */
export const ROLE_HIERARCHY: Record<string, number> = {
  Admin: 100,
  'IT Reviewer': 80,
  'It viewer': 80,
  IT: 80,
  'It operetor': 80,
  'It operator': 80,
  'Final Approver': 75,
  FinalApp: 75,
  'Head of Department': 70,
  'Accountant': 65,
  account: 65,
  Warehouse: 60,
  warehouse: 60,
  Requester: 10,
  User: 10,
};

export type TabItem = {
  label: string;
  path: string;
  statusFilter?: string | null;
  isHistory?: boolean;
  displayOrder: number;
};

/**
 * ดึงรายการแท็บ/เมนูตาม role
 * - Admin: ภาพรวม, รายงาน, โปรไฟล์ + หมวด Administrator
 * - Approver ทุกตัว (Head of Dept, IT, Accountant, Final): ภาพรวม, รายการที่ต้องอนุมัติ, รายงาน, โปรไฟล์
 * - Requester/User: ภาพรวม, รายการที่รออนุมัติ, ยื่นคำร้อง, รายงาน, โปรไฟล์
 */
export function getTabsForRole(roleName: string | null | undefined): TabItem[] {
  if (!roleName) return [];

  // ── Admin ──
  if (roleName === 'Admin') {
    return [
      { label: 'ภาพรวม', path: '/dashboard', statusFilter: null, isHistory: false, displayOrder: 1 },
      { label: 'รายงาน', path: '/report', statusFilter: null, isHistory: false, displayOrder: 4 },
      { label: 'โปรไฟล์', path: '/profile', statusFilter: null, isHistory: false, displayOrder: 5 },
    ];
  }

  // ── Approver ทุก role (Head of Dept, IT, Accountant, Final etc.) ──
  if (approverRoles.includes(roleName) || ['Head of Department', 'หน.แผนก', 'หัวหน้าแผนก'].includes(roleName)) {
    return [
      { label: 'ภาพรวม', path: '/dashboard', statusFilter: null, isHistory: false, displayOrder: 1 },
      { label: 'รายการที่ต้องอนุมัติ/ดำเนินการ', path: '/pending-tasks', statusFilter: null, isHistory: false, displayOrder: 2 },
      { label: 'รายงาน', path: '/report', statusFilter: null, isHistory: false, displayOrder: 4 },
      { label: 'โปรไฟล์', path: '/profile', statusFilter: null, isHistory: false, displayOrder: 5 },
    ];
  }

  // ── Requester / User ──
  if (requesterRoles.includes(roleName)) {
    return [
      { label: 'ภาพรวม', path: '/dashboard', statusFilter: null, isHistory: false, displayOrder: 1 },
      { label: 'ยื่นคำร้อง', path: '/request/new', statusFilter: null, isHistory: false, displayOrder: 3 },
      { label: 'รายงาน', path: '/report', statusFilter: null, isHistory: false, displayOrder: 4 },
      { label: 'โปรไฟล์', path: '/profile', statusFilter: null, isHistory: false, displayOrder: 5 },
    ];
  }

  // ── Fallback: ทุก role อื่นๆ ──
  return [
    { label: 'ภาพรวม', path: '/dashboard', statusFilter: null, isHistory: false, displayOrder: 1 },
    { label: 'โปรไฟล์', path: '/profile', statusFilter: null, isHistory: false, displayOrder: 5 },
  ];
}
