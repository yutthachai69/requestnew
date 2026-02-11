/**
 * Auth API service – mirrors old frontend authService.js.
 * Login/logout are handled by NextAuth (session). This service is for changePassword and getMyStats.
 */

import { apiGet, apiPut, apiPost } from '@/lib/api-client';

/** Change password. Expects API route PUT /api/auth/change-password with { oldPassword, newPassword }. */
export const changePassword = (passwordData: { oldPassword: string; newPassword: string }) =>
  apiPut('/api/auth/change-password', passwordData);

/** Get current user stats. Expects GET /api/auth/my-stats. */
export const getMyStats = () =>
  apiGet<unknown>('/api/auth/my-stats');

/**
 * In Next.js app, "current user" comes from useSession() / getServerSession, not localStorage.
 * This is only for compatibility; prefer session in components.
 */
export function getCurrentUser(): null {
  return null;
}

const authService = {
  changePassword,
  getMyStats,
  getCurrentUser,
};

export default authService;
