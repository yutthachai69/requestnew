// app/approve/[token]/ApprovalButtons.tsx
'use client'

import { useState } from 'react';
import { handleApprovalAction } from '@/app/actions/approve-action'; // เดี๋ยวสร้างไฟล์นี้ต่อ

export default function ApprovalButtons({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const onAction = async (status: 'APPROVED' | 'REJECTED') => {
    setLoading(true);
    const result = await handleApprovalAction(token, status);
    if (result.success) {
      setMessage(`ดำเนินการ ${status === 'APPROVED' ? 'อนุมัติ' : 'ปฏิเสธ'} เรียบร้อยแล้ว`);
    } else {
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
      setLoading(false);
    }
  };

  if (message) return <div className="text-center text-green-600 font-bold p-4 bg-green-50 rounded-xl">{message}</div>;

  return (
    <div className="grid grid-cols-2 gap-4">
      <button
        disabled={loading}
        onClick={() => onAction('REJECTED')}
        className="py-3 bg-red-100 text-red-600 font-bold rounded-xl hover:bg-red-200 transition active:scale-95 disabled:opacity-50"
      >
        ไม่อนุมัติ (Reject)
      </button>
      <button
        disabled={loading}
        onClick={() => onAction('APPROVED')}
        className="py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg shadow-green-200 transition active:scale-95 disabled:opacity-50"
      >
        อนุมัติ (Approve)
      </button>
    </div>
  );
}