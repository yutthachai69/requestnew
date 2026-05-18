import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { getTabsForRole } from '@/lib/auth-constants';

/**
 * GET /api/admin/roles/mytabs - แท็บสำหรับ Dashboard ตาม role (เทียบระบบเก่า)
 * คืน array ของ { Label, StatusFilter, IsHistory, DisplayOrder }
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const roleName = auth.roleName;
  const tabs = getTabsForRole(roleName);

  const result = tabs.map((t, i) => ({
    Label: t.label,
    Path: t.path,
    StatusFilter: t.statusFilter ?? 'all',
    IsHistory: t.isHistory ?? false,
    DisplayOrder: t.displayOrder ?? i,
  }));

  return NextResponse.json(result);
}
