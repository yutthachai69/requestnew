'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useNotification } from '@/app/context/NotificationContext';
import StatusChart from '@/app/components/StatusChart';
import LoadingSpinner from '@/app/components/LoadingSpinner';

type ReportData = {
  summary: {
    totalRequests: number;
    completedRequests: number;
    rejectedRequests: number;
    avgCompletionHours: number | null;
  };
  byStatus: { StatusName: string; count: number }[];
  byCategory: { categoryName: string; count: number }[];
};

export default function ReportPage() {
  const { data: session } = useSession();
  const { showNotification } = useNotification();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchReport = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    fetch(`/api/dashboard/report-data?${params}`, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error('โหลดรายงานไม่ได้');
        return res.json();
      })
      .then(setData)
      .catch(() => {
        showNotification('โหลดรายงานไม่ได้', 'error');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [startDate, endDate, showNotification]);

  useEffect(() => {
    if (!session?.user) return;
    fetchReport();
  }, [session, fetchReport]);

  if (!session?.user) {
    return (
      <div className="w-full p-6">
        <p className="text-gray-500">กรุณาเข้าสู่ระบบ</p>
      </div>
    );
  }

  const roleName = (session.user as { roleName?: string }).roleName;
  const chartData = data?.byStatus?.map((s) => ({
    name: s.StatusName === 'APPROVED' ? 'อนุมัติแล้ว' : s.StatusName === 'REJECTED' ? 'ปฏิเสธ' : s.StatusName,
    value: s.count,
  })) ?? [];

  return (
    <div className="w-full p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        {roleName === 'Admin' ? 'รายงานทั้งระบบ' : 'รายงานแผนก'}
      </h1>
      <p className="text-gray-500">ภาพรวมสถานะคำร้องและประสิทธิภาพ</p>

      <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">จากวันที่</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ถึงวันที่</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
        <button
          type="button"
          onClick={fetchReport}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          กรอง
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <p className="text-sm text-gray-500">คำร้องทั้งหมด</p>
              <p className="text-2xl font-bold text-gray-900">{data.summary.totalRequests}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <p className="text-sm text-gray-500">อนุมัติแล้ว</p>
              <p className="text-2xl font-bold text-green-600">{data.summary.completedRequests}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <p className="text-sm text-gray-500">ปฏิเสธ/ส่งกลับ</p>
              <p className="text-2xl font-bold text-red-600">{data.summary.rejectedRequests}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <p className="text-sm text-gray-500">เวลาดำเนินการเฉลี่ย</p>
              <p className="text-2xl font-bold text-gray-900">
                {data.summary.avgCompletionHours != null ? `${data.summary.avgCompletionHours} ชม.` : '—'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">ตามสถานะ</h2>
              <div className="h-[300px]">
                <StatusChart data={chartData} />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">ตามหมวดหมู่</h2>
              <ul className="space-y-2">
                {data.byCategory?.map((c) => (
                  <li key={c.categoryName} className="flex justify-between py-2 border-b border-gray-100">
                    <span>{c.categoryName}</span>
                    <span className="font-medium">{c.count}</span>
                  </li>
                ))}
                {(!data.byCategory || data.byCategory.length === 0) && (
                  <li className="text-gray-500">ไม่มีข้อมูล</li>
                )}
              </ul>
            </div>
          </div>
        </>
      ) : (
        <p className="text-gray-500">ไม่สามารถโหลดรายงานได้</p>
      )}
    </div>
  );
}
