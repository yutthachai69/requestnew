'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { requesterRoles } from '@/lib/auth-constants';

type ReqRow = {
  id: number;
  workOrderNo: string | null;
  problemDetail: string;
  status: string;
  statusDisplay?: string;
  currentApprovalStep: number;
  currentStepLabel: string | null;
  createdAt: string;
  department: { id: number; name: string };
  category: { id: number; name: string };
  requester: { id: number; fullName: string; username: string };
};

type CategoryInfo = { CategoryID: number; CategoryName: string };

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'รอดำเนินการ',
  CLOSED: 'เสร็จสิ้น',
  REJECTED: 'ปฏิเสธ',
  APPROVED: 'อนุมัติแล้ว',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  CLOSED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  APPROVED: 'bg-blue-100 text-blue-800',
};

function stepLabelToShort(label: string | null): string {
  if (!label) return 'รออนุมัติ';
  const m: Record<string, string> = {
    'Head of Department': 'หน.แผนก',
    'Head of Dept': 'หน.แผนก',
    Manager: 'หน.แผนก',
    IT: 'IT',
    Account: 'บัญชี',
    Accounting: 'บัญชี',
    Accountant: 'บัญชี',
    'Final Approver': 'ผู้อนุมัติขั้นสุดท้าย',
    'IT Reviewer': 'IT',
    คลัง: 'คลังสินค้า',
    'บัญชี/คลัง': 'บัญชี/คลัง',
  };
  return m[label] ?? label;
}

export default function CategoryRequestsPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const categoryId = params?.id ? String(params.id) : '';
  const [category, setCategory] = useState<CategoryInfo | null>(null);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [requests, setRequests] = useState<ReqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0); // 0 = คำร้องของฉัน (ไม่เสร็จ), 1 = รายการที่เสร็จแล้ว

  const isCompletedTab = tabIndex === 1;
  const roleName = (session?.user as { roleName?: string })?.roleName;
  const currentUserId = session?.user && (session.user as { id?: string }).id ? Number((session.user as { id?: string }).id) : null;
  const canSubmitRequest = roleName != null && requesterRoles.includes(roleName);

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.replace('/login');
  }, [sessionStatus, router]);

  const fetchCategories = useCallback(() => {
    fetch('/api/master/categories', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { CategoryID: number; CategoryName: string }[]) => {
        setCategories(Array.isArray(list) ? list : []);
        const c = (Array.isArray(list) ? list : []).find((x) => x.CategoryID === Number(categoryId));
        setCategory(c ?? null);
      })
      .catch(() => setCategories([]));
  }, [categoryId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (!categoryId) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('categoryId', categoryId);
    params.set('page', '1');
    params.set('limit', '50');
    if (isCompletedTab) params.set('status', 'CLOSED');
    fetch(`/api/requests?${params}`, { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : { requests: [] }))
      .then((data) => {
        let list = data.requests ?? [];
        if (!isCompletedTab) list = list.filter((r: ReqRow) => r.status !== 'CLOSED');
        setRequests(list);
      })
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, [categoryId, isCompletedTab]);

  const handleExportExcel = () => {
    const headers = ['เลขที่เอกสาร', 'รายละเอียด', 'ชื่อผู้ขอ', 'วันที่', 'สถานะ'];
    const rows = requests.map((r) => [
      r.workOrderNo ?? `#${r.id}`,
      r.problemDetail,
      r.requester?.fullName ?? '',
      new Date(r.createdAt).toLocaleDateString('th-TH'),
      r.status === 'CLOSED' ? 'เสร็จสิ้น' : r.status === 'PENDING' ? `รอขั้นที่ ${r.currentApprovalStep}` : r.status,
    ]);
    const csv = [headers.join(','), ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `คำร้อง_${category?.CategoryName ?? categoryId}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (sessionStatus === 'loading' || !session?.user) {
    return (
      <div className="flex min-h-[200px] items-center justify-center p-6">
        <p className="text-gray-500">กำลังโหลด...</p>
      </div>
    );
  }

  const canEditOrDelete = (req: ReqRow) =>
    requesterRoles.includes(roleName ?? '') &&
    currentUserId != null &&
    req.requester?.id === currentUserId &&
    req.status === 'PENDING';

  const numId = Number(categoryId);
  if (!numId || !category) {
    return (
      <div className="p-6">
        <p className="text-gray-500">ไม่พบหมวดหมู่ หรือคุณไม่มีสิทธิ์เข้าถึง</p>
        <Link href="/dashboard" className="mt-2 inline-block text-blue-600 hover:underline">กลับหน้าแรก</Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">{canSubmitRequest ? 'คำร้องของคุณ' : 'รายการคำร้อง'}</h1>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex border-b border-gray-200">
          <button
            type="button"
            onClick={() => setTabIndex(0)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tabIndex === 0 ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            {canSubmitRequest ? 'คำร้องของฉัน' : 'รายการคำร้อง'}
          </button>
          <button
            type="button"
            onClick={() => setTabIndex(1)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tabIndex === 1 ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            รายการที่เสร็จแล้ว
          </button>
        </div>
        <div className="flex gap-2">
          {canSubmitRequest && (
            <Link
              href={`/request/new?category=${categoryId}`}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <span>+</span> สร้างคำร้องใหม่
            </Link>
          )}
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ส่งออกเป็น Excel
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">เลขที่เอกสาร</th>
                <th className="px-4 py-3">รายละเอียด</th>
                <th className="px-4 py-3">ชื่อผู้ขอ</th>
                <th className="px-4 py-3">วันที่</th>
                <th className="px-4 py-3">สถานะปัจจุบัน</th>
                <th className="px-4 py-3">เครื่องมือ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    {isCompletedTab ? 'ไม่มีรายการที่เสร็จแล้ว' : canSubmitRequest ? 'ไม่มีคำร้องของฉัน' : 'ไม่มีรายการคำร้อง'}
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 font-medium">
                      <Link href={`/request/${req.id}`} className="text-blue-600 hover:underline">
                        {req.workOrderNo ?? `#${req.id}`}
                      </Link>
                    </td>
                    <td className="px-4 py-4 max-w-md text-gray-700" title={req.problemDetail}>
                      <span className="line-clamp-2">{req.problemDetail}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                          {(req.requester?.fullName ?? req.requester?.username ?? '?').slice(0, 1).toUpperCase()}
                        </span>
                        {req.requester?.fullName ?? req.requester?.username ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-500">
                      {new Date(req.createdAt).toLocaleDateString('th-TH')}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[req.status] ?? 'bg-gray-100 text-gray-700'}`}>
                          {req.statusDisplay ?? (req.status === 'CLOSED' ? 'เสร็จสิ้น' : req.status === 'PENDING' ? `รอขั้นที่ ${req.currentApprovalStep}` : STATUS_LABELS[req.status] ?? req.status)}
                        </span>
                        {req.status === 'PENDING' && req.currentStepLabel && !req.statusDisplay && (
                          <span className="text-xs text-gray-500">รอ: {stepLabelToShort(req.currentStepLabel)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Link href={`/request/${req.id}`} className="text-gray-500 hover:text-blue-600" title="ดู">
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Link>
                        {canEditOrDelete(req) && (
                          <>
                            <Link href={`/request/${req.id}/edit`} className="text-gray-500 hover:text-amber-600" title="แก้ไข">
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </Link>
                            <Link href={`/request/${req.id}`} className="text-gray-500 hover:text-red-600" title="ลบ (ดูรายละเอียดที่หน้ารายการ)">
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </Link>
                          </>
                        )}
                        {req.status === 'CLOSED' && (
                          <span className="text-gray-400" title="ความคิดเห็น">
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
