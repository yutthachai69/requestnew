/**
 * เมนู Admin (เทียบ MainLayout adminMenuItems ในระบบเก่า)
 * ใช้ใน layout /admin
 */
export const adminMenuItems: { text: string; path: string }[] = [
  { text: 'จัดการผู้ใช้งาน', path: '/admin/users' },
  { text: 'จัดการสิทธิ์ (Role)', path: '/admin/roles' },
  { text: 'ตั้งค่า Workflow', path: '/admin/workflow-transitions' },
  { text: 'จัดการ Email Templates', path: '/admin/email-templates' },
  { text: 'จัดการประเภทการแก้ไข', path: '/admin/correction-types' },
  { text: 'จัดการเหตุผลการแก้ไข', path: '/admin/correction-reasons' },
  { text: 'จัดการสถานะ', path: '/admin/statuses' },
  { text: 'จัดการแผนก', path: '/admin/departments' },
  { text: 'จัดการหมวดหมู่', path: '/admin/categories' },
  { text: 'จัดการสถานที่', path: '/admin/locations' },
  { text: 'ตั้งค่าเลขที่เอกสาร', path: '/admin/doc-config' },
  { text: 'ประวัติการใช้งาน (Log)', path: '/admin/audit-logs' },
  { text: 'รายงานประวัติการแก้ไข', path: '/admin/audit-report' },
];
