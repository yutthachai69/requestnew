import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** GET /api/admin/email-templates — รายการเทมเพลตอีเมลทั้งหมด (Admin) */
export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const list = await prisma.emailTemplate.findMany({
      orderBy: { id: 'asc' },
    });
    return NextResponse.json(
      list.map((t) => ({
        id: t.id,
        templateName: t.templateName,
        description: t.description,
        subject: t.subject,
        body: t.body,
        placeholders: t.placeholders,
      }))
    );
  } catch (e) {
    console.error('GET /api/admin/email-templates', e);
    const msg =
      e && typeof e === 'object' && 'message' in e && String((e as { message: unknown }).message).toLowerCase().includes('table')
        ? 'ยังไม่มีตาราง EmailTemplate ในฐานข้อมูล — กรุณารัน npx prisma db push แล้ว npm run db:seed'
        : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
