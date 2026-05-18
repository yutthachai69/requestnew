import { NextRequest, NextResponse } from 'next/server';
import { sendApprovalEmail } from '@/lib/mail';
import { requireAdmin, isAuthError } from '@/lib/api-auth';

/** POST /api/admin/test-email — ทดสอบส่งเมล (Admin เท่านั้น) body: { to?: string } */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  let to = auth.email ?? '';
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.to && typeof body.to === 'string') to = body.to.trim();
  } catch {
    /* empty body */
  }

  if (!to) {
    return NextResponse.json({ error: 'ไม่มีอีเมลผู้รับ (ระบุ to ใน body หรือใส่อีเมลในโปรไฟล์ admin)' }, { status: 400 });
  }

  const result = await sendApprovalEmail({
    to: [to],
    subject: '[ทดสอบ] Request Online — ส่งเมลได้',
    body: '<p>ถ้าได้รับอีเมลนี้ แสดงว่าระบบเชื่อมต่อ <strong>INTERNAL_EMAIL_API_URL</strong> หรือ SMTP สำเร็จ</p>',
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, result }, { status: 502 });
  }

  return NextResponse.json({ ok: true, result });
}
