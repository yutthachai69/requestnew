import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { approverRoles } from '@/lib/auth-constants';

/** GET /api/user/bulk-permission - ตรวจสอบว่า user ปัจจุบันมีสิทธิ์ Bulk Actions หรือไม่ */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ allowed: false });

    const userId = (session.user as { id?: string }).id;
    const roleName = (session.user as { roleName?: string }).roleName;

    // ต้องเป็น approver role ก่อน
    if (!roleName || !approverRoles.includes(roleName)) {
        return NextResponse.json({ allowed: false });
    }

    if (!userId) return NextResponse.json({ allowed: false });

    const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        select: { role: { select: { allowBulkActions: true } } },
    });

    return NextResponse.json({ allowed: user?.role?.allowBulkActions === true });
}
