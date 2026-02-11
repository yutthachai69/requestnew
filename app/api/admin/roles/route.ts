import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** GET /api/admin/roles - list all roles */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
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
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** POST /api/admin/roles - create role */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
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
    const msg =
      e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002'
        ? 'ชื่อสิทธิ์ซ้ำ'
        : 'Server error';
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
