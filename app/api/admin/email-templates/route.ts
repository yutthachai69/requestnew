import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

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
    if (e && typeof e === 'object' && 'message' in e && String((e as { message: unknown }).message).toLowerCase().includes('table')) {
      return NextResponse.json(
        { error: 'ยังไม่มีตาราง EmailTemplate ในฐานข้อมูล — กรุณารัน npx prisma db push แล้ว npm run db:seed' },
        { status: 500 }
      );
    }
    return handleApiError(e, 'GET /api/admin/email-templates');
  }
}
