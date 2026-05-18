/** actionType ที่บันทึกใน ApprovalHistory เมื่ออนุมัติ/ดำเนินการ */
export const APPROVAL_DONE_ACTION_TYPES = [
  'APPROVE',
  'APPROVED',
  'Approve',
  'IT_PROCESS',
  'CONFIRM_COMPLETE',
] as const;

export const REJECT_ACTION_TYPES = ['Reject', 'REJECT'] as const;
