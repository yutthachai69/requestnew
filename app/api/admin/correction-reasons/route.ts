import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** GET /api/admin/correction-reasons */
export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
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
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
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
