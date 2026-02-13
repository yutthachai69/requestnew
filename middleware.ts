import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { allowedDashboardRoles, reportRoles } from '@/lib/auth-constants';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // เรียก getToken ครั้งเดียวแล้วใช้ซ้ำ
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  const role = token?.roleName as string | undefined;

  // Helper: redirect ไป login
  const redirectToLogin = () => {
    const login = new URL('/login', request.url);
    login.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(login);
  };

  // /dashboard
  if (pathname.startsWith('/dashboard')) {
    if (!token) return redirectToLogin();
    const allowed = role && allowedDashboardRoles.includes(role);
    if (!allowed) return NextResponse.redirect(new URL('/', request.url));
  }

  // /admin
  if (pathname.startsWith('/admin')) {
    if (!token) return redirectToLogin();
    if (role !== 'Admin') return NextResponse.redirect(new URL('/', request.url));
  }

  // /api/admin — defense-in-depth: ป้องกัน API route ที่ลืมตรวจ role
  if (pathname.startsWith('/api/admin')) {
    if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (role !== 'Admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  // /login - ถ้า login แล้ว redirect ไป dashboard
  if (pathname === '/login') {
    const allowed = role && allowedDashboardRoles.includes(role);
    if (token && allowed) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // /pending-tasks
  if (pathname.startsWith('/pending-tasks')) {
    if (!token) return redirectToLogin();
  }

  // /profile
  if (pathname.startsWith('/profile')) {
    if (!token) return redirectToLogin();
  }

  // /report
  if (pathname.startsWith('/report')) {
    if (!token) return redirectToLogin();
    if (reportRoles && (!role || !reportRoles.includes(role))) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // /request
  if (pathname.startsWith('/request')) {
    if (!token) return redirectToLogin();
  }

  // /category
  if (pathname.startsWith('/category')) {
    if (!token) return redirectToLogin();
  }

  // /notifications
  if (pathname.startsWith('/notifications')) {
    if (!token) return redirectToLogin();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/api/admin/:path*',
    '/login',
    '/profile/:path*',
    '/report/:path*',
    '/request/:path*',
    '/pending-tasks/:path*',
    '/category/:path*',
    '/notifications/:path*',
  ],
};
