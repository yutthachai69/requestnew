'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';

type StatusItem = {
  id: number;
  code: string;
  displayName: string;
  colorCode: string;
  displayOrder: number;
};

export default function AdminStatusesPage() {
  const [list, setList] = useState<StatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<StatusItem | null>(null);
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formColorCode, setFormColorCode] = useState('#6b7280');
  const [saving, setSaving] = useState(false);
  const { showNotification } = useNotification();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/statuses', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('โหลดรายการสถานะไม่ได้');
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'โหลดข้อมูลล้มเหลว', 'error');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openEdit = (item: StatusItem) => {
    setEditing(item);
    setFormDisplayName(item.displayName);
    setFormColorCode(item.colorCode.startsWith('#') ? item.colorCode : `#${item.colorCode}`);
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/statuses/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          displayName: formDisplayName.trim(),
          colorCode: formColorCode.trim().startsWith('#') ? formColorCode.trim() : `#${formColorCode.trim()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'บันทึกไม่สำเร็จ');
      showNotification('บันทึกสถานะแล้ว', 'success');
      setEditOpen(false);
      setEditing(null);
      fetchList();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'บันทึกล้มเหลว', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">จัดการสถานะ</h1>
      <p className="text-gray-600 mb-6">
        คุณสามารถแก้ไข &quot;ชื่อที่แสดงผล&quot; และ &quot;สี&quot; ของแต่ละสถานะได้ที่หน้านี้
      </p>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  รหัสสถานะ (ในระบบ)
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  ชื่อสถานะ (ที่แสดงผล)
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  เครื่องมือ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.code}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex px-3 py-1 text-sm font-medium rounded-full text-white"
                      style={{ backgroundColor: s.colorCode || '#6b7280' }}
                    >
                      {s.displayName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="แก้ไข"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              ยังไม่มีข้อมูลสถานะ — รัน <code className="bg-gray-100 px-1 rounded">npx prisma db seed</code> จากโฟลเดอร์โปรเจกต์
            </div>
          )}
        </div>
      )}

      {/* Dialog แก้ไขชื่อที่แสดงผลและสี */}
      {editOpen && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">แก้ไขสถานะ — {editing.code}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อที่แสดงผล</label>
                <input
                  type="text"
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="ชื่อสถานะ"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">สี</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formColorCode}
                    onChange={(e) => setFormColorCode(e.target.value)}
                    className="w-12 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formColorCode}
                    onChange={(e) => setFormColorCode(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="#6b7280"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => { setEditOpen(false); setEditing(null); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !formDisplayName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
