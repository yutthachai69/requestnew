import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** PUT /api/admin/email-templates/[id] — แก้ไข subject, body (Admin) */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    const body = await request.json();
    const subject = body.subject != null ? String(body.subject).trim() : undefined;
    const bodyContent = body.body != null ? String(body.body) : undefined;
    const data: { subject?: string; body?: string } = {};
    if (subject !== undefined) data.subject = subject;
    if (bodyContent !== undefined) data.body = bodyContent;
    const updated = await prisma.emailTemplate.update({
      where: { id },
      data,
    });
    return NextResponse.json({
      id: updated.id,
      templateName: updated.templateName,
      description: updated.description,
      subject: updated.subject,
      body: updated.body,
      placeholders: updated.placeholders,
    });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025')
      return NextResponse.json({ message: 'ไม่พบเทมเพลต' }, { status: 404 });
    console.error('PUT /api/admin/email-templates/[id]', e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
