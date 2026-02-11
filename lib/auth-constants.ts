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
  'Manager',
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
];

/** Role ที่เข้า /report ได้ — ตามสเปก: Admin, Head of Department เท่านั้น */
export const reportRoles = ['Admin', 'Head of Department'];

/** Role ที่มีสิทธิ์อนุมัติ/ดำเนินการ — แสดงเมนู "รายการที่ต้องอนุมัติ/ดำเนินการ" (รวมชื่อภาษาไทยที่ใช้ในระบบ) */
export const approverRoles = [
  'Admin',
  'Head of Department',
  'Accountant',
  'Final Approver',
  'IT Reviewer',
  'IT',
  'Manager',
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
  'Head of Department': ['Head of Department', 'Manager', 'หน.แผนก', 'หัวหน้าแผนก'],
  'หน.แผนก': ['Head of Department', 'Manager', 'หน.แผนก', 'หัวหน้าแผนก'],
  'หัวหน้าแผนก': ['Head of Department', 'Manager', 'หน.แผนก', 'หัวหน้าแผนก'],
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
  Manager: 70,
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
 * ดึงรายการแท็บ/เมนูตาม role ตามสเปก
 * - Admin: หน้าแรก, ภาพรวม, รายงาน, โปรไฟล์ (ไม่มีขั้นตอนอนุมัติ / ไม่มียื่นคำร้อง)
 * - Head of Department: หน้าแรก, ภาพรวม, รายงาน, รายการที่ต้องอนุมัติ, โปรไฟล์
 * - Requester/User: หน้าแรก, ยื่นคำร้อง, โปรไฟล์
 * - Accountant / Final Approver / IT ฯลฯ: หน้าแรก, ภาพรวม, รายการที่ต้องอนุมัติ, โปรไฟล์
 */
export function getTabsForRole(roleName: string | null | undefined): TabItem[] {
  if (!roleName) return [];

  const allTabs: TabItem[] = [
    { label: 'หน้าแรก', path: '/welcome', statusFilter: null, isHistory: false, displayOrder: 0 },
    { label: 'ภาพรวม', path: '/dashboard', statusFilter: null, isHistory: false, displayOrder: 1 },
    { label: 'รายการที่ต้องอนุมัติ/ดำเนินการ', path: '/pending-tasks', statusFilter: null, isHistory: false, displayOrder: 2 },
    { label: 'ยื่นคำร้อง', path: '/request/new', statusFilter: null, isHistory: false, displayOrder: 3 },
    { label: 'รายงาน', path: '/report', statusFilter: null, isHistory: false, displayOrder: 4 },
    { label: 'โปรไฟล์', path: '/profile', statusFilter: null, isHistory: false, displayOrder: 5 },
  ];

  const baseNoRoot = allTabs.filter((t) => t.path !== '/');

  if (roleName === 'Admin') {
    return baseNoRoot
      .filter((t) => t.path !== '/pending-tasks' && t.path !== '/request/new')
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  if (['Head of Department', 'Manager', 'หน.แผนก', 'หัวหน้าแผนก'].includes(roleName)) {
    return baseNoRoot
      .filter((t) => t.path !== '/request/new')
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  if (requesterRoles.includes(roleName)) {
    return allTabs
      .filter((t) => t.path === '/welcome' || t.path === '/request/new' || t.path === '/profile')
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  if (approverRoles.includes(roleName)) {
    return baseNoRoot
      .filter((t) => t.path !== '/report' && t.path !== '/request/new')
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  return allTabs.filter((t) => t.path === '/welcome' || t.path === '/profile').sort((a, b) => a.displayOrder - b.displayOrder);
}
