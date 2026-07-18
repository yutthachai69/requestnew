import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

/** GET /api/admin/actions — รายการ Action ทั้งหมด (สำหรับตั้งค่า Workflow Transitions) */
export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const list = await prisma.action.findMany({
      orderBy: { id: 'asc' },
    });
    return NextResponse.json(
      list.map((a) => ({
        id: a.id,
        actionName: a.actionName,
        displayName: a.displayName,
      }))
    );
  } catch (e) {
    return handleApiError(e, 'GET /api/admin/actions');
  }
}
