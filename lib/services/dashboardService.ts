/**
 * Dashboard API service – mirrors old frontend dashboardService.js.
 */

import { apiGet } from '@/lib/api-client';

/** Category statistics for welcome/dashboard. Expects GET /api/dashboard/category-stats. */
export const getCategoryStatistics = () =>
  apiGet<unknown>('/api/dashboard/category-stats');

/** Global statistics (e.g. Admin). Expects GET /api/dashboard/statistics. */
export const getGlobalStatistics = () =>
  apiGet<unknown>('/api/dashboard/statistics');

/** Report data with optional date range. Expects GET /api/dashboard/report-data. */
export const getReportData = (params?: Record<string, string | number | boolean>) =>
  apiGet<unknown>('/api/dashboard/report-data', params as Record<string, string | number | boolean | undefined>);

const dashboardService = {
  getCategoryStatistics,
  getGlobalStatistics,
  getReportData,
};

export default dashboardService;
