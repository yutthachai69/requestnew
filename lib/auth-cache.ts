// lib/auth-cache.ts
// Cached auth helper - ใช้ React.cache() เพื่อ deduplicate auth calls ใน single request
// ตาม Vercel Best Practice: server-cache-react

import { cache } from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Cached version of getServerSession
 * - Within a single request, multiple calls return the same cached result
 * - Prevents duplicate database queries for session validation
 * - Should be used in Server Components and API Routes
 */
export const getSession = cache(async () => {
    return await getServerSession(authOptions);
});

/**
 * Get current user ID from cached session
 */
export const getCurrentUserId = cache(async (): Promise<number | null> => {
    const session = await getSession();
    const id = session?.user ? (session.user as { id?: string }).id : null;
    return id ? Number(id) : null;
});

/**
 * Get current user role from cached session
 */
export const getCurrentUserRole = cache(async (): Promise<string | null> => {
    const session = await getSession();
    return session?.user ? (session.user as { roleName?: string }).roleName ?? null : null;
});

/**
 * Check if current user is Admin
 */
export const isAdmin = cache(async (): Promise<boolean> => {
    const role = await getCurrentUserRole();
    return role === 'Admin';
});
