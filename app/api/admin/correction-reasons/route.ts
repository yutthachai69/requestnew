import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** GET /api/admin/correction-reasons */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const list = await prisma.correctionReason.findMany({
      orderBy: { id: 'asc' },
    });
    return NextResponse.json(
      list.map((r) => ({
        ReasonID: r.id,
        Text: r.text,
        IsActive: r.isActive,
      }))
    );
  } catch (e) {
    console.error('GET /api/admin/correction-reasons', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** POST /api/admin/correction-reasons */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const body = await request.json();
    const text = String(body.text ?? '').trim();
    if (!text) return NextResponse.json({ message: 'กรุณาระบุข้อความเหตุผล' }, { status: 400 });
    const isActive = body.isActive !== false;
    const created = await prisma.correctionReason.create({
      data: { text, isActive },
    });
    return NextResponse.json({
      ReasonID: created.id,
      Text: created.text,
      IsActive: created.isActive,
    });
  } catch (e) {
    console.error('POST /api/admin/correction-reasons', e);
    return NextResponse.json({ message: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' }, { status: 500 });
  }
}
