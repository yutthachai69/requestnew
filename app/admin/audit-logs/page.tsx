'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';

type Log = {
  LogID: number;
  Timestamp: string;
  Action: string;
  IPAddress: string | null;
  Detail: string | null;
  FullName: string;
  Username: string | null;
};

type Pagination = { currentPage: number; totalPages: number; totalCount: number };

type UserOption = { UserID: number; FullName: string; Username: string };

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<Pagination>({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
  });
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [queryVersion, setQueryVersion] = useState(0);
  const [filterVisible, setFilterVisible] = useState(true);
  const { showNotification } = useNotification();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.currentPage),
        limit: '20',
      });
      if (search) params.set('search', search);
      if (actionFilter) params.set('action', actionFilter);
      if (userFilter) params.set('userId', userFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const res = await fetch(`/api/admin/audit-logs?${params}`);
      if (!res.ok) throw new Error('โหลดข้อมูลไม่ได้');
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setPagination({
        currentPage: data.currentPage ?? 1,
        totalPages: data.totalPages ?? 1,
        totalCount: data.totalCount ?? 0,
      });
    } catch (e) {
      showNotification('โหลดประวัติการใช้งานล้มเหลว', 'error');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [pagination.currentPage, search, actionFilter, userFilter, startDate, endDate, showNotification]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) return;
      const data = await res.json();
      setUsers(Array.isArray(data) ? data.map((u: { UserID: number; FullName: string; Username: string }) => ({ UserID: u.UserID, FullName: u.FullName, Username: u.Username })) : []);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, queryVersion]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((p) => ({ ...p, currentPage: 1 }));
    setQueryVersion((v) => v + 1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setActionFilter('');
    setUserFilter('');
    setStartDate('');
    setEndDate('');
    setPagination((p) => ({ ...p, currentPage: 1 }));
    setQueryVersion((v) => v + 1);
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      const day = d.getDate();
      const month = d.getMonth() + 1;
      const year = d.getFullYear() + 543;
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      return `${day}/${month}/${year} ${h}:${m}:${s}`;
    } catch {
      return iso;
    }
  };

  const getActivityTagClass = (action: string) => {
    if (!action) return 'bg-gray-100 text-gray-700';
    if (action === 'USER_LOGIN') return 'bg-green-100 text-green-800';
    if (action === 'LOGIN_FAILED') return 'bg-red-100 text-red-800';
    if (action === 'REQUEST_DELETED') return 'bg-blue-100 text-blue-800';
    if (action.includes('LOGIN')) return 'bg-green-100 text-green-800';
    if (action.includes('FAILED') || action.includes('REJECT')) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">ประวัติการใช้งาน (Audit Log)</h1>

      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setFilterVisible((v) => !v)}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          {filterVisible ? 'ซ่อนตัวกรอง' : 'แสดงตัวกรอง'}
        </button>
      </div>

      {filterVisible && (
        <form onSubmit={handleSearch} className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">ตัวกรอง</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">ค้นหา (ชื่อ, กิจกรรม, รายละ...)</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="ค้นหา (ชื่อ, กิจกรรม, รายละ...)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ผู้ใช้งาน</label>
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="">ทั้งหมด</option>
                {users.map((u) => (
                  <option key={u.UserID} value={u.UserID}>
                    {u.FullName} ({u.Username})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่เริ่มต้น</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่สิ้นสุด</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClearFilters}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              ล้าง
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-1"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              ค้นหา
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">เวลา</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ผู้ใช้งาน</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">กิจกรรม</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">IP Address</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.LogID} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {formatTimestamp(log.Timestamp)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{log.FullName || log.Username || 'Guest'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getActivityTagClass(log.Action ?? '')}`}>
                        {log.Action || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.IPAddress || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-md truncate" title={log.Detail ?? ''}>
                      {log.Detail || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && (
              <div className="py-12 text-center text-gray-500">ไม่พบข้อมูลประวัติ</div>
            )}
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-4">
              <button
                type="button"
                disabled={pagination.currentPage <= 1}
                onClick={() => setPagination((p) => ({ ...p, currentPage: p.currentPage - 1 }))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 text-sm"
              >
                ก่อนหน้า
              </button>
              <span className="text-sm text-gray-600">
                หน้า {pagination.currentPage} / {pagination.totalPages} (ทั้งหมด {pagination.totalCount} รายการ)
              </span>
              <button
                type="button"
                disabled={pagination.currentPage >= pagination.totalPages}
                onClick={() => setPagination((p) => ({ ...p, currentPage: p.currentPage + 1 }))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 text-sm"
              >
                ถัดไป
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
