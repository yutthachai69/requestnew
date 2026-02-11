'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';

type Department = { DepartmentID: number; DepartmentName: string; IsActive: boolean };

export default function AdminDepartmentsPage() {
  const [list, setList] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [current, setCurrent] = useState<Department | null>(null);
  const [toDelete, setToDelete] = useState<Department | null>(null);
  const [formName, setFormName] = useState('');
  const [formActive, setFormActive] = useState(true);
  const { showNotification } = useNotification();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/departments');
      if (!res.ok) throw new Error('โหลดข้อมูลไม่ได้');
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      showNotification('โหลดข้อมูลแผนกล้มเหลว', 'error');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleOpen = (item: Department | null) => {
    setCurrent(item);
    setFormName(item ? item.DepartmentName : '');
    setFormActive(item ? item.IsActive : true);
    setOpen(true);
  };

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) {
      showNotification('กรุณากรอกชื่อแผนก', 'warning');
      return;
    }
    try {
      if (current) {
        const res = await fetch(`/api/admin/departments/${current.DepartmentID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ departmentName: name, isActive: formActive }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'อัปเดตล้มเหลว');
        showNotification('อัปเดตแผนกสำเร็จ', 'success');
      } else {
        const res = await fetch('/api/admin/departments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ departmentName: name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'สร้างล้มเหลว');
        showNotification('สร้างแผนกใหม่สำเร็จ', 'success');
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
      const res = await fetch(`/api/admin/departments/${toDelete.DepartmentID}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'ลบล้มเหลว');
      }
      showNotification(`ลบแผนก "${toDelete.DepartmentName}" สำเร็จ`, 'success');
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
        <h1 className="text-2xl font-bold text-gray-900">จัดการแผนก</h1>
        <button
          type="button"
          onClick={() => handleOpen(null)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          สร้างแผนกใหม่
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ชื่อแผนก</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">สถานะ</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">เครื่องมือ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((d) => (
                <tr key={d.DepartmentID} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600">{d.DepartmentID}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.DepartmentName}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${d.IsActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}
                    >
                      {d.IsActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => handleOpen(d)}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setToDelete(d);
                        setConfirmOpen(true);
                      }}
                      className="text-red-600 hover:underline text-sm"
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && (
            <div className="py-12 text-center text-gray-500">ยังไม่มีข้อมูลแผนก</div>
          )}
        </div>
      )}

      {/* Dialog สร้าง/แก้ไข */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">{current ? 'แก้ไขแผนก' : 'สร้างแผนกใหม่'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อแผนก</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="ชื่อแผนก"
                />
              </div>
              {current && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                  />
                  <span className="text-sm">เปิดใช้งาน</span>
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                บันทึก
              </button>
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
              คุณต้องการลบแผนก &quot;{toDelete.DepartmentName}&quot; จริงหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  setToDelete(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                ยืนยันการลบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
