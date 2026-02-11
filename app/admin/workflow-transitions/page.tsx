'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';

type Status = { id: number; code: string; displayName: string };
type Action = { id: number; actionName: string; displayName: string };
type Role = { RoleID: number; RoleName: string };
type Category = { CategoryID: number; CategoryName: string };
type CorrectionType = { CorrectionTypeID: number; Name: string };

type Transition = {
  id: number;
  categoryId: number;
  categoryName: string;
  correctionTypeId: number | null;
  currentStatusId: number;
  currentStatus: Status;
  actionId: number;
  action: Action;
  requiredRoleId: number;
  requiredRole: { id: number; roleName: string };
  nextStatusId: number;
  nextStatus: Status;
  stepSequence: number;
  filterByDepartment: boolean;
};

export default function AdminWorkflowTransitionsPage() {
  const { showNotification } = useNotification();
  const [categories, setCategories] = useState<Category[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('');
  const [selectedCorrectionTypeId, setSelectedCorrectionTypeId] = useState<number | ''>('');
  const [correctionTypes, setCorrectionTypes] = useState<CorrectionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySource, setCopySource] = useState({ categoryId: '' as number | '', correctionTypeId: '' as number | '' });
  const [copyTarget, setCopyTarget] = useState({ categoryId: '' as number | '', correctionTypeId: '' as number | '' });
  const [copyTargetCorrectionTypes, setCopyTargetCorrectionTypes] = useState<CorrectionType[]>([]);
  const [copySourceCorrectionTypes, setCopySourceCorrectionTypes] = useState<CorrectionType[]>([]);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transition | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Transition | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    currentStatusId: '' as number | '',
    actionId: '' as number | '',
    requiredRoleId: '' as number | '',
    nextStatusId: '' as number | '',
    stepSequence: 1,
    filterByDepartment: false,
  });

  const fetchMaster = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, statusRes, actionRes, roleRes] = await Promise.all([
        fetch('/api/admin/categories'),
        fetch('/api/admin/statuses'),
        fetch('/api/admin/actions'),
        fetch('/api/admin/roles'),
      ]);
      if (catRes.ok) {
        const d = await catRes.json();
        setCategories(Array.isArray(d) ? d : []);
      }
      if (statusRes.ok) {
        const d = await statusRes.json();
        setStatuses(Array.isArray(d) ? d : []);
      }
      if (actionRes.ok) {
        const d = await actionRes.json();
        setActions(Array.isArray(d) ? d : []);
      }
      if (roleRes.ok) {
        const r = await roleRes.json();
        setRoles(Array.isArray(r) ? r : []);
      }
    } catch (e) {
      showNotification('โหลดข้อมูลล้มเหลว', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  const fetchCorrectionTypes = useCallback(async () => {
    if (selectedCategoryId === '' || selectedCategoryId == null) {
      setCorrectionTypes([]);
      return;
    }
    try {
      const res = await fetch(`/api/master/correction-types?categoryId=${selectedCategoryId}`, { credentials: 'same-origin' });
      if (!res.ok) return setCorrectionTypes([]);
      const data = await res.json();
      setCorrectionTypes(Array.isArray(data) ? data.map((ct: { CorrectionTypeID: number; Name: string }) => ({ CorrectionTypeID: ct.CorrectionTypeID, Name: ct.Name })) : []);
    } catch {
      setCorrectionTypes([]);
    }
  }, [selectedCategoryId]);

  const fetchTransitions = useCallback(async () => {
    if (selectedCategoryId === '' || selectedCategoryId == null) {
      setTransitions([]);
      return;
    }
    setListLoading(true);
    try {
      const q = new URLSearchParams({ categoryId: String(selectedCategoryId) });
      if (selectedCorrectionTypeId !== '') q.set('correctionTypeId', String(selectedCorrectionTypeId));
      const res = await fetch(`/api/admin/workflow-transitions?${q}`);
      if (!res.ok) throw new Error('โหลดไม่สำเร็จ');
      const data = await res.json();
      setTransitions(Array.isArray(data) ? data : []);
    } catch (e) {
      showNotification('โหลดขั้นตอนอนุมัติล้มเหลว', 'error');
      setTransitions([]);
    } finally {
      setListLoading(false);
    }
  }, [selectedCategoryId, selectedCorrectionTypeId, showNotification]);

  useEffect(() => {
    fetchMaster();
  }, [fetchMaster]);

  useEffect(() => {
    fetchCorrectionTypes();
  }, [fetchCorrectionTypes]);

  useEffect(() => {
    fetchTransitions();
  }, [fetchTransitions]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      currentStatusId: statuses[0]?.id ?? '',
      actionId: actions[0]?.id ?? '',
      requiredRoleId: roles[0]?.RoleID ?? '',
      nextStatusId: statuses[0]?.id ?? '',
      stepSequence: transitions.length + 1,
      filterByDepartment: false,
    });
    setModalOpen(true);
  };

  const openEdit = (t: Transition) => {
    setEditing(t);
    setForm({
      currentStatusId: t.currentStatusId,
      actionId: t.actionId,
      requiredRoleId: t.requiredRoleId,
      nextStatusId: t.nextStatusId,
      stepSequence: t.stepSequence,
      filterByDepartment: t.filterByDepartment,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (selectedCategoryId === '' || selectedCategoryId == null) return;
    if (form.currentStatusId === '' || form.actionId === '' || form.requiredRoleId === '' || form.nextStatusId === '') {
      showNotification('กรุณากรอกครบทุกช่อง', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        const res = await fetch(`/api/admin/workflow-transitions/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentStatusId: form.currentStatusId,
            actionId: form.actionId,
            requiredRoleId: form.requiredRoleId,
            nextStatusId: form.nextStatusId,
            stepSequence: form.stepSequence,
            filterByDepartment: form.filterByDepartment,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'แก้ไขไม่สำเร็จ');
        showNotification('แก้ไขขั้นตอนแล้ว', 'success');
      } else {
        const res = await fetch('/api/admin/workflow-transitions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryId: selectedCategoryId,
            correctionTypeId: selectedCorrectionTypeId === '' ? null : selectedCorrectionTypeId,
            currentStatusId: form.currentStatusId,
            actionId: form.actionId,
            requiredRoleId: form.requiredRoleId,
            nextStatusId: form.nextStatusId,
            stepSequence: form.stepSequence,
            filterByDepartment: form.filterByDepartment,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'เพิ่มไม่สำเร็จ');
        showNotification('เพิ่มขั้นตอนแล้ว', 'success');
      }
      setModalOpen(false);
      fetchTransitions();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (t: Transition) => {
    try {
      const res = await fetch(`/api/admin/workflow-transitions/${t.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'ลบไม่สำเร็จ');
      showNotification('ลบขั้นตอนแล้ว', 'success');
      setConfirmDelete(null);
      fetchTransitions();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'ลบไม่สำเร็จ', 'error');
    }
  };

  const selectedCategoryName = categories.find((c) => c.CategoryID === Number(selectedCategoryId))?.CategoryName ?? '';
  const selectedCorrectionTypeName =
    selectedCorrectionTypeId === '' ? 'ทั่วไป' : correctionTypes.find((ct) => ct.CorrectionTypeID === selectedCorrectionTypeId)?.Name ?? '';

  const handleCopyWorkflow = async () => {
    if (copySource.categoryId === '' || copyTarget.categoryId === '') {
      showNotification('กรุณาเลือกหมวดหมู่ต้นทางและปลายทาง', 'warning');
      return;
    }
    if (copySource.categoryId === copyTarget.categoryId && copySource.correctionTypeId === copyTarget.correctionTypeId) {
      showNotification('ต้นทางและปลายทางต้องต่างกัน', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/workflow-transitions/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceCategoryId: copySource.categoryId,
          sourceCorrectionTypeId: copySource.correctionTypeId === '' ? null : copySource.correctionTypeId,
          targetCategoryId: copyTarget.categoryId,
          targetCorrectionTypeId: copyTarget.correctionTypeId === '' ? null : copyTarget.correctionTypeId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'คัดลอกไม่สำเร็จ');
      showNotification(data.message ?? 'คัดลอก Workflow สำเร็จ', 'success');
      setCopyOpen(false);
      if (copyTarget.categoryId === selectedCategoryId && copyTarget.correctionTypeId === selectedCorrectionTypeId) fetchTransitions();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'คัดลอกไม่สำเร็จ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (selectedCategoryId === '' || selectedCategoryId == null) return;
    setSubmitting(true);
    try {
      const q = new URLSearchParams({ categoryId: String(selectedCategoryId) });
      if (selectedCorrectionTypeId !== '') q.set('correctionTypeId', String(selectedCorrectionTypeId));
      const res = await fetch(`/api/admin/workflow-transitions?${q}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'ลบไม่สำเร็จ');
      showNotification(data.message ?? 'ลบ Workflow แล้ว', 'success');
      setConfirmDeleteAll(false);
      fetchTransitions();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'ลบไม่สำเร็จ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ตั้งค่า Workflow ขั้นตอนอนุมัติ</h1>
          <p className="text-sm text-gray-500 mt-1">
            กำหนดขั้นตอนอนุมัติต่อหมวดหมู่ — สถานะปัจจุบัน → Action + Role → สถานะถัดไป (ใช้จริงในการอนุมัติคำร้อง)
          </p>
        </div>
        <Link href="/admin" className="text-blue-600 hover:underline text-sm">
          ← กลับไป Admin
        </Link>
      </div>

      <details className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-900">
        <summary className="cursor-pointer font-medium">ความช่วยเหลือ — ทำความเข้าใจรายการสถานะ</summary>
        <ul className="mt-3 space-y-2 list-disc list-inside">
          <li><strong>ลำดับการทำงานหลัก</strong> (ที่ seed ใช้): รอหัวหน้าแผนก (PENDING) → รอนำส่งบัญชีตรวจสอบ (WAITING_ACCOUNT_1) → รอผู้อนุมัติสูงสุด (WAITING_FINAL_APP) → รอ IT ดำเนินการ (IT_WORKING) → รอตรวจสอบหลังแก้ไข (WAITING_ACCOUNT_2) → รอ IT ปิดงาน (WAITING_IT_CLOSE) → ปิดงานเรียบร้อย (CLOSED). มีทางออก ถูกปฏิเสธ (REJECTED) ได้หลายจุด</li>
          <li><strong>ชื่อซ้ำใน dropdown:</strong> ถ้าเห็น &quot;รอ IT ปิดงาน&quot; สองอัน ให้ดูรหัสในวงเล็บ — ระบบใช้ <code>WAITING_IT_CLOSE</code> สำหรับขั้นรอ IT ปิดงาน (อีกอันคือ PENDING_IT_CLOSE ถ้ามี เป็นคนละสถานะใน DB)</li>
          <li><strong>สถานะอื่นในรายการ</strong> (เช่น PENDING_HOD, PENDING_ACCOUNT, PENDING_FINAL) อาจเป็นข้อมูลเก่าหรือเพิ่มจากเมนู &quot;จัดการสถานะ&quot; — จะมีผลกับคำร้องก็ต่อเมื่อมีขั้นตอนใน WorkflowTransition ที่อ้างถึงสถานะนั้น</li>
          <li>แต่ละตัวใน dropdown แสดงเป็น <strong>ชื่อ (รหัส)</strong> — ใช้รหัสเป็นหลักเวลาเลือก เพื่อไม่สับสนเมื่อชื่อเหมือนกัน</li>
        </ul>
      </details>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <label className="font-medium text-gray-700">หมวดหมู่:</label>
        <select
          value={selectedCategoryId === '' ? '' : selectedCategoryId}
          onChange={(e) => {
            setSelectedCategoryId(e.target.value === '' ? '' : Number(e.target.value));
            setSelectedCorrectionTypeId('');
          }}
          className="border border-gray-300 rounded-lg px-3 py-2 min-w-[220px]"
        >
          <option value="">-- เลือกหมวดหมู่ --</option>
          {categories.map((c) => (
            <option key={c.CategoryID} value={c.CategoryID}>
              {c.CategoryName}
            </option>
          ))}
        </select>
        {selectedCategoryId !== '' && (
          <>
            <label className="font-medium text-gray-700">ประเภทการแก้ไข:</label>
            <select
              value={selectedCorrectionTypeId === '' ? '' : selectedCorrectionTypeId}
              onChange={(e) => setSelectedCorrectionTypeId(e.target.value === '' ? '' : Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 min-w-[180px]"
            >
              <option value="">ทั่วไป (ไม่ระบุประเภท)</option>
              {correctionTypes.map((ct) => (
                <option key={ct.CorrectionTypeID} value={ct.CorrectionTypeID}>
                  {ct.Name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={openAdd}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              เพิ่มขั้นตอน
            </button>
            <button
              type="button"
              onClick={() => {
                setCopySource({ categoryId: selectedCategoryId, correctionTypeId: selectedCorrectionTypeId });
                setCopyTarget({ categoryId: '', correctionTypeId: '' });
                setCopySourceCorrectionTypes(correctionTypes);
                setCopyTargetCorrectionTypes([]);
                setCopyOpen(true);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              คัดลอก Workflow
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteAll(true)}
              disabled={transitions.length === 0}
              className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 text-sm font-medium disabled:opacity-50"
            >
              ลบ Workflow นี้
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : selectedCategoryId === '' ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-500">
          เลือกหมวดหมู่ด้านบนเพื่อดูและกำหนดขั้นตอนอนุมัติ (Transitions)
        </div>
      ) : listLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-gray-700">
            ขั้นตอนอนุมัติ: {selectedCategoryName}
            {selectedCorrectionTypeName !== 'ทั่วไป' && ` (${selectedCorrectionTypeName})`}
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ลำดับ</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">สถานะปัจจุบัน</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">สถานะถัดไป</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">จำกัดแผนก</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">เครื่องมือ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transitions
                .sort((a, b) => a.stepSequence - b.stepSequence || a.id - b.id)
                .map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{t.stepSequence}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{t.currentStatus.displayName}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{t.action.displayName}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{t.requiredRole.roleName}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{t.nextStatus.displayName}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${t.filterByDepartment ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                        {t.filterByDepartment ? 'ใช่' : 'ไม่'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button type="button" onClick={() => openEdit(t)} className="text-blue-600 hover:underline text-sm">
                        แก้ไข
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(t)} className="text-red-600 hover:underline text-sm">
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {transitions.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              ยังไม่มีขั้นตอนอนุมัติในหมวดหมู่นี้ กด &quot;เพิ่มขั้นตอน&quot; เพื่อกำหนด (หรือรัน <code className="bg-gray-100 px-1 rounded">npm run db:seed</code> เพื่อใส่ค่าตั้งต้น)
            </div>
          )}
        </div>
      )}

      {/* Modal เพิ่ม/แก้ไข */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">{editing ? 'แก้ไขขั้นตอน' : 'เพิ่มขั้นตอน'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">สถานะปัจจุบัน</label>
                <select
                  value={form.currentStatusId === '' ? '' : form.currentStatusId}
                  onChange={(e) => setForm((f) => ({ ...f, currentStatusId: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                <select
                  value={form.actionId === '' ? '' : form.actionId}
                  onChange={(e) => setForm((f) => ({ ...f, actionId: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  {actions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role ผู้อนุมัติ</label>
                <select
                  value={form.requiredRoleId === '' ? '' : form.requiredRoleId}
                  onChange={(e) => setForm((f) => ({ ...f, requiredRoleId: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  {roles.map((r) => (
                    <option key={r.RoleID} value={r.RoleID}>
                      {r.RoleName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">สถานะถัดไป</label>
                <select
                  value={form.nextStatusId === '' ? '' : form.nextStatusId}
                  onChange={(e) => setForm((f) => ({ ...f, nextStatusId: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ลำดับ (stepSequence)</label>
                <input
                  type="number"
                  min={0}
                  value={form.stepSequence}
                  onChange={(e) => setForm((f) => ({ ...f, stepSequence: Number(e.target.value) || 0 }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.filterByDepartment}
                  onChange={(e) => setForm((f) => ({ ...f, filterByDepartment: e.target.checked }))}
                />
                <span className="text-sm">จำกัดผู้อนุมัติในแผนกเดียวกับผู้ยื่น (filterByDepartment)</span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                ยกเลิก
              </button>
              <button type="button" onClick={handleSubmit} disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {submitting ? 'กำลังบันทึก...' : editing ? 'บันทึกการแก้ไข' : 'เพิ่ม'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ยืนยันลบ */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <p className="text-gray-700 mb-4">
              ลบขั้นตอน &quot;{confirmDelete.currentStatus.displayName} → {confirmDelete.action.displayName} ({confirmDelete.requiredRole.roleName}) → {confirmDelete.nextStatus.displayName}&quot; ใช่หรือไม่?
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                ยกเลิก
              </button>
              <button type="button" onClick={() => handleDelete(confirmDelete)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                ลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* คัดลอก Workflow */}
      {copyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">คัดลอก Workflow</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ต้นทาง — หมวดหมู่</label>
                <select
                  value={copySource.categoryId === '' ? '' : copySource.categoryId}
                  onChange={(e) => {
                    const v = e.target.value === '' ? '' : Number(e.target.value);
                    setCopySource((s) => ({ ...s, categoryId: v, correctionTypeId: '' }));
                    if (v !== '') {
                      fetch(`/api/master/correction-types?categoryId=${v}`, { credentials: 'same-origin' })
                        .then((r) => r.ok ? r.json() : [])
                        .then((d) => setCopySourceCorrectionTypes(Array.isArray(d) ? d.map((ct: { CorrectionTypeID: number; Name: string }) => ({ CorrectionTypeID: ct.CorrectionTypeID, Name: ct.Name })) : []))
                        .catch(() => setCopySourceCorrectionTypes([]));
                    } else setCopySourceCorrectionTypes([]);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">-- เลือกหมวดหมู่ --</option>
                  {categories.map((c) => (
                    <option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ต้นทาง — ประเภทการแก้ไข</label>
                <select
                  value={copySource.correctionTypeId === '' ? '' : copySource.correctionTypeId}
                  onChange={(e) => setCopySource((s) => ({ ...s, correctionTypeId: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">ทั่วไป</option>
                  {copySourceCorrectionTypes.map((ct) => (
                    <option key={ct.CorrectionTypeID} value={ct.CorrectionTypeID}>{ct.Name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ปลายทาง — หมวดหมู่</label>
                <select
                  value={copyTarget.categoryId === '' ? '' : copyTarget.categoryId}
                  onChange={(e) => {
                    const v = e.target.value === '' ? '' : Number(e.target.value);
                    setCopyTarget((s) => ({ ...s, categoryId: v, correctionTypeId: '' }));
                    if (v !== '') {
                      fetch(`/api/master/correction-types?categoryId=${v}`, { credentials: 'same-origin' })
                        .then((r) => r.ok ? r.json() : [])
                        .then((d) => setCopyTargetCorrectionTypes(Array.isArray(d) ? d.map((ct: { CorrectionTypeID: number; Name: string }) => ({ CorrectionTypeID: ct.CorrectionTypeID, Name: ct.Name })) : []))
                        .catch(() => setCopyTargetCorrectionTypes([]));
                    } else setCopyTargetCorrectionTypes([]);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">-- เลือกหมวดหมู่ --</option>
                  {categories.map((c) => (
                    <option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ปลายทาง — ประเภทการแก้ไข</label>
                <select
                  value={copyTarget.correctionTypeId === '' ? '' : copyTarget.correctionTypeId}
                  onChange={(e) => setCopyTarget((s) => ({ ...s, correctionTypeId: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">ทั่วไป</option>
                  {copyTargetCorrectionTypes.map((ct) => (
                    <option key={ct.CorrectionTypeID} value={ct.CorrectionTypeID}>{ct.Name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setCopyOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                ยกเลิก
              </button>
              <button type="button" onClick={handleCopyWorkflow} disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {submitting ? 'กำลังคัดลอก...' : 'คัดลอก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ยืนยันลบ Workflow ทั้งหมด */}
      {confirmDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <p className="text-gray-700 mb-4">
              ลบ Workflow ทั้งหมดของ &quot;{selectedCategoryName}
              {selectedCorrectionTypeName !== 'ทั่วไป' ? ` (${selectedCorrectionTypeName})` : ''}&quot; ใช่หรือไม่? ({transitions.length} รายการ)
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDeleteAll(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                ยกเลิก
              </button>
              <button type="button" onClick={handleDeleteAll} disabled={submitting} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {submitting ? 'กำลังลบ...' : 'ลบทั้งหมด'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
