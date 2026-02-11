/**
 * Email service – mirrors old frontend emailService.js.
 * Sends email via internal proxy API (env: NEXT_PUBLIC_INTERNAL_EMAIL_API_URL).
 * For server-side use, consider calling the same URL from an API route.
 */

const getEmailApiUrl = () =>
  typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_INTERNAL_EMAIL_API_URL as string | undefined)
    : undefined;

export type EmailData = {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
};

/**
 * Send email via internal email proxy API.
 * In browser, uses fetch to the proxy URL; ensure CORS or use an API route that proxies.
 */
export const sendEmail = async (emailData: EmailData): Promise<{ success: boolean }> => {
  const apiUrl = getEmailApiUrl();
  if (!apiUrl) {
    console.warn('EMAIL WARNING: NEXT_PUBLIC_INTERNAL_EMAIL_API_URL is not set. Skipping email.');
    return Promise.reject(new Error('Email API URL not configured'));
  }

  const payload = {
    businessUnit: 'TUSM',
    appName: 'RequestOnlineSystem',
    subject: emailData.subject,
    body: emailData.body,
    to: emailData.to,
    cc: emailData.cc ?? [],
    bcc: emailData.bcc ?? [],
    attachments: [],
  };

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const message =
      (errData as { error?: { message?: string } })?.error?.message ??
      res.statusText ??
      'Email send failed';
    throw new Error(message);
  }
  return { success: true };
};

const emailService = {
  sendEmail,
};

export default emailService;
