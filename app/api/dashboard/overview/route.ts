import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { fetchDashboardStatistics } from '@/lib/dashboard-stats';
import { fetchRequestsList } from '@/lib/requests-list';
import { handleApiError } from '@/lib/api-error';

/**
 * GET /api/dashboard/overview
 * รวม statistics + รายการคำร้องหน้าแรกใน 1 round-trip (ลด latency จาก 2 API)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = auth.id;
  const roleName = auth.roleName;
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate')?.trim() || undefined;
  const endDate = searchParams.get('endDate')?.trim() || undefined;
  const status = searchParams.get('status') ?? undefined;
  const search = searchParams.get('search') ?? undefined;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 10));

  try {
    const [stats, list] = await Promise.all([
      fetchDashboardStatistics(userId, roleName, { startDate, endDate }),
      fetchRequestsList(
        { userId, roleName },
        { status, search, startDate, endDate, page, limit }
      ),
    ]);

    return NextResponse.json({
      ...stats,
      requests: list.requests,
      currentPage: list.currentPage,
      totalPages: list.totalPages,
      totalCount: list.totalCount,
    });
  } catch (e) {
    return handleApiError(e, 'GET /api/dashboard/overview');
  }
}
