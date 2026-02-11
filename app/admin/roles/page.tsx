'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';

type Role = { RoleID: number; RoleName: string; Description?: string | null; AllowBulkActions: boolean };

function getRoleDescription(roleName: string): string {
  const map: Record<string, string> = {
    Admin: 'ผู้ดูแลระบบสูงสุด',
    User: 'ผู้สร้างคำร้อง',
    Requester: 'ผู้สร้างคำร้อง',
    'Head of Department': 'หัวหน้าแผนก',
    Accountant: 'พนักงานบัญชี',
    'Final Approver': 'ผู้อนุมัติขั้นสุดท้าย',
    'IT Operator': 'ผู้ดำเนินการฝั่ง IT',
    'IT Reviewer': 'ผู้ตรวจรับงาน IT',
    'Close CCS': 'ปิด CCS',
    'Check Oil': 'ตรวจสอบบิลน้ำมัน',
    'Warehouse/Inspector': 'คลังสินค้า (ผู้ตรวจสอบ)',
    Warehouse: 'คลังสินค้า',
    'IT': 'ผู้ดำเนินการ IT',
  };
  return map[roleName] ?? roleName;
}

export default function AdminRolesPage() {
  const [list, setList] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [current, setCurrent] = useState<Role | null>(null);
  const [toDelete, setToDelete] = useState<Role | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAllowBulk, setFormAllowBulk] = useState(false);
  const { showNotification } = useNotification();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/roles');
      if (!res.ok) throw new Error('โหลดข้อมูลไม่ได้');
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      showNotification('โหลดข้อมูลสิทธิ์ล้มเหลว', 'error');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleOpen = (item: Role | null) => {
    setCurrent(item);
    setFormName(item ? item.RoleName : '');
    setFormDescription(item && item.Description != null ? item.Description : '');
    setFormAllowBulk(item ? item.AllowBulkActions : false);
    setOpen(true);
  };

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) {
      showNotification('กรุณากรอกชื่อสิทธิ์', 'warning');
      return;
    }
    try {
      if (current) {
        const res = await fetch(`/api/admin/roles/${current.RoleID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roleName: name, description: formDescription.trim() || null, allowBulkActions: formAllowBulk }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'อัปเดตล้มเหลว');
        showNotification('อัปเดตสิทธิ์สำเร็จ', 'success');
      } else {
        const res = await fetch('/api/admin/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roleName: name, description: formDescription.trim() || null, allowBulkActions: formAllowBulk }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'สร้างล้มเหลว');
        showNotification('สร้างสิทธิ์ใหม่สำเร็จ', 'success');
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
      const res = await fetch(`/api/admin/roles/${toDelete.RoleID}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'ลบล้มเหลว');
      }
      showNotification(`ลบสิทธิ์ "${toDelete.RoleName}" สำเร็จ`, 'success');
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
        <h1 className="text-2xl font-bold text-gray-900">จัดการบทบาท (Roles)</h1>
        <button
          type="button"
          onClick={() => handleOpen(null)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
        >
          <span className="text-lg leading-none">+</span> สร้าง Role ใหม่
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ชื่อ Role (ในระบบ)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">คำอธิบาย (แสดงผล)</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Bulk Actions</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">เครื่องมือ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((r) => (
                <tr key={r.RoleID} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.RoleName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.Description != null && r.Description !== '' ? r.Description : getRoleDescription(r.RoleName)}</td>
                  <td className="px-4 py-3 text-center">
                    {r.AllowBulkActions ? (
                      <span className="inline-flex text-green-600" title="อนุญาต Bulk Actions">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button
                      type="button"
                      onClick={() => handleOpen(r)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="แก้ไข"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setToDelete(r); setConfirmOpen(true); }}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="ลบ"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && (
            <div className="py-12 text-center text-gray-500">ยังไม่มีข้อมูลสิทธิ์</div>
          )}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">{current ? 'แก้ไขสิทธิ์' : 'สร้างสิทธิ์ใหม่'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อสิทธิ์ (ในระบบ)</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="เช่น Head of Department"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">คำอธิบาย (แสดงผล)</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="เช่น หัวหน้าแผนก, ผู้ดูแลระบบสูงสุด"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formAllowBulk}
                  onChange={(e) => setFormAllowBulk(e.target.checked)}
                />
                <span className="text-sm">อนุญาตการดำเนินการแบบกลุ่ม (Bulk Actions)</span>
              </label>
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

      {confirmOpen && toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-2">ยืนยันการลบ</h2>
            <p className="text-gray-600 mb-6">
              คุณต้องการลบสิทธิ์ &quot;{toDelete.RoleName}&quot; จริงหรือไม่? หากมีผู้ใช้ในสิทธิ์นี้จะลบไม่ได้
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
