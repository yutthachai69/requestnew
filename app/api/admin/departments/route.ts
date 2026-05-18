import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** GET /api/admin/departments - list all departments */
export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const list = await prisma.department.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(
      list.map((d) => ({ DepartmentID: d.id, DepartmentName: d.name, IsActive: d.isActive }))
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** POST /api/admin/departments - create department */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const body = await request.json();
    const name = String(body.departmentName ?? body.name ?? '').trim();
    if (!name) return NextResponse.json({ message: 'กรุณาระบุชื่อแผนก' }, { status: 400 });
    const created = await prisma.department.create({
      data: { name, isActive: true },
    });
    return NextResponse.json({
      DepartmentID: created.id,
      DepartmentName: created.name,
      IsActive: created.isActive,
    });
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002'
      ? 'ชื่อแผนกซ้ำ'
      : 'Server error';
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
