import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** GET /api/master/departments — รายการแผนกที่เปิดใช้งาน (สำหรับผู้ที่ไม่มีแผนกในระบบ เช่น Admin/Final Approver เลือกแผนกที่ยื่นคำร้อง) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    console.error('GET /api/master/departments', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
