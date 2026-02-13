// lib/mail.ts
// ส่งอีเมลผ่าน Outlook SMTP (nodemailer) หรือ Internal API
// 
// วิธี 1: ใช้ Outlook SMTP (แนะนำ) - ตั้งค่าใน .env:
//   SMTP_HOST=smtp.office365.com
//   SMTP_PORT=587
//   SMTP_USER=your-email@your-company.com
//   SMTP_PASSWORD=your-password-or-app-password
//   SMTP_FROM=your-email@your-company.com
//
// วิธี 2: ใช้ Internal Email API:
//   INTERNAL_EMAIL_API_URL=https://your-email-api.example.com/send

interface EmailData {
  to: string[];
  subject: string;
  body: string;
  senderName?: string;
  replyTo?: string;
}

// ส่งผ่าน SMTP (nodemailer)
const sendViaSMTP = async (emailData: EmailData): Promise<boolean> => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  // สร้าง Sender format: "ชื่อผู้ส่ง (via System)" <email@domain.com>
  let from = process.env.SMTP_FROM ?? user;
  if (emailData.senderName && from) {
    // Clean senderName to avoid special characters issues if needed
    from = `"${emailData.senderName}" <${from}>`;
  }

  if (!host || !user || !pass) {
    return false; // ไม่ได้ตั้งค่า SMTP
  }

  try {
    // Dynamic import เพื่อไม่ให้ crash ถ้าไม่มี nodemailer
    const nodemailer = await import('nodemailer');
    const port = Number(process.env.SMTP_PORT ?? 587);

    const transporter = nodemailer.default.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { minVersion: 'TLSv1.2' }, // ใช้ TLS ที่ปลอดภัย
    });

    const info = await transporter.sendMail({
      from,
      to: emailData.to.join(', '),
      replyTo: emailData.replyTo, // เพิ่ม Reply-To
      subject: emailData.subject,
      html: emailData.body,
    });

    console.log(`📧 ส่งอีเมลสำเร็จผ่าน SMTP ไปยัง: ${emailData.to.join(', ')} (ID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error('❌ ส่งอีเมลผ่าน SMTP ล้มเหลว:', error);
    return false;
  }
};

// ส่งผ่าน Internal API
const sendViaAPI = async (emailData: EmailData): Promise<boolean> => {
  // Support both Next.js and Vite style env vars for compatibility
  const apiUrl = process.env.INTERNAL_EMAIL_API_URL ?? process.env.VITE_INTERNAL_EMAIL_API_URL;

  if (!apiUrl) {
    return false;
  }

  const payload = {
    businessUnit: 'TUSM_RequestOnline',
    appName: 'RequestOnlineSystem',
    subject: emailData.subject,
    body: emailData.body,
    to: emailData.to,
    cc: [],
    bcc: [],
    attachments: [],
    // Extra fields if the API supports them or logs them
    fromName: emailData.senderName,
    replyTo: emailData.replyTo,
  };

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // API might return 200 even if some logic failed, but we assume 200-299 is success
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    console.log(`📧 ส่งอีเมลสำเร็จผ่าน API (${apiUrl}) ไปยัง: ${emailData.to.join(', ')}`);
    return true;
  } catch (error) {
    console.error('❌ ส่งอีเมลผ่าน API ล้มเหลว:', error);
    return false;
  }
};

export const sendApprovalEmail = async (emailData: EmailData) => {
  // ลองส่งผ่าน Internal API ก่อน (ใช้แบบเดียวกับระบบเก่า)
  const sentViaAPI = await sendViaAPI(emailData);
  if (sentViaAPI) return;

  // ถ้าไม่มี API ลองส่งผ่าน SMTP
  const sentViaSMTP = await sendViaSMTP(emailData);
  if (sentViaSMTP) return;

  console.warn('⚠️ ไม่สามารถส่งอีเมลได้ - กรุณาตั้งค่า INTERNAL_EMAIL_API_URL หรือ SMTP ใน .env');
};