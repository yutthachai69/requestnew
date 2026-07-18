import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { fetchDashboardStatistics } from '@/lib/dashboard-stats';
import { handleApiError } from '@/lib/api-error';

/** GET /api/dashboard/statistics?startDate=&endDate= */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = auth.id;
  const roleName = auth.roleName;
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate')?.trim() || undefined;
  const endDate = searchParams.get('endDate')?.trim() || undefined;

  try {
    const stats = await fetchDashboardStatistics(userId, roleName, { startDate, endDate });
    return NextResponse.json(stats);
  } catch (e) {
    return handleApiError(e, 'GET /api/dashboard/statistics');
  }
}
