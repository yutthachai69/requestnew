'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';

type User = {
  UserID: number;
  Username: string;
  FullName: string;
  Email: string;
  Position: string | null;
  PhoneNumber: string | null;
  IsActive: boolean;
  RoleID: number;
  RoleName: string;
  DepartmentID: number | null;
  DepartmentName: string | null;
  CategoryIDs?: number[];
};

type Role = { RoleID: number; RoleName: string; AllowBulkActions: boolean };
type Department = { DepartmentID: number; DepartmentName: string; IsActive: boolean };
type Category = { CategoryID: number; CategoryName: string };

export default function AdminUsersPage() {
  const [list, setList] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [current, setCurrent] = useState<User | null>(null);
  const [toDelete, setToDelete] = useState<User | null>(null);
  const [toReset, setToReset] = useState<User | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRoleId, setFormRoleId] = useState<number | ''>('');
  const [formDepartmentId, setFormDepartmentId] = useState<number | ''>('');
  const [formPosition, setFormPosition] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formCategoryIds, setFormCategoryIds] = useState<number[]>([]);
  const [resetPassword, setResetPassword] = useState('');
  const { showNotification } = useNotification();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, deptRes, catRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/roles'),
        fetch('/api/admin/departments'),
        fetch('/api/admin/categories'),
      ]);
      if (!usersRes.ok) throw new Error('โหลดผู้ใช้ไม่ได้');
      if (rolesRes.ok) {
        const r = await rolesRes.json();
        setRoles(Array.isArray(r) ? r : []);
      }
      if (deptRes.ok) {
        const d = await deptRes.json();
        setDepartments(Array.isArray(d) ? d : []);
      }
      if (catRes.ok) {
        const c = await catRes.json();
        setCategories(Array.isArray(c) ? c : []);
      }
      const data = await usersRes.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      showNotification('โหลดข้อมูลผู้ใช้ล้มเหลว', 'error');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleOpen = (item: User | null) => {
    setCurrent(item);
    setFormUsername(item ? item.Username : '');
    setFormPassword('');
    setFormFullName(item ? item.FullName : '');
    setFormEmail(item ? item.Email : '');
    setFormRoleId(item ? item.RoleID : '');
    setFormDepartmentId(item && item.DepartmentID != null ? item.DepartmentID : '');
    setFormPosition(item && item.Position ? item.Position : '');
    setFormPhone(item && item.PhoneNumber ? item.PhoneNumber : '');
    setFormActive(item ? item.IsActive : true);
    setFormCategoryIds(item && item.CategoryIDs ? item.CategoryIDs : []);
    setOpen(true);
  };

  const handleSave = async () => {
    const fullName = formFullName.trim();
    const email = formEmail.trim();
    const roleId = formRoleId === '' ? undefined : Number(formRoleId);
    const departmentId = formDepartmentId === '' ? undefined : Number(formDepartmentId);
    if (!fullName) {
      showNotification('กรุณากรอกชื่อ-นามสกุล', 'warning');
      return;
    }
    if (!email) {
      showNotification('กรุณากรอกอีเมล', 'warning');
      return;
    }
    if (roleId == null || roleId < 1) {
      showNotification('กรุณาเลือกสิทธิ์', 'warning');
      return;
    }
    const selectedRole = roles.find((r) => r.RoleID === roleId);
    const noDeptRoles = ['Admin', 'Final Approver'];
    const isNoDeptRole = selectedRole && noDeptRoles.includes(selectedRole.RoleName);
    if (!isNoDeptRole && (departmentId == null || departmentId < 1)) {
      showNotification('กรุณาเลือกแผนก', 'warning');
      return;
    }
    if (!current) {
      const username = formUsername.trim();
      if (!username) {
        showNotification('กรุณากรอกชื่อผู้ใช้', 'warning');
        return;
      }
      if (!formPassword || formPassword.length < 6) {
        showNotification('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'warning');
        return;
      }
    }
    try {
      if (current) {
        const body: Record<string, unknown> = {
          fullName,
          email,
          roleId,
          departmentId: departmentId != null && departmentId >= 1 ? departmentId : null,
          position: formPosition.trim() || null,
          phoneNumber: formPhone.trim() || null,
          isActive: formActive,
        };
        if (formPassword) body.password = formPassword;
        body.categoryIds = formCategoryIds;
        const res = await fetch(`/api/admin/users/${current.UserID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'อัปเดตล้มเหลว');
        showNotification('อัปเดตผู้ใช้สำเร็จ', 'success');
      } else {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: formUsername.trim(),
            password: formPassword,
            fullName,
            email,
            roleId,
            departmentId: departmentId != null && departmentId >= 1 ? departmentId : null,
            position: formPosition.trim() || null,
            phoneNumber: formPhone.trim() || null,
            isActive: formActive,
            categoryIds: formCategoryIds,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'สร้างล้มเหลว');
        showNotification('สร้างผู้ใช้ใหม่สำเร็จ', 'success');
      }
      setOpen(false);
      fetchList();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด', 'error');
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      const res = await fetch(`/api/admin/users/${user.UserID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user.IsActive }),
      });
      if (!res.ok) throw new Error('อัปเดตสถานะล้มเหลว');
      showNotification(`เปลี่ยนสถานะผู้ใช้ "${user.Username}" เรียบร้อย`, 'success');
      fetchList();
    } catch (e) {
      showNotification('เกิดข้อผิดพลาดในการเปลี่ยนสถานะ', 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!toDelete) return;
    try {
      const res = await fetch(`/api/admin/users/${toDelete.UserID}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'ลบล้มเหลว');
      }
      showNotification(`ลบผู้ใช้ "${toDelete.Username}" สำเร็จ`, 'success');
      setConfirmOpen(false);
      setToDelete(null);
      fetchList();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'ลบล้มเหลว', 'error');
    }
  };

  const handleResetSubmit = async () => {
    if (!toReset) return;
    const pwd = resetPassword.trim();
    if (!pwd || pwd.length < 6) {
      showNotification('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร', 'warning');
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${toReset.UserID}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: pwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'รีเซ็ตล้มเหลว');
      showNotification('รีเซ็ตรหัสผ่านสำเร็จ', 'success');
      setResetOpen(false);
      setToReset(null);
      setResetPassword('');
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'รีเซ็ตล้มเหลว', 'error');
    }
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">จัดการผู้ใช้งาน</h1>
        <button
          type="button"
          onClick={() => handleOpen(null)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          สร้างผู้ใช้ใหม่
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="md" text="กำลังโหลดผู้ใช้" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ชื่อผู้ใช้</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ชื่อ-นามสกุล</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">อีเมล</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">สิทธิ์</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">แผนก</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">สถานะ</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">เครื่องมือ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((u) => (
                <tr key={u.UserID} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600">{u.UserID}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.Username}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{u.FullName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{u.Email}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{u.RoleName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{u.DepartmentName ?? '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${u.IsActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}
                    >
                      {u.IsActive ? 'เปิด' : 'ปิด'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => handleOpen(u)}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(u)}
                      className={`${u.IsActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'} text-sm font-bold`}
                    >
                      {u.IsActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setToReset(u);
                        setResetPassword('');
                        setResetOpen(true);
                      }}
                      className="text-amber-600 hover:underline text-sm"
                    >
                      รีเซ็ตรหัสผ่าน
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setToDelete(u);
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
            <div className="py-12 text-center text-gray-500">ยังไม่มีข้อมูลผู้ใช้</div>
          )}
        </div>
      )}

      {/* Dialog สร้าง/แก้ไข */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 my-auto">
            <h2 className="text-lg font-bold mb-6">{current ? 'แก้ไขผู้ใช้' : 'สร้างผู้ใช้ใหม่'}</h2>

            {/* ข้อมูลผู้ใช้ */}
            <section className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-gray-600">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </span>
                <h3 className="font-semibold text-gray-900">ข้อมูลผู้ใช้</h3>
              </div>
              <p className="text-sm text-gray-500 mb-4">กรอกข้อมูลส่วนตัวและข้อมูลเข้าระบบ</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="username"
                    disabled={!!current}
                  />
                  {current && <p className="text-xs text-gray-500 mt-0.5">ไม่สามารถเปลี่ยนชื่อผู้ใช้ได้</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    รหัสผ่าน {current ? '(เว้นว่างถ้าไม่เปลี่ยน)' : <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder={current ? 'เว้นว่าง = ไม่เปลี่ยน' : 'อย่างน้อย 6 ตัวอักษร'}
                  />
                  {!current && <p className="text-xs text-gray-500 mt-0.5">ต้องมีอย่างน้อย 6 ตัวอักษร</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="ชื่อ-นามสกุล"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="email@company.local"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    แผนก
                    {(() => {
                      const sel = roles.find((r) => r.RoleID === formRoleId);
                      if (sel && ['Admin', 'Final Approver'].includes(sel.RoleName)) {
                        return <span className="text-gray-500 font-normal ml-1">(ไม่บังคับสำหรับ Admin / ผู้อนุมัติขั้นสุดท้าย)</span>;
                      }
                      return null;
                    })()}
                  </label>
                  <select
                    value={formDepartmentId === '' ? '' : formDepartmentId}
                    onChange={(e) => setFormDepartmentId(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  >
                    <option value="">-- เลือก --</option>
                    {departments.filter((d) => d.IsActive).map((d) => (
                      <option key={d.DepartmentID} value={d.DepartmentID}>
                        {d.DepartmentName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ตำแหน่ง</label>
                  <input
                    type="text"
                    value={formPosition}
                    onChange={(e) => setFormPosition(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="ตำแหน่ง"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="เบอร์โทรศัพท์"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">บทบาท (Role) <span className="text-red-500">*</span></label>
                  <select
                    value={formRoleId === '' ? '' : formRoleId}
                    onChange={(e) => setFormRoleId(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  >
                    <option value="">-- เลือก --</option>
                    {roles.map((r) => (
                      <option key={r.RoleID} value={r.RoleID}>
                        {r.RoleName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {current && (
                <label className="flex items-center gap-2 mt-4">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                  />
                  <span className="text-sm">เปิดใช้งาน</span>
                </label>
              )}
            </section>

            {/* สิทธิ์การเข้าถึงหมวดหมู่ */}
            <section className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-gray-600">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                </span>
                <h3 className="font-semibold text-gray-900">สิทธิ์การเข้าถึงหมวดหมู่</h3>
              </div>
              <p className="text-sm text-gray-500 mb-3">กำหนดว่าผู้ใช้นี้จะสามารถสร้าง/เห็นคำร้องในหมวดหมู่ใดได้บ้าง</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50/50">
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
            </section>

            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
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
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                บันทึกผู้ใช้
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
              คุณต้องการลบผู้ใช้ &quot;{toDelete.Username}&quot; ({toDelete.FullName}) จริงหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้
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

      {/* Dialog รีเซ็ตรหัสผ่าน */}
      {resetOpen && toReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-2">รีเซ็ตรหัสผ่าน</h2>
            <p className="text-gray-600 mb-2">ผู้ใช้: {toReset.Username} ({toReset.FullName})</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่านใหม่</label>
              <input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="อย่างน้อย 6 ตัวอักษร"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setResetOpen(false);
                  setToReset(null);
                  setResetPassword('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleResetSubmit}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
              >
                รีเซ็ตรหัสผ่าน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
