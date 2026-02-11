import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** GET /api/admin/email-templates — รายการเทมเพลตอีเมลทั้งหมด (Admin) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
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
