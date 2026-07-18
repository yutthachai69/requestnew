import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

/** GET /api/master/departments — รายการแผนกที่เปิดใช้งาน (สำหรับผู้ที่ไม่มีแผนกในระบบ เช่น Admin/Final Approver เลือกแผนกที่ยื่นคำร้อง) */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const list = await prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return NextResponse.json(
      list.map((d) => ({ DepartmentID: d.id, DepartmentName: d.name }))
    );
  } catch (e) {
    return handleApiError(e, 'GET /api/master/departments');
  }
}
