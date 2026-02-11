/**
 * Admin API service – mirrors old frontend adminService.js.
 * Uses Next.js API routes: /api/admin/*
 */

import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api-client';

// --- User Services ---
export const getUsers = (params?: Record<string, string | number | boolean>) =>
  apiGet<unknown[]>('/api/admin/users', params as Record<string, string | number | boolean | undefined>);

export const getUserById = (id: number | string) =>
  apiGet(`/api/admin/users/${id}`);

export const createUser = (userData: Record<string, unknown>) =>
  apiPost('/api/admin/users', userData);

export const updateUser = (id: number | string, userData: Record<string, unknown>) =>
  apiPut(`/api/admin/users/${id}`, userData);

export const deleteUser = (id: number | string) =>
  apiDelete(`/api/admin/users/${id}`);

/** Reset password: Next.js API expects POST with { newPassword }. */
export const resetUserPassword = (id: number | string, newPassword: string) =>
  apiPost(`/api/admin/users/${id}/reset-password`, { newPassword });

// --- Category Services (admin list) ---
export const getCategories = () =>
  apiGet<unknown[]>('/api/admin/categories');

export const createCategory = (data: Record<string, unknown>) =>
  apiPost('/api/admin/categories', data);

export const updateCategory = (id: number | string, data: Record<string, unknown>) =>
  apiPut(`/api/admin/categories/${id}`, data);

export const deleteCategory = (id: number | string) =>
  apiDelete(`/api/admin/categories/${id}`);

// --- Location Services ---
export const getLocationsAdmin = () =>
  apiGet<unknown[]>('/api/admin/locations');

export const createLocation = (payload: Record<string, unknown>) =>
  apiPost('/api/admin/locations', payload);

export const updateLocation = (id: number | string, payload: Record<string, unknown>) =>
  apiPut(`/api/admin/locations/${id}`, payload);

export const deleteLocation = (id: number | string) =>
  apiDelete(`/api/admin/locations/${id}`);

// --- Department Services ---
export const getDepartments = () =>
  apiGet<unknown[]>('/api/admin/departments');

export const createDepartment = (departmentName: string) =>
  apiPost('/api/admin/departments', { departmentName });

export const updateDepartment = (id: number | string, data: Record<string, unknown>) =>
  apiPut(`/api/admin/departments/${id}`, data);

export const deleteDepartment = (id: number | string) =>
  apiDelete(`/api/admin/departments/${id}`);

// --- Roles Services ---
export const getRoles = () =>
  apiGet<unknown[]>('/api/admin/roles');

export const createRole = (roleData: Record<string, unknown>) =>
  apiPost('/api/admin/roles', roleData);

export const updateRole = (id: number | string, roleData: Record<string, unknown>) =>
  apiPut(`/api/admin/roles/${id}`, roleData);

export const deleteRole = (id: number | string) =>
  apiDelete(`/api/admin/roles/${id}`);

// --- Audit Logs ---
export const getAuditLogs = (params?: Record<string, string | number | boolean>) =>
  apiGet<unknown>('/api/admin/audit-logs', params as Record<string, string | number | boolean | undefined>);

// --- Not yet implemented (stub or future routes) ---
export const getCategoryMappingsForLocation = (_id: number | string) =>
  apiGet(`/api/admin/locations/${_id}/categories`);

export const getStatuses = () =>
  apiGet('/api/master/statuses');

export const updateStatus = (id: number | string, statusData: Record<string, unknown>) =>
  apiPut(`/api/master/statuses/${id}`, statusData);

export const getDocConfigs = () =>
  apiGet('/api/admin/doc-configs');

export const saveDocConfig = (configData: Record<string, unknown>) =>
  apiPost('/api/admin/doc-configs', configData);

export const getUserPermissions = (id: number | string) =>
  apiGet(`/api/admin/users/${id}/permissions`);

export const getCorrectionTypesAdmin = (params?: Record<string, string | number | boolean>) =>
  apiGet('/api/admin/correction-types', params as Record<string, string | number | boolean | undefined>);

export const createCorrectionType = (data: Record<string, unknown>) =>
  apiPost('/api/admin/correction-types', data);

export const updateCorrectionType = (id: number | string, data: Record<string, unknown>) =>
  apiPut(`/api/admin/correction-types/${id}`, data);

export const deleteCorrectionType = (id: number | string) =>
  apiDelete(`/api/admin/correction-types/${id}`);

export const getCategoryMappingsForType = (id: number | string) =>
  apiGet(`/api/admin/correction-types/${id}/categories`);

export const getCorrectionReasonsAdmin = () =>
  apiGet('/api/admin/correction-reasons');

export const createCorrectionReason = (data: Record<string, unknown>) =>
  apiPost('/api/admin/correction-reasons', data);

export const updateCorrectionReason = (id: number | string, data: Record<string, unknown>) =>
  apiPut(`/api/admin/correction-reasons/${id}`, data);

export const getApproverMappingsForUser = (userId: number | string) =>
  apiGet(`/api/admin/users/${userId}/approver-mappings`);

export const getAllWorkflows = () =>
  apiGet('/api/admin/workflows/all');

export const getWorkflow = (categoryId: number | string, correctionTypeId: number | string) =>
  apiGet('/api/admin/workflows', { categoryId, correctionTypeId } as Record<string, string | number | boolean>);

export const updateWorkflow = (data: Record<string, unknown>) =>
  apiPost('/api/admin/workflows', data);

export const copyWorkflow = (data: Record<string, unknown>) =>
  apiPost('/api/admin/workflows/copy', data);

export const deleteWorkflow = (data: Record<string, unknown>) =>
  apiDelete('/api/admin/workflows');

export const getSpecialRoles = () =>
  apiGet('/api/admin/special-roles');

export const getSpecialRolesForUser = (userId: number | string) =>
  apiGet(`/api/admin/users/${userId}/special-roles`);

export const getActions = () =>
  apiGet('/api/admin/actions');

export const getEmailTemplates = () =>
  apiGet('/api/admin/email-templates');

export const updateEmailTemplate = (id: number | string, data: Record<string, unknown>) =>
  apiPut(`/api/admin/email-templates/${id}`, data);

export const getSpecialApproverMappings = (params?: Record<string, string | number | boolean>) =>
  apiGet('/api/admin/special-approvers', params as Record<string, string | number | boolean | undefined>);

export const updateSpecialApproverMappings = (data: Record<string, unknown>) =>
  apiPost('/api/admin/special-approvers', data);

export const getAuditLogActions = () =>
  apiGet('/api/admin/audit-logs/actions');

export const getOperationAuditReport = (params?: Record<string, string | number | boolean>) =>
  apiGet('/api/admin/operation-audit-report', params as Record<string, string | number | boolean | undefined>);

const adminService = {
  getUsers,
  getUserById,
  updateUser,
  createUser,
  deleteUser,
  resetUserPassword,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getLocationsAdmin,
  createLocation,
  updateLocation,
  deleteLocation,
  getCategoryMappingsForLocation,
  getStatuses,
  updateStatus,
  getDocConfigs,
  saveDocConfig,
  getUserPermissions,
  getCorrectionTypesAdmin,
  createCorrectionType,
  updateCorrectionType,
  deleteCorrectionType,
  getCategoryMappingsForType,
  getCorrectionReasonsAdmin,
  createCorrectionReason,
  updateCorrectionReason,
  getApproverMappingsForUser,
  getAllWorkflows,
  getWorkflow,
  updateWorkflow,
  copyWorkflow,
  deleteWorkflow,
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getSpecialRoles,
  getSpecialRolesForUser,
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getActions,
  getEmailTemplates,
  updateEmailTemplate,
  getSpecialApproverMappings,
  updateSpecialApproverMappings,
  getAuditLogs,
  getAuditLogActions,
  getOperationAuditReport,
};

export default adminService;
