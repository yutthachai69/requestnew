'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import StatCards from '@/app/components/StatCards';
import { useNotification } from '@/app/context/NotificationContext';
import { TableSkeleton, Skeleton } from '@/app/components/Skeleton';
import CategoryBarChart from '@/app/components/CategoryBarChart';

// Dynamic import for StatusChart (recharts is ~100KB) - lazy load to reduce initial bundle
const StatusChart = dynamic(() => import('@/app/components/StatusChart'), {
  ssr: false,
  loading: () => <div className="h-[300px] w-full flex items-center justify-center"><Skeleton className="w-48 h-48 rounded-full" /></div>,
});

type RequestRow = {
  id: number;
  workOrderNo: string | null;
  thaiName: string;
  department: { id: number; name: string };
  category: { id: number; name: string };
  status: string;
  statusDisplay?: string;
  currentStatus?: { id: number; code: string; displayName: string; colorCode: string };
  currentApprovalStep?: number;
  currentStepLabel?: string | null;
  createdAt: string;
};

const TABS = [
  { label: 'รอดำเนินการ', status: 'PENDING' },
  { label: 'อนุมัติแล้ว', status: 'APPROVED' },
  { label: 'ปฏิเสธ', status: 'REJECTED' },
  { label: 'ปิดงานแล้ว', status: 'CLOSED' },
  { label: 'ทั้งหมด', status: '' },
];

export default function DashboardPage() {
  const { data: session } = useSession();
  const { showNotification } = useNotification();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkDialog, setBulkDialog] = useState<{ open: boolean; action: 'APPROVE' | 'REJECT'; comment: string }>({
    open: false,
    action: 'APPROVE',
    comment: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [counts, setCounts] = useState({ PENDING: 0, APPROVED: 0, REJECTED: 0, CLOSED: 0 });
  const [categoryStats, setCategoryStats] = useState<{ categoryId: number; categoryName: string; count: number }[]>([]);

  const roleName = session?.user ? (session.user as { roleName?: string }).roleName : undefined;
  const allowBulk = roleName === 'Admin' || roleName === 'Head of Department';
  const currentTab = TABS[tabIndex];
  const isPendingTab = currentTab?.status === 'PENDING';

  const fetchRequests = useCallback(() => {
    if (!session?.user) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (currentTab?.status) params.set('status', currentTab.status);
    if (search.trim()) params.set('search', search.trim());
    params.set('page', String(page));
    params.set('limit', '10');
    fetch(`/api/requests?${params}`, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error('โหลดข้อมูลไม่ได้');
        return res.json();
      })
      .then((data) => {
        setRequests(data.requests ?? []);
        setTotalPages(data.totalPages ?? 1);
        setTotalCount(data.totalCount ?? 0);
      })
      .catch(() => {
        showNotification('โหลดรายการคำร้องไม่ได้', 'error');
        setRequests([]);
      })
      .finally(() => setLoading(false));
  }, [session, currentTab?.status, search, page, showNotification]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (!session?.user) return;
    setLoadingStats(true);
    fetch('/api/dashboard/statistics', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.resolve({ byStatus: [], requestCountByCategory: [] })))
      .then((data) => {
        const byStatus = data.byStatus ?? [];
        const closedStatuses = ['CLOSED', 'REJECTED'];
        const pendingSum = byStatus
          .filter((s: { status: string | null }) => s.status != null && !closedStatuses.includes(s.status))
          .reduce((sum: number, s: { count: number }) => sum + (s.count ?? 0), 0);

        setCounts({
          PENDING: pendingSum,
          APPROVED: byStatus.find((s: any) => s.status === 'APPROVED')?.count ?? 0,
          REJECTED: byStatus.find((s: any) => s.status === 'REJECTED')?.count ?? 0,
          CLOSED: byStatus.find((s: any) => s.status === 'CLOSED')?.count ?? 0,
        });

        setCategoryStats(data.requestCountByCategory ?? []);
      })
      .catch(() => { })
      .finally(() => setLoadingStats(false));
  }, [session]);

  const handleTabChange = (i: number) => {
    setTabIndex(i);
    setPage(1);
    setSelected([]);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchRequests();
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelected(requests.map((r) => r.id));
    else setSelected([]);
  };

  const handleSelectOne = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleBulkSubmit = async () => {
    if (bulkDialog.action === 'REJECT' && !bulkDialog.comment.trim()) {
      showNotification('กรุณาระบุเหตุผลในการปฏิเสธ', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/requests/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          requestIds: selected,
          actionName: bulkDialog.action,
          comment: bulkDialog.comment.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'ดำเนินการไม่สำเร็จ');
      showNotification(data.message ?? 'ดำเนินการสำเร็จ', 'success');
      setBulkDialog({ open: false, action: 'APPROVE', comment: '' });
      setSelected([]);
      fetchRequests();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const chartData = [
    { name: 'รอดำเนินการ', value: counts.PENDING },
    { name: 'อนุมัติแล้ว', value: counts.APPROVED },
    { name: 'ปฏิเสธ', value: counts.REJECTED },
    { name: 'ปิดงานแล้ว', value: counts.CLOSED },
  ];

  if (!session?.user) {
    return (
      <div className="p-8">
        <p className="text-gray-500">กรุณาเข้าสู่ระบบ</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ภาพรวมคำร้อง</h1>
        <p className="text-gray-500 mt-1">สถานะใบงาน F07 ทั้งหมดในระบบ</p>
      </div>

      <StatCards counts={counts} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Status Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-bold mb-6 text-gray-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
            สัดส่วนงานตามสถานะ
          </h2>
          {loadingStats ? (
            <div className="h-[300px] flex items-center justify-center">
              <Skeleton className="w-48 h-48 rounded-full" />
            </div>
          ) : (
            <StatusChart data={chartData} />
          )}
        </div>

        {/* Category Chart */}
        <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-bold mb-6 text-gray-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            จำนวนงานแยกตามหมวดหมู่
          </h2>
          {loadingStats ? (
            <div className="h-[300px] flex items-end justify-center gap-4 px-8 pb-4">
              <Skeleton className="w-full h-1/3 rounded-t-lg" />
              <Skeleton className="w-full h-2/3 rounded-t-lg" />
              <Skeleton className="w-full h-1/2 rounded-t-lg" />
              <Skeleton className="w-full h-3/4 rounded-t-lg" />
            </div>
          ) : (
            <CategoryBarChart data={categoryStats} />
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
            {TABS.map((tab, i) => (
              <button
                key={tab.status || 'all'}
                type="button"
                onClick={() => handleTabChange(i)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${tabIndex === i ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <form onSubmit={handleSearch} className="flex gap-2 w-full sm:w-auto">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา..."
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full sm:w-48 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
            <button type="submit" className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200 whitespace-nowrap">
              ค้นหา
            </button>
          </form>
        </div>

        {allowBulk && isPendingTab && selected.length > 0 && (
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-amber-800">{selected.length} รายการที่เลือก</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBulkDialog({ open: true, action: 'APPROVE', comment: '' })}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >
                อนุมัติ
              </button>
              <button
                type="button"
                onClick={() => setBulkDialog({ open: true, action: 'REJECT', comment: '' })}
                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                ส่งกลับ/ปฏิเสธ
              </button>
            </div>
          </div>
        )}

        <div className="p-4">
          {loading ? (
            <TableSkeleton rows={5} columns={6} />
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                    <tr>
                      {allowBulk && isPendingTab && (
                        <th className="px-4 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={selected.length === requests.length && requests.length > 0}
                            onChange={handleSelectAll}
                          />
                        </th>
                      )}
                      <th className="px-4 py-3">เลขที่ใบงาน</th>
                      <th className="px-4 py-3">ผู้แจ้ง / แผนก</th>
                      <th className="px-4 py-3">หมวดหมู่</th>
                      <th className="px-4 py-3">สถานะ</th>
                      <th className="px-4 py-3">วันที่แจ้ง</th>
                      <th className="px-4 py-3">ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {requests.map((req) => (
                      <tr key={req.id} className="hover:bg-gray-50">
                        {allowBulk && isPendingTab && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selected.includes(req.id)}
                              onChange={() => handleSelectOne(req.id)}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 font-medium">
                          <Link href={`/request/${req.id}`} className="text-blue-600 hover:underline">
                            {req.workOrderNo ?? `#${req.id}`}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <div>{req.thaiName}</div>
                          <div className="text-xs text-gray-400">{req.department?.name}</div>
                        </td>
                        <td className="px-4 py-3">{req.category?.name}</td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2.5 py-1 rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor: req.currentStatus?.colorCode
                                ? `${req.currentStatus.colorCode}20`
                                : '#fef3c7',
                              color: req.currentStatus?.colorCode || '#92400e',
                            }}
                          >
                            {req.currentStatus?.displayName ?? req.statusDisplay ?? req.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(req.createdAt).toLocaleDateString('th-TH')}
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/request/${req.id}`} className="text-blue-600 hover:underline text-sm">
                            ดูรายละเอียด
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden divide-y divide-gray-100">
                {requests.map((req) => (
                  <div key={req.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {allowBulk && isPendingTab && (
                          <input
                            type="checkbox"
                            checked={selected.includes(req.id)}
                            onChange={() => handleSelectOne(req.id)}
                            className="mr-2"
                          />
                        )}
                        <Link href={`/request/${req.id}`} className="font-semibold text-blue-600 hover:underline">
                          {req.workOrderNo ?? `#${req.id}`}
                        </Link>
                      </div>
                      <span
                        className="px-2.5 py-1 rounded-full text-xs font-semibold"
                        style={{
                          backgroundColor: req.currentStatus?.colorCode
                            ? `${req.currentStatus.colorCode}20`
                            : '#fef3c7',
                          color: req.currentStatus?.colorCode || '#92400e',
                        }}
                      >
                        {req.currentStatus?.displayName ?? req.statusDisplay ?? req.status}
                      </span>
                    </div>

                    <div className="space-y-1 mb-3">
                      <p className="font-medium text-gray-900">{req.thaiName}</p>
                      <p className="text-sm text-gray-500">{req.department?.name}</p>
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-gray-300"></span>
                        {req.category?.name}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">
                        {new Date(req.createdAt).toLocaleDateString('th-TH', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </span>
                      <Link href={`/request/${req.id}`} className="text-blue-600 font-medium hover:underline text-xs flex items-center gap-1">
                        ดูรายละเอียด
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
              {requests.length === 0 && (
                <div className="py-12 text-center text-gray-500">ไม่มีรายการคำร้อง</div>
              )}
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1 border rounded-lg disabled:opacity-50"
                  >
                    ก่อนหน้า
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-600">
                    หน้า {page} / {totalPages} (ทั้งหมด {totalCount} รายการ)
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1 border rounded-lg disabled:opacity-50"
                  >
                    ถัดไป
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {bulkDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-2">ยืนยันการดำเนินการ</h3>
            <p className="text-gray-600 mb-4">
              คุณต้องการ{bulkDialog.action === 'APPROVE' ? 'อนุมัติ' : 'ปฏิเสธ'} {selected.length} รายการใช่หรือไม่?
            </p>
            {bulkDialog.action === 'REJECT' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">เหตุผลในการปฏิเสธ (บังคับ)</label>
                <textarea
                  value={bulkDialog.comment}
                  onChange={(e) => setBulkDialog((d) => ({ ...d, comment: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  rows={3}
                  placeholder="กรุณาระบุเหตุผล"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkDialog({ open: false, action: 'APPROVE', comment: '' })}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleBulkSubmit}
                disabled={submitting || (bulkDialog.action === 'REJECT' && !bulkDialog.comment.trim())}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'กำลังดำเนินการ...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
