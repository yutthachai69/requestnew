/**
 * Notification API service – mirrors old frontend notificationService.js.
 * Uses Next.js API routes when available: /api/notifications.
 */

import { apiGet, apiPut } from '@/lib/api-client';

export const getNotifications = () =>
  apiGet<unknown>('/api/notifications');

export const markAsRead = (id: number | string) =>
  apiPut(`/api/notifications/${id}/read`, {});

export const markAllAsRead = () =>
  apiPut<unknown>('/api/notifications/mark-all-read', {});

const notificationService = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};

export default notificationService;
