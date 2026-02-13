'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';

// Dynamic import for F07FormPrint - lazy load as it's not needed immediately
const F07FormPrint = dynamic(() => import('@/app/components/F07FormPrint'), {
  ssr: false,
  loading: () => <div className="h-[400px] flex items-center justify-center"><LoadingSpinner /></div>,
});

type RequestDetail = {
  id: number;
  workOrderNo: string | null;
  thaiName: string;
  phone: string | null;
  problemDetail: string;
  systemType: string;
  isMoneyRelated: boolean;
  status: string;
  currentStatusId?: number | null;
  currentStatus?: { id: number; code: string; displayName: string; colorCode?: string } | null;
  currentApprovalStep?: number;
  attachmentPath: string | null;
  createdAt: string;
  updatedAt: string;
  requesterId?: number;
  department: { id: number; name: string };
  category: { id: number; name: string };
  location: { id: number; name: string };
  requester: { id: number; fullName: string; username: string; position?: string | null } | null;
};

type ActionItem = { ActionName: string; ActionDisplayName: string };

type HistoryItem = {
  FullName: string;
  RoleName: string;
  ActionType: string;
  Comment: string | null;
  ApprovalTimestamp: string;
};

export default function RequestDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { data: session } = useSession();
  const { showNotification } = useNotification();
  const currentUserId = session?.user ? Number((session.user as { id?: string }).id) : null;
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [possibleActions, setPossibleActions] = useState<ActionItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [resolvedBy, setResolvedBy] = useState<string | null>(null);
  const [resolvedAt, setResolvedAt] = useState<string | null>(null);
  const [approvedByITViewer, setApprovedByITViewer] = useState<string | null>(null);
  const [itObstacles, setItObstacles] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionDialog, setActionDialog] = useState<{ open: boolean; action: ActionItem | null; comment: string }>({
    open: false,
    action: null,
    comment: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('ไม่พบ ID คำร้อง');
      return;
    }
    let cancelled = false;
    fetch(`/api/requests/${id}`, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'ไม่พบคำร้อง' : 'โหลดข้อมูลไม่ได้');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setRequest(data.request);
        setPossibleActions(data.possibleActions ?? []);
        setHistory(data.history ?? []);
        setResolvedBy(data.resolvedBy ?? null);
        setResolvedAt(data.resolvedAt ?? null);
        setApprovedByITViewer(data.approvedByITViewer ?? null);
        setItObstacles(data.itObstacles ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message ?? 'โหลดข้อมูลไม่ได้');
          setRequest(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handlePerformAction = async () => {
    const { action, comment } = actionDialog;
    if (!action || !id) return;
    if (action.ActionName === 'REJECT' && !comment.trim()) {
      showNotification('กรุณาระบุเหตุผลในการปฏิเสธ', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/requests/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ actionName: action.ActionName, comment: comment.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'ดำเนินการไม่สำเร็จ');
      showNotification(data.message ?? 'ดำเนินการสำเร็จ', 'success');
      setActionDialog({ open: false, action: null, comment: '' });

      // ─── โหลดข้อมูลทั้งหมดใหม่หลังดำเนินการ ───
      const refetch = await fetch(`/api/requests/${id}`, { credentials: 'same-origin' });
      if (refetch.ok) {
        const refetchData = await refetch.json();
        setRequest(refetchData.request);              // ✅ อัพเดต request + status + currentStatus
        setPossibleActions(refetchData.possibleActions ?? []); // ✅ อัพเดตปุ่มที่กดได้
        setHistory(refetchData.history ?? []);
        setResolvedBy(refetchData.resolvedBy ?? null);
        setResolvedAt(refetchData.resolvedAt ?? null);
        setApprovedByITViewer(refetchData.approvedByITViewer ?? null);
        setItObstacles(refetchData.itObstacles ?? null);
      }
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full p-6 flex justify-center items-center min-h-[200px]">
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !request) {
    return (
      <div className="w-full p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
          {error ?? 'ไม่พบข้อมูลคำร้อง'}
        </div>
        <Link href="/dashboard" className="mt-4 inline-block text-blue-600 hover:underline">
          ← กลับไป Dashboard
        </Link>
      </div>
    );
  }

  const thDateTime = (d: string) => new Date(d).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

  /** หาชื่อผู้อนุมัติจากประวัติ — รองรับทั้งชื่อ role ภาษาอังกฤษและไทย */
  const approvedByAnyRole = (roleNames: string[]) => {
    const entry = [...history].reverse().find((h) => h.ActionType === 'อนุมัติ' && roleNames.includes(h.RoleName));
    return entry?.FullName ?? undefined;
  };
  const signatures = {
    reviewer: approvedByAnyRole(['Head of Department', 'หัวหน้าแผนก', 'Manager', 'หน.แผนก', 'ผู้จัดการฝ่าย']),
    accountant: approvedByAnyRole(['Accountant', 'บัญชี']),
    approver: approvedByAnyRole(['Final Approver', 'ผู้อนุมัติ', 'ผู้จัดการฝ่ายสำนักงาน', 'รองผู้อำนวยการโรงงาน', 'ผู้จัดการโรงงาน']),
  };

  const f07Request = {
    workOrderNo: request.workOrderNo,
    thaiName: request.thaiName,
    phone: request.phone,
    position: request.requester?.position ?? null,
    problemDetail: request.problemDetail,
    systemType: request.systemType,
    createdAt: request.createdAt,
    department: request.department,
    location: request.location,
    category: request.category,
  };

  return (
    <div className="w-full p-6 bg-gray-100 min-h-screen">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <Link href="/dashboard" className="text-blue-600 hover:underline text-sm">
          ← กลับไป Dashboard
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="px-3 py-1 rounded-full text-sm font-semibold"
            style={{
              backgroundColor: request.currentStatus?.colorCode
                ? `${request.currentStatus.colorCode}20`
                : '#fef3c7',
              color: request.currentStatus?.colorCode || '#92400e',
            }}
          >
            {request.currentStatus?.displayName ?? request.status}
          </span>
          <Link
            href={`/request/${id}/print`}
            className="inline-flex items-center gap-3 px-6 py-3 bg-[#E91E63] text-white rounded-full text-sm font-bold shadow-lg hover:bg-[#d81b60] hover:shadow-xl active:scale-[0.98] transition-all duration-200"
          >
            <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6M9 16h6" />
            </svg>
            ส่งออกเป็น PDF
          </Link>
          {['PENDING', 'REVISION'].includes(request.status) && currentUserId != null && (request.requesterId === currentUserId || request.requester?.id === currentUserId) && (
            <Link
              href={`/request/${id}/edit`}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600"
            >
              {request.status === 'REVISION' ? '✏️ แก้ไขและส่งกลับ' : 'แก้ไขคำร้อง'}
            </Link>
          )}
        </div>
      </div>

      {/* Revision Banner */}
      {request.status === 'REVISION' && currentUserId != null && (request.requesterId === currentUserId || request.requester?.id === currentUserId) && (
        <div className="mx-auto max-w-4xl mb-6 bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-6 h-6 text-orange-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="font-semibold text-orange-800">คำร้องนี้ถูกส่งกลับแก้ไข</p>
            <p className="text-sm text-orange-600 mt-1">กรุณาตรวจสอบหมายเหตุจากผู้อนุมัติด้านล่าง แก้ไขรายละเอียด แล้วกดปุ่ม &quot;แก้ไขและส่งกลับ&quot; เพื่อส่งเข้าระบบอนุมัติใหม่</p>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <F07FormPrint request={f07Request} signatures={signatures} resolvedBy={resolvedBy} resolvedAt={resolvedAt} approvedByITViewer={approvedByITViewer} itObstacles={itObstacles} />
          </div>

          {possibleActions.length > 0 ? (
            <div className="mt-6 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">การดำเนินการ</h2>
              <div className="flex flex-wrap gap-3">
                {possibleActions.map((action) => (
                  <button
                    key={action.ActionName}
                    type="button"
                    onClick={() => setActionDialog({ open: true, action, comment: '' })}
                    className={`px-4 py-2 rounded-lg font-medium text-sm ${action.ActionName === 'REJECT'
                      ? 'bg-red-100 text-red-800 hover:bg-red-200'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                  >
                    {action.ActionDisplayName}
                  </button>
                ))}
              </div>
            </div>
          ) : request.status === 'WAITING_ACCOUNT_2' ? (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <strong>ขั้นนี้:</strong> ต้องให้บัญชีอนุมัติก่อน สถานะจะเปลี่ยนเป็น &quot;รอ IT ปิดงาน&quot; แล้วคุณ (IT Reviewer) จะเห็นปุ่ม &quot;ยืนยันปิดงาน&quot;
            </div>
          ) : request.status === 'WAITING_IT_CLOSE' ? (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
              <strong>รอ IT ปิดงาน:</strong> ถ้าคุณเป็น IT Reviewer แต่ปุ่ม &quot;ยืนยันปิดงาน&quot; ไม่ขึ้น ให้รัน <code className="bg-blue-100 px-1 rounded">npm run db:seed</code> แล้วรีเฟรชหรือล็อกอินใหม่
            </div>
          ) : null}
        </div>

        <aside className="w-full lg:w-72 shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sticky top-4">
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span>ประวัติการอนุมัติ</span>
            </h3>
            {history.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">ยังไม่มีประวัติการอนุมัติ</p>
            ) : (
              <div className="relative pl-2 space-y-0">
                {/* Connecting Line */}
                <div className="absolute top-2 bottom-6 left-[19px] w-0.5 bg-gray-200" aria-hidden="true" />

                {history.map((item, i) => {
                  /* Determine Style based on Action */
                  let dotColor = 'bg-gray-300 ring-gray-100';
                  let icon = null;
                  const action = item.ActionType;

                  if (item.ActionType.includes('สร้าง') || item.ActionType.includes('ยื่น')) {
                    dotColor = 'bg-blue-500 ring-blue-100';
                    icon = (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                      </svg>
                    );
                  } else if (item.ActionType.includes('อนุมัติ')) {
                    dotColor = 'bg-green-500 ring-green-100';
                    icon = (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    );
                  } else if (item.ActionType.includes('ปฏิเสธ') || item.ActionType.includes('ส่งกลับ') || item.ActionType.includes('ตีกลับ')) {
                    dotColor = 'bg-red-500 ring-red-100';
                    icon = (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    );
                  } else if (item.ActionType.includes('ปิดงาน') || item.ActionType.includes('เสร็จสิ้น')) {
                    dotColor = 'bg-gray-700 ring-gray-100';
                    icon = (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 21v-8a2 2 0 012-2h14a2 2 0 012 2v8" />
                      </svg>
                    );
                  }

                  return (
                    <div key={i} className="relative flex gap-4 pb-6 last:pb-0 group">
                      {/* Timeline Dot */}
                      <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ring-4 ${dotColor} shadow-sm transition-transform group-hover:scale-110`}>
                        {icon || <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>

                      {/* Content */}
                      <div className="flex-1 pt-1.5">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                          <p className="font-bold text-sm text-gray-900">{item.FullName}</p>
                          <span className="text-[11px] text-gray-400 font-mono whitespace-nowrap">
                            {new Date(item.ApprovalTimestamp).toLocaleString('th-TH', {
                              day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${item.ActionType.includes('ปฏิเสธ') ? 'bg-red-100 text-red-700' :
                            item.ActionType.includes('อนุมัติ') ? 'bg-green-100 text-green-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                            {item.ActionType}
                          </span>
                          <span className="text-xs text-gray-500">({item.RoleName})</span>
                        </div>

                        {item.Comment && (
                          <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-200 relative">
                            {/* Speech bubble triangle */}
                            <div className="absolute -top-1.5 left-3 w-3 h-3 bg-gray-50 border-t border-l border-gray-200 transform rotate-45" />
                            "{item.Comment}"
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
              <p>วันที่แจ้ง: {thDateTime(request.createdAt)}</p>
              <p>แก้ไขล่าสุด: {thDateTime(request.updatedAt)}</p>
            </div>
          </div>
        </aside>
      </div>

      {actionDialog.open && actionDialog.action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-2">ยืนยันการดำเนินการ</h3>
            <p className="text-gray-600 mb-4">
              คุณต้องการ{actionDialog.action.ActionDisplayName} คำร้องนี้ใช่หรือไม่?
            </p>
            {actionDialog.action.ActionName === 'REJECT' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">เหตุผลในการปฏิเสธ (บังคับ)</label>
                <textarea
                  value={actionDialog.comment}
                  onChange={(e) => setActionDialog((prev) => ({ ...prev, comment: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  rows={3}
                  placeholder="กรุณาระบุเหตุผล"
                />
              </div>
            )}
            {actionDialog.action.ActionName === 'IT_PROCESS' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">ปัญหาอุปสรรค (ถ้ามี)</label>
                <textarea
                  value={actionDialog.comment}
                  onChange={(e) => setActionDialog((prev) => ({ ...prev, comment: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  rows={3}
                  placeholder="ระบุปัญหาหรืออุปสรรคระหว่างดำเนินการ (ไม่บังคับ)"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActionDialog({ open: false, action: null, comment: '' })}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handlePerformAction}
                disabled={submitting || (actionDialog.action.ActionName === 'REJECT' && !actionDialog.comment.trim())}
                className={`px-4 py-2 rounded-lg font-medium ${actionDialog.action.ActionName === 'REJECT'
                  ? 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50'
                  : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                  }`}
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
