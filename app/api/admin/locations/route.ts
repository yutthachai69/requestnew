import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

/** GET /api/admin/locations - list all locations */
export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const list = await prisma.location.findMany({
      orderBy: { id: 'asc' },
      include: { categories: { select: { id: true, name: true } } },
    });
    return NextResponse.json(
      list.map((l) => ({
        LocationID: l.id,
        LocationName: l.name,
        CategoryIDs: l.categories.map((c) => c.id),
        CategoryNames: l.categories.map((c) => c.name),
      }))
    );
  } catch (e) {
    return handleApiError(e, 'GET /api/admin/locations');
  }
}

/** POST /api/admin/locations - create location */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const body = await request.json();
    const name = String(body.locationName ?? body.name ?? '').trim();
    if (!name) return NextResponse.json({ message: 'กรุณาระบุชื่อสถานที่' }, { status: 400 });
    const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds.map((id: unknown) => Number(id)).filter((n: number) => n > 0) : [];
    const created = await prisma.location.create({
      data: {
        name,
        categories: categoryIds.length ? { connect: categoryIds.map((id: number) => ({ id })) } : undefined,
      },
      include: { categories: { select: { id: true, name: true } } },
    });
    return NextResponse.json({
      LocationID: created.id,
      LocationName: created.name,
      CategoryIDs: created.categories.map((c) => c.id),
      CategoryNames: created.categories.map((c) => c.name),
    });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002')
      return NextResponse.json({ message: 'ชื่อสถานที่ซ้ำ' }, { status: 400 });
    return handleApiError(e, 'POST /api/admin/locations');
  }
}
