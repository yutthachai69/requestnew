'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';

type RequestItem = {
  id: number;
  workOrderNo: string | null;
  problemDetail: string;
  status: string;
  currentApprovalStep?: number;
  createdAt: string;
  category: { id: number; name: string };
  requester: { fullName: string; username: string } | null;
  department?: { name: string };
  location?: { name: string };
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'เสร็จสิ้น',
  CLOSED: 'ปิดงานแล้ว',
  PROCESSED: 'ดำเนินการแล้ว',
  PENDING: 'รอดำเนินการ',
  REJECTED: 'ปฏิเสธ',
  APPROVED: 'อนุมัติแล้ว',
};

export default function AdminAuditReportPage() {
  const [list, setList] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [queryVersion, setQueryVersion] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { showNotification } = useNotification();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const res = await fetch(`/api/requests?${params}`);
      if (!res.ok) throw new Error('โหลดข้อมูลไม่ได้');
      const data = await res.json();
      setList(Array.isArray(data.requests) ? data.requests : []);
      setTotalCount(data.totalCount || 0);
    } catch (e) {
      showNotification('โหลดรายงานประวัติการดำเนินการล้มเหลว', 'error');
      setList([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, search, status, showNotification]);

  useEffect(() => {
    fetchList();
  }, [fetchList, queryVersion]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setQueryVersion((v) => v + 1);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${h}:${m}`;
    } catch {
      return iso;
    }
  };

  const getStatusLabel = (status: string) => STATUS_LABEL[status] || status;

  const exportExcel = () => {
    const BOM = '\uFEFF';
    const headers = ['เลขที่', 'หมวดหมู่', 'สถานะ', 'ผู้แจ้ง', 'รายละเอียดปัญหา', 'วันที่'];
    const rows = list.map((r) => [
      r.workOrderNo || 'ไม่ระบุ',
      r.category?.name ?? '',
      getStatusLabel(r.status),
      r.requester?.fullName || r.requester?.username || '',
      r.problemDetail ?? '',
      formatDate(r.createdAt),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `รายงานประวัติการดำเนินการ_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('ส่งออกไฟล์สำเร็จ', 'success');
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">รายงานประวัติการดำเนินการและการแก้ไข (Admin Only)</h1>
        <button
          type="button"
          onClick={exportExcel}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Export Excel
        </button>
      </div>

      <form onSubmit={handleFilter} className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เริ่มวันที่</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ถึงวันที่</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">ค้นหาคำร้อง/ชื่อ</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              placeholder="ค้นหาคำร้องหรือชื่อผู้แจ้ง"
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">ทั้งหมด</option>
              <option value="PENDING">รอดำเนินการ (ทั้งหมด)</option>
              <option value="CLOSED">ปิดงานแล้ว/เสร็จสิ้น</option>
              <option value="REJECTED">ถูกปฏิเสธ</option>
            </select>
          </div>
        </div>
      </form>

      <div className="mb-4 px-1 text-gray-700 font-medium">
        พบข้อมูลทั้งหมด <span className="text-blue-600 font-bold">{totalCount}</span> รายการ
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <button
                type="button"
                className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50/50"
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
              >
                <span className="text-gray-500 mt-0.5">
                  <svg
                    className={`h-5 w-5 transition-transform ${expandedId === r.id ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 mb-1">
                    {r.workOrderNo || 'ไม่ระบุ'}
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {r.category?.name ?? '—'}
                    </span>
                    <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                      {getStatusLabel(r.status)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    ผู้แจ้ง: {r.requester?.fullName || r.requester?.username || '—'}
                  </div>
                  <div className="text-sm text-gray-600 mt-0.5">
                    รายละเอียดปัญหา: {r.problemDetail ? (r.problemDetail.length > 80 ? `${r.problemDetail.slice(0, 80)}...` : r.problemDetail) : '—'}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm text-gray-500">{r.currentApprovalStep ?? 0} รายการ</span>
                  <div className="text-sm text-gray-600 mt-1">{formatDate(r.createdAt)}</div>
                </div>
              </button>
              {expandedId === r.id && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 text-sm text-gray-700">
                  <p><span className="font-medium">ผู้แจ้ง:</span> {r.requester?.fullName || r.requester?.username || '—'}</p>
                  <p className="mt-1"><span className="font-medium">รายละเอียดปัญหา:</span> {r.problemDetail || '—'}</p>
                  {r.department && <p className="mt-1"><span className="font-medium">แผนก:</span> {r.department.name}</p>}
                  {r.location && <p className="mt-0.5"><span className="font-medium">สถานที่:</span> {r.location.name}</p>}
                </div>
              )}
            </div>
          ))}
          {list.length === 0 && (
            <div className="py-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200">
              ไม่พบข้อมูลตามเงื่อนไข
            </div>
          )}
        </div>
      )}
    </div>
  );
}
