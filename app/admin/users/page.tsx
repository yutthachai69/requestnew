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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"
            onClick={() => setOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 md:p-8 transform transition-all">
            <h2 className="text-xl font-bold mb-6 text-gray-900">{current ? 'แก้ไขผู้ใช้' : 'สร้างผู้ใช้ใหม่'}</h2>

            {/* ข้อมูลผู้ใช้ */}
            <section className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">ข้อมูลผู้ใช้</h3>
                  <p className="text-xs text-gray-500">กรอกข้อมูลส่วนตัวและข้อมูลเข้าระบบ</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Username <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="username"
                    disabled={!!current}
                  />
                  {current && <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>ไม่สามารถเปลี่ยนชื่อผู้ใช้ได้</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    รหัสผ่าน {current ? <span className="text-gray-400 font-normal">(เว้นว่างถ้าไม่เปลี่ยน)</span> : <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                    placeholder={current ? 'เว้นว่าง = ไม่เปลี่ยน' : 'อย่างน้อย 6 ตัวอักษร'}
                  />
                  {!current && <p className="text-xs text-gray-500 mt-1.5">ต้องมีอย่างน้อย 6 ตัวอักษร</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                    placeholder="ชื่อ-นามสกุล"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">อีเมล</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                    placeholder="email@company.local"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    แผนก
                    {(() => {
                      const sel = roles.find((r) => r.RoleID === formRoleId);
                      if (sel && ['Admin', 'Final Approver'].includes(sel.RoleName)) {
                        return <span className="text-gray-400 font-normal ml-1">(ไม่บังคับสำหรับสิทธิ์นี้)</span>;
                      }
                      return null;
                    })()}
                  </label>
                  <select
                    value={formDepartmentId === '' ? '' : formDepartmentId}
                    onChange={(e) => setFormDepartmentId(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none bg-white appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23131313%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] bg-no-repeat bg-[position:right_1rem_center]"
                  >
                    <option value="">-- เลือกแผนก --</option>
                    {departments.filter((d) => d.IsActive).map((d) => (
                      <option key={d.DepartmentID} value={d.DepartmentID}>
                        {d.DepartmentName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">ตำแหน่ง</label>
                  <input
                    type="text"
                    value={formPosition}
                    onChange={(e) => setFormPosition(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                    placeholder="ระบุตำแหน่งงาน"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">เบอร์โทรศัพท์</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                    placeholder="เบอร์โทรศัพท์"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">บทบาท (Role) <span className="text-red-500">*</span></label>
                  <select
                    value={formRoleId === '' ? '' : formRoleId}
                    onChange={(e) => setFormRoleId(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none bg-white appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23131313%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] bg-no-repeat bg-[position:right_1rem_center]"
                  >
                    <option value="">-- เลือกบทบาท --</option>
                    {roles.map((r) => (
                      <option key={r.RoleID} value={r.RoleID}>
                        {r.RoleName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {current && (
                <div className="mt-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={formActive}
                        onChange={(e) => setFormActive(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none ring-0 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-900">เปิดใช้งานบัญชีนี้</span>
                      <p className="text-xs text-gray-500">หากปิด บัญชีจะไม่สามารถล็อกอินได้</p>
                    </div>
                  </label>
                </div>
              )}
            </section>

            {/* สิทธิ์การเข้าถึงหมวดหมู่ */}
            <section className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">สิทธิ์การเข้าถึงหมวดหมู่</h3>
                  <p className="text-xs text-gray-500">กำหนดหมวดหมู่ที่ผู้ใช้นี้สามารถมองเห็น/สร้างคำร้องได้</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {categories.map((c) => (
                  <label key={c.CategoryID} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${formCategoryIds.includes(c.CategoryID) ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                    <input
                      type="checkbox"
                      checked={formCategoryIds.includes(c.CategoryID)}
                      onChange={(e) => {
                        if (e.target.checked) setFormCategoryIds((prev) => [...prev, c.CategoryID]);
                        else setFormCategoryIds((prev) => prev.filter((id) => id !== c.CategoryID));
                      }}
                      className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                    />
                    <span className={`text-sm ${formCategoryIds.includes(c.CategoryID) ? 'font-medium text-purple-900' : 'text-gray-700'}`}>{c.CategoryName}</span>
                  </label>
                ))}
                {categories.length === 0 && <span className="text-sm text-gray-400 p-3">ไม่มีหมวดหมู่ในระบบ</span>}
              </div>
            </section>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-colors w-full sm:w-auto"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium focus:ring-4 focus:ring-blue-100 flex items-center justify-center gap-2 transition-all shadow-sm w-full sm:w-auto"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                บันทึกข้อมูล
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
