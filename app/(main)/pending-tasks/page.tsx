'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { approverRoles } from '@/lib/auth-constants';
import { useNotification } from '@/app/context/NotificationContext';

type PendingItem = {
  id: number;
  workOrderNo: string | null;
  RequestNumber: string | null;
  thaiName?: string;
  problemDetail: string;
  status: string;
  currentApprovalStep: number;
  approvalToken: string | null;
  createdAt: string;
  department: { id: number; name: string };
  category: { id: number; name: string };
  location: { id: number; name: string };
  requester: { id: number; fullName: string; username: string };
};

export default function PendingTasksPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const { showNotification } = useNotification();
  const [requests, setRequests] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Bulk Action State
  const [selected, setSelected] = useState<number[]>([]);
  const [allowBulk, setAllowBulk] = useState(false);
  const [bulkDialog, setBulkDialog] = useState<{ open: boolean; action: 'APPROVE' | 'REJECT'; comment: string }>({
    open: false,
    action: 'APPROVE',
    comment: '',
  });
  const [bulkStep, setBulkStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);

  // Fetch Requests
  const fetchRequests = () => {
    if (!session?.user) return;
    setLoading(true);
    fetch('/api/pending-tasks', { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error('โหลดข้อมูลไม่ได้');
        return res.json();
      })
      .then((data) => {
        setRequests(data.requests ?? []);
        setSelected([]); // Clear selection on refresh
      })
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (session?.user) {
      fetchRequests();
    }
  }, [session, sessionStatus, router]);

  // Client-side fallback: redirect ถ้า Role ไม่มีสิทธิ์
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    const role = (session?.user as { roleName?: string } | undefined)?.roleName;
    const allowed = role === 'Admin' || (role != null && approverRoles.includes(role));
    if (!allowed) {
      router.replace('/dashboard');
    }
  }, [sessionStatus, session, router]);

  // Check Bulk Permission
  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/user/bulk-permission', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { allowed: false }))
      .then((data) => setAllowBulk(data.allowed === true))
      .catch(() => setAllowBulk(false));
  }, [session]);

  const roleName = session?.user ? (session.user as { roleName?: string }).roleName : undefined;
  const canSeePage = roleName === 'Admin' || (roleName && approverRoles.includes(roleName));

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

  if (sessionStatus === 'loading' || !session?.user) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-gray-500">กำลังโหลด...</p>
      </div>
    );
  }

  // ถ้าไม่มีสิทธิ์ แสดง loading ชั่วคราวระหว่าง redirect
  if (!canSeePage) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-gray-500">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="p-6 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">รายการที่ต้องอนุมัติ/ดำเนินการ</h1>
          <p className="text-sm text-gray-500">
            คำร้องที่รอให้คุณเป็นผู้อนุมัติหรือดำเนินการตามสิทธิ์ของท่าน
          </p>
        </div>
      </div>

      {allowBulk && selected.length > 0 && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-2 shadow-sm sticky top-0 z-10">
          <span className="text-sm font-medium text-amber-800">{selected.length} รายการที่เลือก</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setBulkStep(1); setBulkDialog({ open: true, action: 'APPROVE', comment: '' }); }}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 shadow-sm transition-colors"
            >
              อนุมัติแบบกลุ่ม
            </button>
            <button
              type="button"
              onClick={() => { setBulkStep(1); setBulkDialog({ open: true, action: 'REJECT', comment: '' }); }}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 shadow-sm transition-colors"
            >
              ปฏิเสธแบบกลุ่ม
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-500">กำลังโหลด...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
          ไม่มีรายการที่ต้องอนุมัติหรือดำเนินการในขณะนี้
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                  {allowBulk && (
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.length === requests.length && requests.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3">เลขที่เอกสาร</th>
                  <th className="px-4 py-3">รายละเอียด</th>
                  <th className="px-4 py-3">ชื่อผู้ขอ</th>
                  <th className="px-4 py-3">วันที่</th>
                  <th className="px-4 py-3">สถานะปัจจุบัน</th>
                  <th className="px-4 py-3">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50 transition">
                    {allowBulk && (
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selected.includes(req.id)}
                          onChange={() => handleSelectOne(req.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                    )}
                    <td className="px-4 py-4 font-medium">
                      <Link href={`/request/${req.id}`} className="text-blue-600 hover:underline">
                        {req.workOrderNo ?? `#${req.id}`}
                      </Link>
                    </td>
                    <td className="px-4 py-4 max-w-xs truncate text-gray-700" title={req.problemDetail}>
                      {req.problemDetail}
                    </td>
                    <td className="px-4 py-4">
                      <div>{req.thaiName ?? req.requester?.fullName}</div>
                      <div className="text-xs text-gray-400">{req.department?.name}</div>
                    </td>
                    <td className="px-4 py-4 text-gray-500">
                      {new Date(req.createdAt).toLocaleDateString('th-TH')}
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                        รอขั้นที่ {req.currentApprovalStep}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/request/${req.id}`}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                      >
                        อนุมัติ/ดำเนินการ
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Bulk Action: Step 1 — ตรวจสอบรายละเอียด ─── */}
      {bulkDialog.open && bulkStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">ตรวจสอบก่อนดำเนินการ</h3>
                <p className="text-sm text-gray-500">{selected.length} รายการที่เลือก</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <p className="text-amber-800 font-medium">
                ท่านได้ตรวจสอบรายละเอียดคำร้องทั้ง {selected.length} รายการแล้วหรือไม่?
              </p>
              <p className="text-amber-600 text-sm mt-1">
                กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการ{bulkDialog.action === 'APPROVE' ? 'อนุมัติ' : 'ปฏิเสธ'}แบบกลุ่ม
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkDialog({ open: false, action: 'APPROVE', comment: '' })}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => setBulkStep(2)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                ตรวจสอบแล้ว ดำเนินการต่อ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Bulk Action: Step 2 — ยืนยันการดำเนินการ ─── */}
      {bulkDialog.open && bulkStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${bulkDialog.action === 'APPROVE' ? 'bg-green-100' : 'bg-red-100'
                }`}>
                {bulkDialog.action === 'APPROVE' ? (
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  ยืนยันการ{bulkDialog.action === 'APPROVE' ? 'อนุมัติ' : 'ปฏิเสธ'}
                </h3>
                <p className="text-sm text-gray-500">{selected.length} รายการ</p>
              </div>
            </div>
            <p className="text-gray-600 mb-4">
              คุณต้องการ <strong>{bulkDialog.action === 'APPROVE' ? 'อนุมัติ' : 'ปฏิเสธ'}</strong> คำร้องทั้ง {selected.length} รายการใช่หรือไม่?
            </p>
            {bulkDialog.action === 'REJECT' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">เหตุผลในการปฏิเสธ (บังคับ)</label>
                <textarea
                  value={bulkDialog.comment}
                  onChange={(e) => setBulkDialog((d) => ({ ...d, comment: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
                  rows={3}
                  placeholder="กรุณาระบุเหตุผล"
                  autoFocus
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setBulkStep(1); setBulkDialog({ open: false, action: 'APPROVE', comment: '' }); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleBulkSubmit}
                disabled={submitting || (bulkDialog.action === 'REJECT' && !bulkDialog.comment.trim())}
                className={`px-4 py-2 text-white rounded-lg font-medium disabled:opacity-50 transition-colors ${bulkDialog.action === 'APPROVE'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
                  }`}
              >
                {submitting ? 'กำลังดำเนินการ...' : bulkDialog.action === 'APPROVE' ? '✓ อนุมัติ' : '✗ ปฏิเสธ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
