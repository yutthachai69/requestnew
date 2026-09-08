'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import StatCards from '@/app/components/StatCards';
import { useNotification } from '@/app/context/NotificationContext';
import { TableSkeleton, Skeleton } from '@/app/components/Skeleton';
import CategoryBarChart from '@/app/components/CategoryBarChart';
import DateRangePicker from '@/app/components/DateRangePicker';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  PieChart as PieChartIcon,
  BarChart3,
  LayoutDashboard,
  Calendar,
  CalendarDays,
  ChevronDown
} from 'lucide-react';

// Date filter options
type DateFilterKey = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';
const DATE_FILTERS: { key: DateFilterKey; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'today', label: 'วันนี้' },
  { key: 'week', label: 'สัปดาห์นี้' },
  { key: 'month', label: 'เดือนนี้' },
  { key: 'year', label: 'ปีนี้' },
  { key: 'custom', label: 'กำหนดเอง' },
];

function getDateRange(key: DateFilterKey): { startDate?: string; endDate?: string } {
  if (key === 'all') return {};
  const now = new Date();
  const endDate = now.toISOString().split('T')[0]; // today as YYYY-MM-DD
  let startDate: string;
  switch (key) {
    case 'today':
      startDate = endDate;
      break;
    case 'week': {
      const dayOfWeek = now.getDay(); // 0=Sun
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as start of week
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      startDate = monday.toISOString().split('T')[0];
      break;
    }
    case 'month':
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      break;
    case 'year':
      startDate = `${now.getFullYear()}-01-01`;
      break;
    default:
      return {};
  }
  return { startDate, endDate };
}

// Dynamic import for StatusChart
const StatusChart = dynamic(() => import('@/app/components/StatusChart'), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] w-full flex items-center justify-center">
      <Skeleton className="w-48 h-48 rounded-full" />
    </div>
  ),
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
  createdAt: string;
};

const ALL_TABS: { label: string; status: string }[] = [
  { label: 'รอดำเนินการ', status: 'PENDING' },
  { label: 'อนุมัติแล้ว', status: 'APPROVED' },
  { label: 'ปฏิเสธ', status: 'REJECTED' },
  { label: 'ปิดงานแล้ว', status: 'CLOSED' },
  { label: 'ทั้งหมด', status: '' },
];

export default function DashboardPage() {
  const { data: session } = useSession();
  const { showNotification } = useNotification();
  const searchParams = useSearchParams();

  // State
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [counts, setCounts] = useState({ PENDING: 0, APPROVED: 0, REJECTED: 0, CLOSED: 0 });
  const [categoryStats, setCategoryStats] = useState<{ categoryId: number; categoryName: string; count: number }[]>([]);

  // Pagination & Filters
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [dateFilter, setDateFilter] = useState<DateFilterKey>('all');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<string | undefined>();
  const [customEndDate, setCustomEndDate] = useState<string | undefined>();

  const roleName = session?.user ? (session.user as { roleName?: string }).roleName : undefined;

  // Tabs Logic
  const TABS = useMemo(() => {
    const isITReviewer = ['IT Reviewer', 'It viewer', 'IT Veiwer'].includes(roleName ?? '');
    const isITOperator = ['IT', 'It operetor', 'It operator', 'IT Operator', 'It Operator'].includes(roleName ?? '');
    if (isITReviewer) return ALL_TABS.filter((t) => t.status !== 'APPROVED');
    if (isITOperator) {
      return ALL_TABS.map((t) =>
        t.status === 'APPROVED' ? { ...t, label: 'ดำเนินการแล้ว' } : t
      );
    }
    return ALL_TABS;
  }, [roleName]);

  const initialTab = (() => {
    const s = searchParams.get('status');
    if (s === null) return 0;
    const idx = TABS.findIndex((t) => t.status === s);
    return idx >= 0 ? idx : 0;
  })();
  const [tabIndex, setTabIndex] = useState(initialTab);
  const currentTab = TABS[tabIndex];

  // Date range from filter
  const dateRange = useMemo(() => {
    if (dateFilter === 'custom' && customStartDate) {
      return { startDate: customStartDate, endDate: customEndDate ?? customStartDate };
    }
    return getDateRange(dateFilter);
  }, [dateFilter, customStartDate, customEndDate]);

  const applyStatsFromResponse = useCallback(
    (statsData: { byStatus?: { status: string; count: number }[]; requestCountByCategory?: typeof categoryStats }) => {
      const byStatus = statsData.byStatus ?? [];
      // หลังอนุมัติขั้นสุดท้าย งาน IT และการตรวจปิดงานยังไม่เสร็จ
      // จึงต้องอยู่ใน "รอดำเนินการ" จนกว่าจะเป็น CLOSED จริง
      const APPROVED_STATUSES = ['APPROVED'];
      let pending = 0,
        approved = 0,
        rejected = 0,
        closed = 0;
      for (const s of byStatus) {
        if (s.status === 'CLOSED') closed += s.count;
        else if (s.status === 'REJECTED') rejected += s.count;
        else if (APPROVED_STATUSES.includes(s.status)) approved += s.count;
        else pending += s.count;
      }
      setCounts({ PENDING: pending, APPROVED: approved, REJECTED: rejected, CLOSED: closed });
      setCategoryStats(statsData.requestCountByCategory ?? []);
    },
    []
  );

  const dateRangeKey = `${dateRange.startDate ?? ''}|${dateRange.endDate ?? ''}`;

  /** สถิติ + กราฟ — โหลดเมื่อเปลี่ยนช่วงวันที่เท่านั้น */
  const loadStats = useCallback(() => {
    if (!session?.user) return;
    setLoadingStats(true);
    const statsParams = new URLSearchParams();
    if (dateRange.startDate) statsParams.set('startDate', dateRange.startDate);
    if (dateRange.endDate) statsParams.set('endDate', dateRange.endDate);
    const url = `/api/dashboard/statistics${statsParams.toString() ? `?${statsParams}` : ''}`;

    fetch(url, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { byStatus: [], requestCountByCategory: [] }))
      .then(applyStatsFromResponse)
      .catch(() => {})
      .finally(() => setLoadingStats(false));
  }, [session, dateRange.startDate, dateRange.endDate, applyStatsFromResponse]);

  /** ตาราง — โหลดเมื่อเปลี่ยนแท็บ/ค้นหา/หน้า (ไม่รีเฟรชกราฟ) */
  const loadRequests = useCallback(() => {
    if (!session?.user) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (currentTab?.status) params.set('status', currentTab.status);
    if (search.trim()) params.set('search', search.trim());
    params.set('page', String(page));
    params.set('limit', '10');
    if (dateRange.startDate) params.set('startDate', dateRange.startDate);
    if (dateRange.endDate) params.set('endDate', dateRange.endDate);

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
  }, [
    session,
    currentTab,
    search,
    page,
    dateRange.startDate,
    dateRange.endDate,
    showNotification,
  ]);

  useEffect(() => {
    loadStats();
  }, [loadStats, dateRangeKey]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests, dateRangeKey]);

  const handleTabChange = (i: number) => {
    setTabIndex(i);
    setPage(1);
  };

  const handleDateFilterChange = (key: DateFilterKey) => {
    if (key === 'custom') {
      setShowDateDropdown(false);
      setShowCalendar(true);
      return;
    }
    setDateFilter(key);
    setPage(1);
    setShowDateDropdown(false);
    setShowCalendar(false);
  };

  const handleCustomDateApply = (start: string, end: string) => {
    setCustomStartDate(start);
    setCustomEndDate(end);
    setDateFilter('custom');
    setPage(1);
    setShowCalendar(false);
  };

  // Get displayed label for the date filter button
  const dateFilterLabel = useMemo(() => {
    if (dateFilter === 'custom' && customStartDate) {
      const s = new Date(customStartDate);
      const e = customEndDate ? new Date(customEndDate) : s;
      const fmt = (d: Date) => d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
      if (s.getTime() === e.getTime()) return fmt(s);
      return `${fmt(s)} - ${fmt(e)}`;
    }
    return DATE_FILTERS.find(f => f.key === dateFilter)?.label ?? 'ทั้งหมด';
  }, [dateFilter, customStartDate, customEndDate]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const chartData = [
    { name: 'รอดำเนินการ', value: counts.PENDING },
    { name: 'อนุมัติแล้ว', value: counts.APPROVED },
    { name: 'ปฏิเสธ', value: counts.REJECTED },
    { name: 'ปิดงานแล้ว', value: counts.CLOSED },
  ];

  if (!session?.user) {
    return <div className="p-8 text-center text-gray-500">กรุณาเข้าสู่ระบบ</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 sm:p-6 lg:p-8 space-y-8 font-sans">

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <LayoutDashboard className="w-8 h-8 text-blue-600" />
            ภาพรวมคำร้อง
          </h1>
          <p className="text-gray-500 mt-2 text-sm sm:text-base">
            ติดตามงานที่เกี่ยวข้องกับสิทธิ์ของคุณและประวัติการดำเนินการ
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowDateDropdown(!showDateDropdown)}
              className={`flex items-center gap-2 text-sm font-medium bg-white px-4 py-2 rounded-xl border shadow-sm transition-all ${
                dateFilter !== 'all'
                  ? 'text-blue-600 border-blue-200 ring-1 ring-blue-100'
                  : 'text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              <span>{dateFilterLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-50" />
            </button>
            {showDateDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowDateDropdown(false)} />
                <div className="absolute right-0 top-full mt-2 z-20 bg-white rounded-xl border border-gray-100 shadow-lg py-1 min-w-[160px]">
                  {DATE_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => handleDateFilterChange(f.key)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        dateFilter === f.key
                          ? 'bg-blue-50 text-blue-600 font-semibold'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {showCalendar && (
              <DateRangePicker
                startDate={customStartDate}
                endDate={customEndDate}
                onApply={handleCustomDateApply}
                onClose={() => setShowCalendar(false)}
              />
            )}
          </div>
          <div className="hidden sm:block">
            <span className="text-sm font-medium text-gray-500 bg-white px-3 py-1 rounded-full border shadow-sm">
              {new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Cards Section */}
      <section>
        <StatCards counts={counts} />
      </section>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Donut Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <PieChartIcon size={20} />
              </div>
              สัดส่วนสถานะ
            </h2>
          </div>

          <div className="flex items-center justify-center min-h-[300px]">
            {loadingStats ? (
              <Skeleton className="w-48 h-48 rounded-full" />
            ) : (
              <StatusChart data={chartData} />
            )}
          </div>
        </div>

        {/* Bar Chart */}
        <div className="lg:col-span-3 bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                <BarChart3 size={20} />
              </div>
              งานแยกตามหมวดหมู่
            </h2>
          </div>

          <div className="w-full min-h-[320px]">
            {loadingStats ? (
              <div className="h-[300px] flex items-end justify-around px-4 pb-2 gap-4">
                <Skeleton className="w-12 h-1/3 rounded-t-md" />
                <Skeleton className="w-12 h-2/3 rounded-t-md" />
                <Skeleton className="w-12 h-1/2 rounded-t-md" />
                <Skeleton className="w-12 h-full rounded-t-md" />
              </div>
            ) : (
              <CategoryBarChart data={categoryStats} />
            )}
          </div>
        </div>
      </div>

      {/* Main Table Section */}
      <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 overflow-hidden">

        {/* Controls Bar */}
        <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white">
          {/* Custom Tabs */}
          <div className="flex p-1 bg-gray-100/80 rounded-xl overflow-x-auto max-w-full scrollbar-hide">
            {TABS.map((tab, i) => (
              <button
                key={tab.status || 'all'}
                onClick={() => handleTabChange(i)}
                className={`
                  relative px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 whitespace-nowrap
                  ${tabIndex === i
                    ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <form onSubmit={handleSearch} className="relative w-full lg:w-72 group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาเลขที่ใบงาน, ชื่อ..."
              className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl leading-5 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all sm:text-sm"
            />
          </form>
        </div>

        {/* Content Area */}
        <div className="relative">
          {loading ? (
            <div className="p-6">
              <TableSkeleton rows={5} columns={6} />
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                      <th className="px-6 py-4 rounded-tl-lg">เลขที่ใบงาน</th>
                      <th className="px-6 py-4">ผู้แจ้ง / แผนก</th>
                      <th className="px-6 py-4">หมวดหมู่</th>
                      <th className="px-6 py-4 text-center">สถานะ</th>
                      <th className="px-6 py-4">วันที่แจ้ง</th>
                      <th className="px-6 py-4 text-right rounded-tr-lg">ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {requests.map((req) => (
                      <tr key={req.id} className="group hover:bg-blue-50/30 transition-colors duration-150">
                        <td className="px-6 py-4">
                          <Link href={`/request/${req.id}`} className="font-bold text-blue-600 hover:text-blue-700 font-mono">
                            {req.workOrderNo ?? `#${String(req.id).padStart(5, '0')}`}
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-gray-900 font-medium text-sm">{req.thaiName}</span>
                            <span className="text-xs text-gray-500 mt-0.5">{req.department?.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                            {req.category?.name}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-sm border border-black/5"
                            style={{
                              backgroundColor: req.currentStatus?.colorCode
                                ? `${req.currentStatus.colorCode}15` // 15% opacity
                                : '#f3f4f6',
                              color: req.currentStatus?.colorCode || '#374151',
                              borderColor: req.currentStatus?.colorCode
                                ? `${req.currentStatus.colorCode}30`
                                : 'transparent'
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full mr-2"
                              style={{ backgroundColor: req.currentStatus?.colorCode || '#9ca3af' }}
                            ></span>
                            {req.currentStatus?.displayName ?? req.statusDisplay ?? req.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                            {new Date(req.createdAt).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/request/${req.id}`}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm"
                            title="ดูรายละเอียด"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden grid grid-cols-1 gap-4 p-4">
                {requests.map((req) => (
                  <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm active:scale-[0.99] transition-transform">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex flex-col">
                        <Link href={`/request/${req.id}`} className="text-blue-600 font-bold font-mono">
                          {req.workOrderNo ?? `#${req.id}`}
                        </Link>
                        <span className="text-xs text-gray-400 mt-1">{new Date(req.createdAt).toLocaleDateString('th-TH')}</span>
                      </div>
                      <span
                        className="px-2.5 py-1 rounded-full text-xs font-bold border"
                        style={{
                          backgroundColor: req.currentStatus?.colorCode ? `${req.currentStatus.colorCode}15` : '#f3f4f6',
                          color: req.currentStatus?.colorCode || '#374151',
                          borderColor: req.currentStatus?.colorCode ? `${req.currentStatus.colorCode}30` : 'transparent'
                        }}
                      >
                        {req.currentStatus?.displayName ?? req.status}
                      </span>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs">
                          {req.thaiName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{req.thaiName}</p>
                          <p className="text-xs text-gray-500">{req.department?.name}</p>
                        </div>
                      </div>
                      <div className="pl-10">
                        <span className="inline-block px-2 py-1 bg-gray-50 rounded text-xs text-gray-600 border border-gray-100">
                          📁 {req.category?.name}
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex justify-end">
                      <Link href={`/request/${req.id}`} className="text-sm font-medium text-blue-600 flex items-center gap-1 hover:underline">
                        ดูรายละเอียด <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* Empty State */}
              {requests.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                    <FileText className="w-8 h-8 text-gray-300" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">ไม่พบข้อมูลคำร้อง</h3>
                  <p className="text-gray-500 mt-1 text-sm">ลองปรับตัวกรองหรือค้นหาด้วยคำใหม่อีกครั้ง</p>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="border-t border-gray-100 p-4 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-sm text-gray-500">
                    แสดงหน้า <span className="font-medium text-gray-900">{page}</span> จาก <span className="font-medium text-gray-900">{totalPages}</span> (รวม {totalCount} รายการ)
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
