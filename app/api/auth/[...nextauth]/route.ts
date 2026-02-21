import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
