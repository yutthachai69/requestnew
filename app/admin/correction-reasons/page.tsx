'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';

type Reason = {
  ReasonID: number;
  Text: string;
  IsActive: boolean;
};

export default function AdminCorrectionReasonsPage() {
  const [list, setList] = useState<Reason[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [current, setCurrent] = useState<Reason | null>(null);
  const [toDelete, setToDelete] = useState<Reason | null>(null);
  const [formText, setFormText] = useState('');
  const [formActive, setFormActive] = useState(true);
  const { showNotification } = useNotification();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/correction-reasons');
      if (!res.ok) throw new Error('โหลดข้อมูลไม่ได้');
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      showNotification('โหลดเหตุผลการแก้ไขล้มเหลว', 'error');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleOpen = (item: Reason | null) => {
    setCurrent(item);
    setFormText(item ? item.Text : '');
    setFormActive(item ? item.IsActive : true);
    setOpen(true);
  };

  const handleSave = async () => {
    const text = formText.trim();
    if (!text) {
      showNotification('กรุณากรอกข้อความเหตุผล', 'warning');
      return;
    }
    try {
      if (current) {
        const res = await fetch(`/api/admin/correction-reasons/${current.ReasonID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, isActive: formActive }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'อัปเดตล้มเหลว');
        showNotification('อัปเดตเหตุผลการแก้ไขสำเร็จ', 'success');
      } else {
        const res = await fetch('/api/admin/correction-reasons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, isActive: formActive }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'สร้างล้มเหลว');
        showNotification('สร้างเหตุผลการแก้ไขสำเร็จ', 'success');
      }
      setOpen(false);
      fetchList();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด', 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!toDelete) return;
    try {
      const res = await fetch(`/api/admin/correction-reasons/${toDelete.ReasonID}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'ลบล้มเหลว');
      }
      showNotification(`ลบเหตุผลสำเร็จ`, 'success');
      setConfirmOpen(false);
      setToDelete(null);
      fetchList();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'ลบล้มเหลว', 'error');
    }
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">จัดการเหตุผลการแก้ไข</h1>
        <button
          type="button"
          onClick={() => handleOpen(null)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          สร้างเหตุผลใหม่
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ข้อความ</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">สถานะ</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">เครื่องมือ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((r) => (
                <tr key={r.ReasonID} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600">{r.ReasonID}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{r.Text}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${r.IsActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}
                    >
                      {r.IsActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpen(r)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="แก้ไข"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setToDelete(r); setConfirmOpen(true); }}
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                        title="ลบ"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && (
            <div className="py-12 text-center text-gray-500">ยังไม่มีเหตุผลการแก้ไข</div>
          )}
        </div>
      )}

      {/* Modal สร้าง/แก้ไข */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 my-auto">
            <h2 className="text-lg font-bold mb-4">{current ? 'แก้ไขเหตุผลการแก้ไข' : 'สร้างเหตุผลใหม่'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ข้อความ <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="เช่น เนื่องจากพนักงานคีย์ข้อมูลผิด"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">เปิดใช้งาน</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">ยกเลิก</button>
              <button type="button" onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog ยืนยันลบ */}
      {confirmOpen && toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-2">ยืนยันการลบ</h2>
            <p className="text-gray-600 mb-6">
              คุณต้องการลบเหตุผล &quot;{toDelete.Text}&quot; จริงหรือไม่?
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setConfirmOpen(false); setToDelete(null); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">ยกเลิก</button>
              <button type="button" onClick={handleDeleteConfirm} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">ยืนยันการลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
