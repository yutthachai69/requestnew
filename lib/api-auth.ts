import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-cache';

export type AuthUser = {
  id: number;
  roleName: string | null;
  email: string | null;
  name: string | null;
};

export function isAuthError(result: AuthUser | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}

/** อ่าน session ปัจจุบัน (ใช้ React.cache ต่อ request) */
export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await getSession();
  if (!session?.user) return null;

  const id = Number((session.user as { id?: string }).id);
  if (!Number.isFinite(id) || id < 1) return null;

  return {
    id,
    roleName: (session.user as { roleName?: string }).roleName ?? null,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
}

/** 401 ถ้ายังไม่ login */
export async function requireAuth(): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return user;
}

/** 401 / 403 สำหรับ Admin */
export async function requireAdmin(): Promise<AuthUser | NextResponse> {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (auth.roleName !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return auth;
}

/** 401 / 403 ถ้า role ไม่อยู่ในรายการที่อนุญาต */
export async function requireRole(allowedRoles: string[]): Promise<AuthUser | NextResponse> {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (!auth.roleName || !allowedRoles.includes(auth.roleName)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return auth;
}
