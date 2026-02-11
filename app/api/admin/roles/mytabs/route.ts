import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTabsForRole } from '@/lib/auth-constants';

/**
 * GET /api/admin/roles/mytabs - แท็บสำหรับ Dashboard ตาม role (เทียบระบบเก่า)
 * คืน array ของ { Label, StatusFilter, IsHistory, DisplayOrder }
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const roleName = (session.user as { roleName?: string }).roleName;
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
