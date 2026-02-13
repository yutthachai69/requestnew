import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

const handler = NextAuth(authOptions);

// Rate limit เฉพาะ POST (login) — 5 ครั้ง/นาที/IP
async function rateLimitedPost(req: NextRequest, ctx: unknown) {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip');
    const key = getRateLimitKey(ip, '/api/auth/login');
    const result = checkRateLimit(key, { maxRequests: 5, windowSec: 60 });

    if (!result.allowed) {
        return NextResponse.json(
            { message: 'คุณลอง login บ่อยเกินไป กรุณารอสักครู่' },
            {
                status: 429,
                headers: {
                    'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
                    'X-RateLimit-Remaining': '0',
                },
            }
        );
    }

    return (handler as (req: NextRequest, ctx: unknown) => Promise<NextResponse>)(req, ctx);
}

export { handler as GET };
export { rateLimitedPost as POST };
