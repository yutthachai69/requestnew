/**
 * Email template helper (เทียบ frontend/src/helpers/emailTemplateHelper.js)
 * ใช้ NEXT_PUBLIC_APP_URL เป็น base URL ของแอป (ลิงก์ไปหน้ารายละเอียด/อนุมัติ)
 */

const FRONTEND_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

/** ลิงก์ไปหน้ารายละเอียดคำร้อง (ใช้ในเมลแจ้งเตือน) */
export function getRequestLink(requestId: number): string {
  return `${FRONTEND_URL}/request/${requestId}`;
}

const mainTemplate = (title: string, content: string) => `
  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h2 style="color: #1976d2;">${title}</h2>
    ${content}
    <p>ขอบคุณครับ</p>
    <p><strong>ระบบแจ้งขอแก้ไขข้อมูลออนไลน์</strong></p>
  </div>
`;

/** ข้อมูลสำหรับเมลแจ้งอนุมัติ (เทียบ getApprovalEmail) */
export type ApprovalRequestData = {
  requestId: number;
  requestNumber?: string;
  categoryName?: string;
  requesterName: string;
  approvalToken?: string;
  workOrderNo?: string;
  thaiName?: string;
  problemDetail?: string;
};

export function getApprovalEmail(requestData: ApprovalRequestData) {
  const { requestId, requestNumber, categoryName, requesterName } = requestData;
  const viewLink = getRequestLink(requestId);
  const subject = `[รออนุมัติ] คำร้อง #${requestNumber || requestId} (${categoryName ?? 'คำร้อง'})`;
  const content = `
    <p>สวัสดีครับ,</p>
    <p>มีคำร้องใหม่รอการอนุมัติจากท่าน</p>
    <ul>
      <li><strong>เลขที่:</strong> ${requestNumber || requestId}</li>
      <li><strong>หมวดหมู่:</strong> ${categoryName ?? '-'}</li>
      <li><strong>ผู้แจ้ง:</strong> ${requesterName}</li>
    </ul>
    <p>กรุณาตรวจสอบและดำเนินการต่อได้ที่ลิงก์ด้านล่างนี้:</p>
    <a href="${viewLink}" style="display: inline-block; padding: 10px 20px; background-color: #1976d2; color: #fff; text-decoration: none; border-radius: 5px;">ดูรายละเอียดคำร้อง</a>
  `;
  return { subject, body: mainTemplate('แจ้งเตือนเพื่ออนุมัติคำร้อง', content) };
}

/** เมลอนุมัติที่ลิงก์ไปหน้ารายละเอียด (ต้อง login เพื่อความปลอดภัย) – ใช้ใน f07-action */
export function getApprovalTemplate(request: {
  id: number;
  workOrderNo: string | null;
  thaiName: string;
  problemDetail: string;
}, approverName: string) {
  const baseUrl = FRONTEND_URL;
  // ลิงก์ไปหน้ารายละเอียดคำร้อง (ต้อง login ก่อน) เพื่อความปลอดภัยและบันทึกผู้อนุมัติได้
  const requestLink = `${baseUrl}/request/${request.id}`;

  const content = `
    <p>เรียนคุณ ${approverName},</p>
    <p>มีคำร้องใหม่รอการพิจารณาอนุมัติจากท่าน โดยมีรายละเอียดดังนี้:</p>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 5px; font-weight: bold; width: 120px;">เลขที่ใบงาน:</td><td>${request.workOrderNo}</td></tr>
      <tr><td style="padding: 5px; font-weight: bold;">ผู้แจ้ง:</td><td>${request.thaiName}</td></tr>
      <tr><td style="padding: 5px; font-weight: bold;">รายละเอียด:</td><td>${request.problemDetail}</td></tr>
    </table>
    <div style="margin-top: 25px; text-align: center;">
      <a href="${requestLink}" style="background-color: #2e7d32; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
        คลิกเพื่อพิจารณาอนุมัติ
      </a>
    </div>
    <p style="color: #666; font-size: 12px; margin-top: 15px;">
      หมายเหตุ: ท่านจะต้องเข้าสู่ระบบก่อนเพื่อดำเนินการอนุมัติ
    </p>
  `;

  return {
    subject: `[รออนุมัติ] คำร้องแก้ไขระบบ #${request.workOrderNo}`,
    body: mainTemplate('คำร้องใหม่รอการอนุมัติ', content),
  };
}

/** ข้อมูลสำหรับเมลส่งกลับเพื่อแก้ไข (เทียบ getRevisionEmail) */
export type RevisionRequestData = { requestId: number; requestNumber?: string };

export function getRevisionEmail(
  requestData: RevisionRequestData,
  recipient: { fullName: string }
) {
  const { requestId, requestNumber } = requestData;
  const link = getRequestLink(requestId);
  const subject = `[แจ้งเพื่อแก้ไข] คำร้อง #${requestNumber ?? requestId} ของคุณถูกส่งกลับ`;
  const content = `
    <p>เรียน ${recipient.fullName},</p>
    <p>คำร้องของคุณถูกส่งกลับมาเพื่อทำการแก้ไข กรุณาตรวจสอบความคิดเห็นจากผู้อนุมัติและดำเนินการแก้ไขที่ลิงก์ด้านล่างนี้:</p>
    <a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #ed6c02; color: #fff; text-decoration: none; border-radius: 5px;">ไปที่คำร้องเพื่อแก้ไข</a>
  `;
  return { subject, body: mainTemplate('แจ้งเตือนเพื่อแก้ไขคำร้อง', content) };
}

/** ข้อมูลสำหรับเมลแจ้งเสร็จสิ้น (เทียบ getCompletionEmail) */
export function getCompletionEmail(
  requestData: RevisionRequestData,
  recipient: { fullName: string }
) {
  const { requestId, requestNumber } = requestData;
  const link = getRequestLink(requestId);
  const subject = `[เสร็จสิ้น] คำร้อง #${requestNumber ?? requestId} ของคุณดำเนินการเรียบร้อยแล้ว`;
  const content = `
    <p>เรียน ${recipient.fullName},</p>
    <p>คำร้องของคุณได้รับการดำเนินการเสร็จสิ้นเรียบร้อยแล้ว ท่านสามารถตรวจสอบรายละเอียดได้ที่ลิงก์ด้านล่างนี้:</p>
    <a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #2e7d32; color: #fff; text-decoration: none; border-radius: 5px;">ดูรายละเอียดคำร้อง</a>
  `;
  return { subject, body: mainTemplate('แจ้งเตือนคำร้องเสร็จสิ้น', content) };
}
