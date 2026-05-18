'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { ClipboardList, Search, Filter, RefreshCcw, ArrowLeft, ArrowRight, User, Calendar } from 'lucide-react';

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
    if (!action) return 'bg-gray-100 text-gray-700 border-gray-200';
    if (action === 'USER_LOGIN' || action.includes('LOGIN')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (action === 'LOGIN_FAILED' || action.includes('FAILED') || action.includes('REJECT')) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (action === 'REQUEST_DELETED') return 'bg-slate-50 text-slate-700 border-slate-200';
    if (action === 'APPROVE') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (action === 'CREATE') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    if (action === 'UPDATE') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-gray-50 text-gray-700 border-gray-200';
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 sm:p-6 lg:p-8 space-y-6 font-sans">
      {/* Header Card */}
      <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
               <ClipboardList size={24} />
            </div>
            ประวัติการใช้งานระบบ (Audit Logs)
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            ติดตามกิจกรรมของผู้ใช้งานและการเข้าสู่ระบบทั้งหมด
          </p>
        </div>
        
        <button
          type="button"
          onClick={() => setFilterVisible((v) => !v)}
          className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors border ${
            filterVisible 
              ? 'bg-blue-50 text-blue-700 border-blue-200' 
              : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'
          }`}
        >
          <Filter size={16} />
          {filterVisible ? 'ซ่อนตัวกรอง' : 'ตัวกรองข้อมูล'}
        </button>
      </div>

      {filterVisible && (
        <form onSubmit={handleSearch} className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">ค้นหากิจกรรม</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors bg-gray-50/50 hover:bg-white"
                  placeholder="ค้นหาชื่อ, ประเภท, หรือรายละเอียด..."
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                 <User size={14} className="text-gray-400"/> ผู้ทำรายการ
              </label>
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors bg-gray-50/50 hover:bg-white"
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
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Calendar size={14} className="text-gray-400"/> ตั้งแต่วันที่
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors bg-gray-50/50 hover:bg-white"
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Calendar size={14} className="text-gray-400"/> ถึงวันที่
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors bg-gray-50/50 hover:bg-white"
              />
            </div>
          </div>
          
          <div className="mt-5 pt-5 border-t border-gray-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClearFilters}
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:text-gray-900 text-gray-600 text-sm font-semibold transition-colors flex items-center gap-2"
            >
              <RefreshCcw size={16} /> ล้างค่าใหม่
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 text-sm font-semibold transition-all flex items-center gap-2"
            >
              <Search size={16} />
              ค้นหาข้อมูล
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-bold">
                  <th className="px-6 py-4">เวลา</th>
                  <th className="px-6 py-4">ผู้ใช้งาน</th>
                  <th className="px-6 py-4">กิจกรรม</th>
                  <th className="px-6 py-4">IP Address</th>
                  <th className="px-6 py-4">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log) => (
                  <tr key={log.LogID} className="group hover:bg-blue-50/30 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-500 font-medium whitespace-nowrap">
                      {formatTimestamp(log.Timestamp)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">
                           {(log.FullName || log.Username || 'G')[0].toUpperCase()}
                         </div>
                         <span className="text-sm font-semibold text-gray-900">{log.FullName || log.Username || 'Guest'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 text-xs font-bold rounded-full border shadow-sm ${getActivityTagClass(log.Action ?? '')}`}>
                        {log.Action || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-gray-500 bg-gray-50/50 group-hover:bg-transparent transition-colors">
                        {log.IPAddress || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-md truncate" title={log.Detail ?? ''}>
                      {log.Detail || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && (
              <div className="py-16 flex flex-col items-center justify-center text-center">
                 <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                   <ClipboardList className="w-8 h-8 text-gray-300" />
                 </div>
                 <h3 className="text-lg font-bold text-gray-900 mb-1">ไม่พบข้อมูลประวัติ</h3>
                 <p className="text-gray-500 text-sm">ลองปรับตัวกรองหรือค้นหาด้วยคำใหม่อีกครั้ง</p>
              </div>
            )}
          </div>

          {pagination.totalPages > 1 && (
            <div className="border-t border-gray-100 p-4 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-sm font-medium text-gray-500">
                แสดงหน้า <span className="text-gray-900">{pagination.currentPage}</span> จาก <span className="text-gray-900">{pagination.totalPages}</span> (ทั้งหมด {pagination.totalCount} รายการ)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagination.currentPage <= 1}
                  onClick={() => setPagination((p) => ({ ...p, currentPage: p.currentPage - 1 }))}
                  className="p-2 border border-gray-300 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white bg-gray-50 text-gray-700 transition-colors shadow-sm"
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  type="button"
                  disabled={pagination.currentPage >= pagination.totalPages}
                  onClick={() => setPagination((p) => ({ ...p, currentPage: p.currentPage + 1 }))}
                  className="p-2 border border-gray-300 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white bg-gray-50 text-gray-700 transition-colors shadow-sm"
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
