type RoundApproval = {
  approvalRound: number;
  actionType: string;
  approvalTimestamp: Date;
  comment: string | null;
  approver: { fullName: string; signatureUrl: string | null; role: { roleName: string } };
};

const actionLabels: Record<string, string> = {
  APPROVE: 'อนุมัติ', APPROVED: 'อนุมัติ', REJECT: 'ส่งกลับ/ปฏิเสธ',
  IT_PROCESS: 'ดำเนินการเสร็จสิ้น (IT)', CONFIRM_COMPLETE: 'ยืนยันปิดงาน',
};

/** Print evidence must belong to the version of the request being reviewed. */
export function currentRoundEvidence(rows: RoundApproval[], approvalRound: number) {
  const current = rows.filter(row => row.approvalRound === approvalRound)
    .sort((a, b) => a.approvalTimestamp.getTime() - b.approvalTimestamp.getTime());
  const lastIT = [...current].reverse().find(row => row.actionType.toUpperCase() === 'IT_PROCESS');
  const lastReviewer = [...current].reverse().find(row =>
    ['APPROVE', 'APPROVED', 'CONFIRM_COMPLETE'].includes(row.actionType.toUpperCase()) &&
    ['IT Reviewer', 'It viewer', 'IT Veiwer'].includes(row.approver.role.roleName));
  return {
    currentRoundHistory: current.map(row => ({
      FullName: row.approver.fullName,
      RoleName: row.approver.role.roleName,
      ActionType: actionLabels[row.actionType.toUpperCase()] ?? row.actionType,
      Comment: row.comment,
      ApprovalTimestamp: row.approvalTimestamp,
      ApprovalRound: row.approvalRound,
      SignatureUrl: row.approver.signatureUrl,
    })),
    resolvedBy: lastIT?.approver.fullName ?? null,
    resolvedAt: lastIT?.approvalTimestamp.toISOString() ?? null,
    itObstacles: lastIT?.comment || null,
    approvedByITViewer: lastReviewer?.approver.fullName ?? null,
  };
}
