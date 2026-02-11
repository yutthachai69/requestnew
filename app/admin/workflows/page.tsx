import { redirect } from 'next/navigation';

/**
 * หน้าเก่า "ตั้งค่า Workflow (ลำดับการอนุมัติ)" ถูกรวมกับ "ตั้งค่า Workflow ขั้นตอนอนุมัติ"
 * Redirect ไปหน้า workflow-transitions ที่ใช้จัดการ WorkflowTransition จริง
 */
export default function AdminWorkflowsRedirect() {
  redirect('/admin/workflow-transitions');
}
