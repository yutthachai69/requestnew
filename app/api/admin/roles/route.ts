import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

/** GET /api/admin/roles - list all roles */
export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const list = await prisma.role.findMany({
      orderBy: { id: 'asc' },
    });
    return NextResponse.json(
      list.map((r) => ({
        RoleID: r.id,
        RoleName: r.roleName,
        Description: r.description ?? null,
        AllowBulkActions: r.allowBulkActions,
      }))
    );
  } catch (e) {
    return handleApiError(e, 'GET /api/admin/roles');
  }
}

/** POST /api/admin/roles - create role */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const body = await request.json();
    const roleName = String(body.roleName ?? body.name ?? '').trim();
    const description = body.description != null ? String(body.description).trim() || null : null;
    const allowBulkActions = Boolean(body.allowBulkActions ?? false);
    if (!roleName) return NextResponse.json({ message: 'กรุณาระบุชื่อสิทธิ์' }, { status: 400 });
    const created = await prisma.role.create({
      data: { roleName, description, allowBulkActions },
    });
    return NextResponse.json({
      RoleID: created.id,
      RoleName: created.roleName,
      Description: created.description,
      AllowBulkActions: created.allowBulkActions,
    });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002')
      return NextResponse.json({ message: 'ชื่อสิทธิ์ซ้ำ' }, { status: 400 });
    return handleApiError(e, 'POST /api/admin/roles');
  }
}
