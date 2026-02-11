/**
 * Request (F07) API service – mirrors old frontend requestService.js.
 */

import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api-client';

export const getRequests = (params?: Record<string, string | number | boolean>) =>
  apiGet<unknown>('/api/requests', params as Record<string, string | number | boolean | undefined>);

export const getRequestById = (id: number | string) =>
  apiGet<unknown>(`/api/requests/${id}`);

export const performAction = (id: number | string, actionData: Record<string, unknown>) =>
  apiPost(`/api/requests/${id}/action`, actionData);

export const performBulkAction = (actionData: { requestIds: number[]; actionName: string; comment?: string }) =>
  apiPost('/api/requests/bulk-action', actionData);

export const createRequest = (formData: FormData) =>
  apiPost<unknown>('/api/requests', formData);

export const exportRequests = (params?: Record<string, string | number | boolean>) =>
  apiGet<Blob>('/api/requests/export', params as Record<string, string | number | boolean | undefined>, { responseType: 'blob' });

export const getApprovalHistory = (params?: Record<string, string | number | boolean>) =>
  apiGet<unknown>('/api/requests/history', params as Record<string, string | number | boolean | undefined>);

export const updateRequest = (id: number | string, data: FormData) =>
  apiPut<unknown>(`/api/requests/${id}`, data);

export const deleteRequest = (id: number | string) =>
  apiDelete(`/api/requests/${id}`);

export const getWorkflowPreview = (params: Record<string, string | number | boolean>) =>
  apiGet<unknown>('/api/master/workflow-preview', params as Record<string, string | number | boolean | undefined>);

export const getRequestCorrectionTypes = (id: number | string) =>
  apiGet<unknown>(`/api/requests/${id}/correction-types`);

const requestService = {
  getRequests,
  getRequestById,
  performAction,
  performBulkAction,
  createRequest,
  exportRequests,
  getApprovalHistory,
  updateRequest,
  deleteRequest,
  getWorkflowPreview,
  getRequestCorrectionTypes,
};

export default requestService;
