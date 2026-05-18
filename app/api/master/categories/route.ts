import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { getCategoriesForUser } from '@/lib/categories-for-user';

/**
 * GET /api/master/categories
 * คืนรายการหมวดหมู่: Admin ได้ทั้งหมด, role อื่นได้ตาม accessibleCategories
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = auth.id;
  const roleName = auth.roleName;
  try {
    const list = await getCategoriesForUser(userId ? Number(userId) : null, roleName ?? undefined);
    return NextResponse.json(list);
  } catch (e) {
    console.error('GET /api/master/categories', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
