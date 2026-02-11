'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';

type Location = {
  LocationID: number;
  LocationName: string;
  CategoryIDs?: number[];
  CategoryNames?: string[];
};

type Category = { CategoryID: number; CategoryName: string };

export default function AdminLocationsPage() {
  const [list, setList] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [current, setCurrent] = useState<Location | null>(null);
  const [toDelete, setToDelete] = useState<Location | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategoryIds, setFormCategoryIds] = useState<number[]>([]);
  const { showNotification } = useNotification();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/locations');
      if (!res.ok) throw new Error('โหลดข้อมูลไม่ได้');
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      showNotification('โหลดข้อมูลสถานที่ล้มเหลว', 'error');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/categories');
      if (!res.ok) return;
      const data = await res.json();
      setCategories(Array.isArray(data) ? data.map((c: { CategoryID: number; CategoryName: string }) => ({ CategoryID: c.CategoryID, CategoryName: c.CategoryName })) : []);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleOpen = (item: Location | null) => {
    setCurrent(item);
    setFormName(item ? item.LocationName : '');
    setFormCategoryIds(item && item.CategoryIDs ? item.CategoryIDs : []);
    setOpen(true);
  };

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) {
      showNotification('กรุณากรอกชื่อสถานที่', 'warning');
      return;
    }
    try {
      if (current) {
        const res = await fetch(`/api/admin/locations/${current.LocationID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationName: name, categoryIds: formCategoryIds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'อัปเดตล้มเหลว');
        showNotification('อัปเดตสถานที่สำเร็จ', 'success');
      } else {
        const res = await fetch('/api/admin/locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationName: name, categoryIds: formCategoryIds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'สร้างล้มเหลว');
        showNotification('สร้างสถานที่ใหม่สำเร็จ', 'success');
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
      const res = await fetch(`/api/admin/locations/${toDelete.LocationID}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'ลบล้มเหลว');
      }
      showNotification(`ลบสถานที่ "${toDelete.LocationName}" สำเร็จ`, 'success');
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
        <h1 className="text-2xl font-bold text-gray-900">จัดการสถานที่</h1>
        <button
          type="button"
          onClick={() => handleOpen(null)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          เพิ่มใหม่
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ชื่อสถานที่</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ใช้งานในหมวดหมู่</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">เครื่องมือ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((l) => (
                <tr key={l.LocationID} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600">{l.LocationID}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{l.LocationName}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {l.CategoryNames?.length
                        ? l.CategoryNames.map((catName) => (
                          <span
                            key={catName}
                            className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700"
                          >
                            {catName}
                          </span>
                        ))
                        : <span className="text-sm text-gray-400">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpen(l)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="แก้ไข"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setToDelete(l); setConfirmOpen(true); }}
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
            <div className="py-12 text-center text-gray-500">ยังไม่มีข้อมูลสถานที่</div>
          )}
        </div>
      )}

      {/* Modal สร้าง/แก้ไข */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 my-auto">
            <h2 className="text-lg font-bold mb-4">{current ? 'แก้ไขสถานที่' : 'สร้างสถานที่'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อสถานที่ <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="เช่น TUSM, NO, N1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ใช้งานในหมวดหมู่</label>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50/50 space-y-2">
                  {categories.map((c) => (
                    <label key={c.CategoryID} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formCategoryIds.includes(c.CategoryID)}
                        onChange={(e) => {
                          if (e.target.checked) setFormCategoryIds((prev) => [...prev, c.CategoryID]);
                          else setFormCategoryIds((prev) => prev.filter((id) => id !== c.CategoryID));
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{c.CategoryName}</span>
                    </label>
                  ))}
                  {categories.length === 0 && <span className="text-sm text-gray-400">ไม่มีหมวดหมู่</span>}
                </div>
              </div>
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
              คุณต้องการลบสถานที่ &quot;{toDelete.LocationName}&quot; จริงหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้
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
