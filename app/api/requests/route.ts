import { NextRequest, NextResponse } from 'next/server';
import { fetchRequestsList } from '@/lib/requests-list';
import { requireAuth, isAuthError } from '@/lib/api-auth';

/**
 * GET /api/requests - รายการคำร้อง (filter: categoryId, status, excludeStatus, search, page, limit)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const userId = auth.id;
  const roleName = auth.roleName;

  try {
    const result = await fetchRequestsList(
      { userId, roleName },
      {
        categoryId: searchParams.get('categoryId') ?? undefined,
        status: searchParams.get('status') ?? undefined,
        excludeStatus: searchParams.get('excludeStatus') ?? undefined,
        search: searchParams.get('search') ?? undefined,
        startDate: searchParams.get('startDate')?.trim() || undefined,
        endDate: searchParams.get('endDate')?.trim() || undefined,
        page: Math.max(1, Number(searchParams.get('page')) || 1),
        limit: Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 10)),
      }
    );
    return NextResponse.json(result);
  } catch (e) {
    console.error('GET /api/requests', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
