import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** GET /api/admin/special-approvers?categoryId=1 - list special approvers for a category */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  const categoryIdParam = request.nextUrl.searchParams.get('categoryId');
  const categoryId = categoryIdParam != null ? Number(categoryIdParam) : null;
  if (categoryId == null || Number.isNaN(categoryId))
    return NextResponse.json({ message: 'กรุณาระบุ categoryId' }, { status: 400 });
  try {
    const list = await (prisma as unknown as { specialApproverMapping?: { findMany: (args: { where: { categoryId: number }; include: { user: { select: { id: true; fullName: true; email: true } } } }) => Promise<{ stepSequence: number; userId: number; user: { id: number; fullName: string; email: string } }[]> } })
      .specialApproverMapping?.findMany({
        where: { categoryId },
        include: { user: { select: { id: true, fullName: true, email: true } } },
      }) ?? [];
    return NextResponse.json(
      list.map((m) => ({
        stepSequence: m.stepSequence,
        userId: m.userId,
        userFullName: m.user.fullName,
        userEmail: m.user.email,
      }))
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** POST /api/admin/special-approvers - set special approver for (categoryId, stepSequence) */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const body = await request.json();
    const categoryId = body.categoryId != null ? Number(body.categoryId) : undefined;
    const stepSequence = body.stepSequence != null ? Number(body.stepSequence) : undefined;
    const userId = body.userId != null ? Number(body.userId) : undefined;
    if (categoryId == null || categoryId < 1) return NextResponse.json({ message: 'กรุณาเลือกหมวดหมู่' }, { status: 400 });
    if (stepSequence == null || stepSequence < 1) return NextResponse.json({ message: 'กรุณาระบุลำดับขั้น' }, { status: 400 });
    if (userId == null || userId < 1) return NextResponse.json({ message: 'กรุณาเลือกผู้ใช้' }, { status: 400 });

    await (prisma as unknown as { specialApproverMapping?: { upsert: (args: { where: { categoryId_stepSequence: { categoryId: number; stepSequence: number } }; create: { categoryId: number; stepSequence: number; userId: number }; update: { userId: number } }) => Promise<unknown> } })
      .specialApproverMapping?.upsert({
        where: { categoryId_stepSequence: { categoryId, stepSequence } },
        create: { categoryId, stepSequence, userId },
        update: { userId },
      });

    return NextResponse.json({ ok: true, message: 'กำหนดผู้อนุมัติเฉพาะสำเร็จ' });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2003') return NextResponse.json({ message: 'ไม่พบหมวดหมู่หรือผู้ใช้' }, { status: 400 });
    console.error(e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

/** DELETE /api/admin/special-approvers?categoryId=1&stepSequence=1 - remove special approver */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  const categoryIdParam = request.nextUrl.searchParams.get('categoryId');
  const stepSequenceParam = request.nextUrl.searchParams.get('stepSequence');
  const categoryId = categoryIdParam != null ? Number(categoryIdParam) : null;
  const stepSequence = stepSequenceParam != null ? Number(stepSequenceParam) : null;
  if (categoryId == null || stepSequence == null)
    return NextResponse.json({ message: 'กรุณาระบุ categoryId และ stepSequence' }, { status: 400 });
  try {
    await (prisma as unknown as { specialApproverMapping?: { delete: (args: { where: { categoryId_stepSequence: { categoryId: number; stepSequence: number } } }) => Promise<unknown> } })
      .specialApproverMapping?.delete({
        where: { categoryId_stepSequence: { categoryId, stepSequence } },
      });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025')
      return NextResponse.json({ message: 'ไม่พบรายการ' }, { status: 404 });
    console.error(e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
