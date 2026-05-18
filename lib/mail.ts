// lib/mail.ts — ส่งอีเมลผ่าน Internal API หรือ SMTP (Outlook)
//
// .env (เลือกอย่างใดอย่างหนึ่ง):
//   INTERNAL_EMAIL_API_URL=https://.../send
//   หรือ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM

interface EmailData {
  to: string[];
  subject: string;
  body: string;
  senderName?: string;
  replyTo?: string;
}

export type EmailSendResult =
  | { ok: true; channel: 'api' | 'smtp'; to: string[] }
  | { ok: false; reason: 'no_recipients' | 'not_configured' | 'api_failed' | 'smtp_failed'; detail?: string };

const isDev = process.env.NODE_ENV !== 'production';

function normalizeRecipients(to: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of to) {
    const email = raw?.trim();
    if (!email || !email.includes('@')) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

function getEmailApiUrl(): string | undefined {
  return (
    process.env.INTERNAL_EMAIL_API_URL?.trim() ||
    process.env.VITE_INTERNAL_EMAIL_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_INTERNAL_EMAIL_API_URL?.trim() ||
    undefined
  );
}

const sendViaSMTP = async (emailData: EmailData, to: string[]): Promise<EmailSendResult> => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  let from = process.env.SMTP_FROM ?? user;
  if (emailData.senderName && from) {
    from = `"${emailData.senderName}" <${from}>`;
  }

  if (!host || !user || !pass) {
    return { ok: false, reason: 'not_configured', detail: 'SMTP_* ไม่ครบ' };
  }

  try {
    const nodemailer = await import('nodemailer');
    const port = Number(process.env.SMTP_PORT ?? 587);

    const transporter = nodemailer.default.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { minVersion: 'TLSv1.2' },
    });

    await transporter.sendMail({
      from,
      to: to.join(', '),
      replyTo: emailData.replyTo,
      subject: emailData.subject,
      html: emailData.body,
    });

    if (isDev) console.info('[mail] ส่ง SMTP สำเร็จ →', to.join(', '));
    return { ok: true, channel: 'smtp', to };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('❌ ส่งอีเมลผ่าน SMTP ล้มเหลว:', detail);
    return { ok: false, reason: 'smtp_failed', detail };
  }
};

const sendViaAPI = async (emailData: EmailData, to: string[]): Promise<EmailSendResult> => {
  const apiUrl = getEmailApiUrl();
  if (!apiUrl) {
    return { ok: false, reason: 'not_configured', detail: 'INTERNAL_EMAIL_API_URL ไม่ได้ตั้งค่า' };
  }

  const payload = {
    businessUnit: 'TUSM_RequestOnline',
    appName: 'RequestOnlineSystem',
    subject: emailData.subject,
    body: emailData.body,
    to,
    cc: [] as string[],
    bcc: [] as string[],
    attachments: [] as unknown[],
    fromName: emailData.senderName,
    replyTo: emailData.replyTo,
  };

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('❌ ส่งอีเมลผ่าน API ล้มเหลว:', res.status, text.slice(0, 300));
      return { ok: false, reason: 'api_failed', detail: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    if (isDev) console.info('[mail] ส่ง API สำเร็จ →', to.join(', '), text.slice(0, 120));
    return { ok: true, channel: 'api', to };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('❌ ส่งอีเมลผ่าน API ล้มเหลว:', detail);
    return { ok: false, reason: 'api_failed', detail };
  }
};

export const sendApprovalEmail = async (emailData: EmailData): Promise<EmailSendResult> => {
  const to = normalizeRecipients(emailData.to);
  if (to.length === 0) {
    console.warn('⚠️ sendApprovalEmail: ไม่มีอีเมลผู้รับที่ถูกต้อง', emailData.subject);
    return { ok: false, reason: 'no_recipients' };
  }

  const viaAPI = await sendViaAPI(emailData, to);
  if (viaAPI.ok) return viaAPI;

  const viaSMTP = await sendViaSMTP(emailData, to);
  if (viaSMTP.ok) return viaSMTP;

  console.warn(
    '⚠️ ไม่สามารถส่งอีเมลได้ — ตั้งค่า INTERNAL_EMAIL_API_URL หรือ SMTP ใน .env',
    viaAPI.detail ?? viaAPI.reason,
    viaSMTP.detail ?? viaSMTP.reason
  );
  return viaSMTP.ok ? viaSMTP : viaAPI;
};
