import { getAuthUser } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { approverRoles } from '@/lib/auth-constants';

/** GET /api/user/bulk-permission - ตรวจสอบว่า user ปัจจุบันมีสิทธิ์ Bulk Actions หรือไม่ */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ allowed: false });

  const roleName = auth.roleName;
  if (!roleName || !approverRoles.includes(roleName)) {
    return NextResponse.json({ allowed: false });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.id },
    select: { role: { select: { allowBulkActions: true } } },
  });

  return NextResponse.json({ allowed: user?.role?.allowBulkActions ?? false });
}
