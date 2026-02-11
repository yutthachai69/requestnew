'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';

type DocConfigItem = {
  id: number | null;
  year: number;
  prefix: string;
  lastRunningNumber: number;
  categoryId: number;
  categoryName: string;
};

// ปี พ.ศ. ปัจจุบัน (2026 → 2569)
const currentYearBE = new Date().getFullYear() + 543;
const YEAR_OPTIONS = Array.from({ length: 7 }, (_, i) => currentYearBE - 3 + i);

export default function AdminDocConfigPage() {
  const [list, setList] = useState<DocConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(currentYearBE);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<DocConfigItem | null>(null);
  const [formPrefix, setFormPrefix] = useState('');
  const [formLastNum, setFormLastNum] = useState<number | ''>(0);
  const { showNotification } = useNotification();

  const fetchList = useCallback(async (year: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/doc-config?year=${year}`);
      if (!res.ok) throw new Error('โหลดข้อมูลไม่ได้');
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      showNotification('โหลดตั้งค่าเลขที่เอกสารล้มเหลว', 'error');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchList(selectedYear);
  }, [selectedYear, fetchList]);

  const handleOpen = (item: DocConfigItem) => {
    setCurrent(item);
    setFormPrefix(item.prefix);
    setFormLastNum(item.lastRunningNumber);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!current) return;
    const prefix = formPrefix.trim();
    const lastNum = formLastNum === '' ? 0 : Math.max(0, Number(formLastNum));
    if (!prefix) {
      showNotification('กรุณาระบุ Prefix', 'warning');
      return;
    }
    try {
      if (current.id != null) {
        const res = await fetch(`/api/admin/doc-config/${current.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, lastRunningNumber: lastNum }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'อัปเดตล้มเหลว');
        showNotification('อัปเดตตั้งค่าเลขที่เอกสารสำเร็จ', 'success');
      } else {
        const res = await fetch('/api/admin/doc-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year: selectedYear,
            categoryId: current.categoryId,
            prefix,
            lastRunningNumber: lastNum,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'สร้างล้มเหลว');
        showNotification('บันทึกตั้งค่าเลขที่เอกสารสำเร็จ', 'success');
      }
      setOpen(false);
      fetchList(selectedYear);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด', 'error');
    }
  };

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">ตั้งค่าเลขที่เอกสาร</h1>

      <p className="text-gray-600 mb-2">
        เลือกปีที่ต้องการตั้งค่า (พ.ศ.) จากนั้นกดปุ่ม &quot;แก้ไข&quot; ในแถวที่ต้องการเพื่อกำหนด Prefix และเลขเริ่มต้น
      </p>
      <p className="text-sm text-gray-500 mb-6">
        หมายเหตุ: การตั้งค่าสำหรับปีหนึ่งจะใช้ได้ทั้งปีนั้นและปีถัดไป (เช่น ตั้งค่า 2568 จะใช้ได้ทั้ง 2568 และ 2569)
      </p>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">เลือกปี</label>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 min-w-[120px]"
        >
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">หมวดหมู่</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Prefix</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">เลขล่าสุด</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">เครื่องมือ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((d) => (
                <tr key={`${d.categoryId}-${d.year}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.categoryName}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{d.prefix || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{d.lastRunningNumber}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleOpen(d)}
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                      title="แก้ไข"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && (
            <div className="py-12 text-center text-gray-500">ไม่มีหมวดหมู่</div>
          )}
        </div>
      )}

      {open && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">แก้ไขเลขที่เอกสาร</h2>
            <p className="text-sm text-gray-600 mb-4">
              {current.categoryName} — ปี {selectedYear} (พ.ศ.)
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prefix</label>
                <input
                  type="text"
                  value={formPrefix}
                  onChange={(e) => setFormPrefix(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="เช่น 6869"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เลขล่าสุด (เลขเริ่มต้น)</label>
                <input
                  type="number"
                  min={0}
                  value={formLastNum === '' ? '' : formLastNum}
                  onChange={(e) => setFormLastNum(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">ยกเลิก</button>
              <button type="button" onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
