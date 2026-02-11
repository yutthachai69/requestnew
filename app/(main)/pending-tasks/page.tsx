'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { approverRoles } from '@/lib/auth-constants';

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
  const [requests, setRequests] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (!session?.user) return;

    setLoading(true);
    fetch('/api/pending-tasks', { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error('โหลดข้อมูลไม่ได้');
        return res.json();
      })
      .then((data) => setRequests(data.requests ?? []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, [session, sessionStatus, router]);

  const roleName = session?.user ? (session.user as { roleName?: string }).roleName : undefined;
  const canSeePage = roleName === 'Admin' || (roleName && approverRoles.includes(roleName));

  if (sessionStatus === 'loading' || !session?.user) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-gray-500">กำลังโหลด...</p>
      </div>
    );
  }

  if (!canSeePage) {
    return (
      <div className="p-6">
        <p className="text-amber-600">คุณไม่มีสิทธิ์เข้าหน้ารายการที่ต้องอนุมัติ/ดำเนินการ</p>
        <Link href="/dashboard" className="mt-2 inline-block text-blue-600 hover:underline">กลับหน้าแรก</Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-2">รายการที่ต้องอนุมัติ/ดำเนินการ</h1>
      <p className="text-sm text-gray-500 mb-6">
        คำร้องที่รอให้คุณเป็นผู้อนุมัติหรือดำเนินการตามสิทธิ์ของท่าน
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-500">กำลังโหลด...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
          ไม่มีรายการที่ต้องอนุมัติหรือดำเนินการในขณะนี้
        </div>
      ) : (
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
                  <th className="px-4 py-3">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50 transition">
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
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
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
    </div>
  );
}
