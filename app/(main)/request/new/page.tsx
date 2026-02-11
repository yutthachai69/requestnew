'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { submitF07 } from '@/app/actions/f07-action';
import { requesterRoles } from '@/lib/auth-constants';

type CategoryItem = { CategoryID: number; CategoryName: string; locations?: { id: number; name: string }[] };
type CorrectionTypeItem = {
  CorrectionTypeID: number;
  Name: string;
  DisplayOrder: number;
  TemplateString: string | null;
  FieldsConfig: string | null;
};
type FieldConfig = { label: string; type: 'text' | 'textarea'; required: boolean };
type UserMe = { fullName: string; phoneNumber: string; departmentId: number | null; departmentName: string | null };

function parseFieldsConfig(json: string | null | undefined): FieldConfig[] {
  if (!json || typeof json !== 'string') return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map((f: unknown) => ({
      label: typeof (f as { label?: string }).label === 'string' ? (f as { label: string }).label : '',
      type: ((f as { type?: string }).type === 'textarea' ? 'textarea' : 'text') as 'text' | 'textarea',
      required: Boolean((f as { required?: boolean }).required),
    }));
  } catch {
    return [];
  }
}

/** Build one type's detail line from template and val1, val2, ... */
function buildOneTypeDetail(
  typeConfig: CorrectionTypeItem,
  fieldValues: Record<string, string>
): string {
  const template = typeConfig.TemplateString;
  const fields = parseFieldsConfig(typeConfig.FieldsConfig);
  if (!template) {
    const parts = fields
      .map((f, i) => fieldValues[`val${i + 1}`] ?? '')
      .filter(Boolean);
    return parts.length ? `${typeConfig.Name}: ${parts.join(', ')}` : typeConfig.Name;
  }
  let out = template;
  fields.forEach((_, i) => {
    const val = fieldValues[`val${i + 1}`] ?? '';
    out = out.replace(new RegExp(`\\{val${i + 1}\\}`, 'gi'), val);
  });
  return out;
}

/** Build full problemDetail: reason + all selected types' details (like old NewRequestPage) */
function buildProblemDetail(
  reason: string,
  selectedTypeIds: number[],
  correctionTypes: CorrectionTypeItem[],
  dynamicFieldValues: Record<number, Record<string, string>>
): string {
  const reasonPart = reason.trim();
  const detailsArray = selectedTypeIds
    .map((typeId) => {
      const typeConfig = correctionTypes.find((t) => t.CorrectionTypeID === typeId);
      if (!typeConfig) return '';
      const fieldValues = dynamicFieldValues[typeId] ?? {};
      return buildOneTypeDetail(typeConfig, fieldValues);
    })
    .filter(Boolean);
  if (!detailsArray.length) return reasonPart;
  return [reasonPart, ...detailsArray].join('\n\n');
}

const STEPS = [
  { title: 'ข้อมูลทั่วไป', num: 1 },
  { title: 'รายละเอียดและไฟล์แนบ', num: 2 },
  { title: 'ตรวจสอบและส่ง', num: 3 },
];

export default function NewRequestPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const defaultCategoryId = searchParams.get('category') ?? '';

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (sessionStatus === 'unauthenticated') {
      router.replace('/login?callbackUrl=/request/new');
      return;
    }
    const roleName = (session?.user as { roleName?: string })?.roleName;
    if (sessionStatus === 'authenticated' && roleName != null && !requesterRoles.includes(roleName)) {
      router.replace('/dashboard');
    }
  }, [sessionStatus, session?.user, router]);

  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [userMe, setUserMe] = useState<UserMe | null>(null);
  const [correctionTypes, setCorrectionTypes] = useState<CorrectionTypeItem[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);

  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [systemType, setSystemType] = useState('ERP SoftPRO');
  const [systemTypeOther, setSystemTypeOther] = useState('');
  const [selectedTypeIds, setSelectedTypeIds] = useState<number[]>([]);
  const [activeDetailTab, setActiveDetailTab] = useState(0);
  const [dynamicFieldValues, setDynamicFieldValues] = useState<Record<number, Record<string, string>>>({});
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [requestDepartmentId, setRequestDepartmentId] = useState<number | ''>('');
  const [departments, setDepartments] = useState<{ DepartmentID: number; DepartmentName: string }[]>([]);

  const currentCategory = categories.find((c) => String(c.CategoryID) === categoryId);
  const locations = currentCategory?.locations ?? [];
  const selectedTypeForTab = selectedTypeIds[activeDetailTab] != null
    ? correctionTypes.find((t) => t.CorrectionTypeID === selectedTypeIds[activeDetailTab])
    : null;
  const fieldConfigs = selectedTypeForTab ? parseFieldsConfig(selectedTypeForTab.FieldsConfig) : [];

  useEffect(() => {
    fetch('/api/master/categories', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: CategoryItem[]) => setCategories(Array.isArray(list) ? list : []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    fetch('/api/me', { credentials: 'same-origin' })
      .then(async (r) => {
        if (r.ok) return r.json();
        if (r.status === 401) (await import('next-auth/react')).signOut({ callbackUrl: '/login' });
        return null;
      })
      .then(setUserMe)
      .catch(() => setUserMe(null));
  }, []);

  useEffect(() => {
    if (userMe?.departmentId != null) return;
    fetch('/api/master/departments', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id?: number; name?: string; DepartmentID?: number; DepartmentName?: string }[]) => {
        const items = Array.isArray(list)
          ? list.map((d) => ({ DepartmentID: d.DepartmentID ?? d.id ?? 0, DepartmentName: d.DepartmentName ?? d.name ?? '' }))
          : [];
        setDepartments(items.filter((d) => d.DepartmentID));
        setRequestDepartmentId((prev) => (prev !== '' ? prev : (items[0]?.DepartmentID ?? '')));
      })
      .catch(() => setDepartments([]));
  }, [userMe?.departmentId]);

  useEffect(() => {
    if (!categoryId) {
      setCorrectionTypes([]);
      setLocationId('');
      return;
    }
    setLoadingTypes(true);
    fetch(`/api/master/correction-types?categoryId=${categoryId}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: CorrectionTypeItem[]) => {
        setCorrectionTypes(Array.isArray(list) ? list : []);
        setSelectedTypeIds([]);
        setActiveDetailTab(0);
        setDynamicFieldValues({});
      })
      .catch(() => setCorrectionTypes([]))
      .finally(() => setLoadingTypes(false));
  }, [categoryId]);

  useEffect(() => {
    if (!categoryId) setLocationId('');
    else if (locations.length && !locations.some((l) => String(l.id) === locationId)) setLocationId(String(locations[0].id));
  }, [categoryId, locations, locationId]);

  const handleTypeChange = (typeId: number, checked: boolean) => {
    if (checked) {
      setSelectedTypeIds((prev) => [...prev, typeId]);
      setDynamicFieldValues((prev) => ({ ...prev, [typeId]: {} }));
    } else {
      setSelectedTypeIds((prev) => prev.filter((id) => id !== typeId));
      setDynamicFieldValues((prev) => {
        const next = { ...prev };
        delete next[typeId];
        return next;
      });
      setActiveDetailTab((prev) => Math.min(prev, Math.max(0, selectedTypeIds.length - 2)));
    }
  };

  const handleDynamicFieldChange = (typeId: number, fieldIndex: number, value: string) => {
    setDynamicFieldValues((prev) => ({
      ...prev,
      [typeId]: { ...(prev[typeId] ?? {}), [`val${fieldIndex + 1}`]: value },
    }));
  };

  const canNext1 =
    categoryId &&
    locationId &&
    reason.trim() &&
    systemType &&
    (systemType !== 'อื่นๆ' || systemTypeOther.trim()) &&
    (userMe?.departmentId != null || (requestDepartmentId !== '' && Number(requestDepartmentId) >= 1));
  const canNext2 = selectedTypeIds.length >= 1 && (() => {
    for (const typeId of selectedTypeIds) {
      const typeConfig = correctionTypes.find((t) => t.CorrectionTypeID === typeId);
      if (!typeConfig) continue;
      const fields = parseFieldsConfig(typeConfig.FieldsConfig);
      const values = dynamicFieldValues[typeId] ?? {};
      for (let i = 0; i < fields.length; i++) {
        if (fields[i].required && !String(values[`val${i + 1}`] ?? '').trim()) return false;
      }
    }
    return true;
  })();
  const problemDetailBuilt =
    step >= 3 && selectedTypeIds.length >= 1
      ? buildProblemDetail(reason, selectedTypeIds, correctionTypes, dynamicFieldValues)
      : '';

  const handleSubmit = useCallback(async () => {
    if (!userMe) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const formData = new FormData();
      formData.set('thaiName', userMe.fullName);
      formData.set('phone', userMe.phoneNumber || '');
      const deptId = userMe.departmentId ?? (requestDepartmentId !== '' ? requestDepartmentId : null);
      if (deptId == null || deptId < 1) {
        setSubmitError('กรุณาเลือกแผนกที่ยื่นคำร้อง (ผู้ใช้ไม่มีแผนกในระบบ)');
        setSubmitting(false);
        return;
      }
      formData.set('departmentId', String(deptId));
      formData.set('locationId', locationId);
      formData.set('categoryId', categoryId);
      formData.set('problemDetail', problemDetailBuilt || reason);
      formData.set('systemType', systemType === 'อื่นๆ' ? systemTypeOther : systemType);
      if (systemType === 'อื่นๆ') formData.set('systemTypeOther', systemTypeOther);
      formData.set('isMoneyRelated', 'false');
      formData.set('correctionTypeIds', JSON.stringify(selectedTypeIds));
      for (const file of selectedFiles) formData.append('attachments', file);
      const result = await submitF07(formData);
      if (result && typeof result === 'object' && 'error' in result) {
        setSubmitError((result as { error: string }).error);
        setSubmitting(false);
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
      setSubmitting(false);
    }
  }, [userMe, locationId, categoryId, reason, systemType, systemTypeOther, problemDetailBuilt, selectedTypeIds, selectedFiles, requestDepartmentId]);

  if (!userMe && categories.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-gray-500">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-sm border border-gray-100">
      <h1 className="text-xl font-bold text-gray-900 mb-1">สร้างคำร้องใหม่</h1>
      <p className="text-sm text-gray-500 mb-6">กรอกข้อมูลตามขั้นตอนเพื่อส่งคำร้องขอแก้ไขข้อมูล</p>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s) => (
          <div key={s.num} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${step > s.num ? 'bg-blue-600 text-white' : step === s.num ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}
            >
              {step > s.num ? '✓' : s.num}
            </div>
            <span className={`text-sm ${step >= s.num ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{s.title}</span>
            {s.num < 3 && <span className="text-gray-300 mx-1">/</span>}
          </div>
        ))}
      </div>

      {/* Step 1: ข้อมูลทั่วไป */}
      {step === 1 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">1. ข้อมูลทั่วไป</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่ *</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- เลือกหมวดหมู่ --</option>
              {categories.map((c) => (
                <option key={c.CategoryID} value={c.CategoryID}>
                  {c.CategoryName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">สถานที่/ศูนย์ขนถ่าย *</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              required
              disabled={!locations.length}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
            >
              <option value="">-- เลือกสถานที่ --</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          {userMe?.departmentId == null && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">แผนกที่ยื่นคำร้อง *</label>
              <p className="text-xs text-gray-500 mb-1">(ผู้ใช้ไม่มีแผนกในระบบ — กรุณาเลือกแผนกสำหรับคำร้องนี้)</p>
              <select
                value={requestDepartmentId === '' ? '' : requestDepartmentId}
                onChange={(e) => setRequestDepartmentId(e.target.value === '' ? '' : Number(e.target.value))}
                required
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- เลือกแผนก --</option>
                {departments.map((d) => (
                  <option key={d.DepartmentID} value={d.DepartmentID}>
                    {d.DepartmentName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เหตุผลการแก้ไข *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              placeholder="กรุณากรอกเหตุผลในการแก้ไขให้ชัดเจน"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ระบบที่ขอแก้ไข *</label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" name="systemType" checked={systemType === 'ERP SoftPRO'} onChange={() => setSystemType('ERP SoftPRO')} className="rounded-full" />
                <span>ERP SoftPRO</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="systemType" checked={systemType === 'อื่นๆ'} onChange={() => setSystemType('อื่นๆ')} className="rounded-full" />
                <span>อื่นๆ</span>
              </label>
            </div>
            {systemType === 'อื่นๆ' && (
              <input
                type="text"
                value={systemTypeOther}
                onChange={(e) => setSystemTypeOther(e.target.value)}
                placeholder="ระบุระบบ"
                className="mt-2 w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canNext1}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}

      {/* Step 2: รายละเอียดและไฟล์แนบ (หลายประเภท + แท็บ) */}
      {step === 2 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">2. ระบุรายละเอียดการแก้ไข</h2>
          <p className="text-sm text-gray-500">เลือกประเภททางซ้าย และกรอกข้อมูลทางขวา</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 border border-gray-200 rounded-lg p-4 max-h-80 overflow-y-auto bg-gray-50">
              {loadingTypes ? (
                <p className="text-sm text-gray-500">กำลังโหลดประเภทการแก้ไข...</p>
              ) : correctionTypes.length === 0 ? (
                <p className="text-sm text-gray-500">ไม่มีประเภทการแก้ไขในหมวดนี้</p>
              ) : (
                <div className="space-y-2">
                  {correctionTypes.map((ct) => (
                    <label key={ct.CorrectionTypeID} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={selectedTypeIds.includes(ct.CorrectionTypeID)}
                        onChange={(e) => handleTypeChange(ct.CorrectionTypeID, e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm font-medium text-gray-800">{ct.Name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="md:col-span-2 border border-gray-200 rounded-lg p-4 min-h-[200px] bg-white">
              {selectedTypeIds.length === 0 ? (
                <p className="text-sm text-gray-500">กรุณาเลือกประเภทการแก้ไขอย่างน้อย 1 รายการ</p>
              ) : (
                <>
                  <div className="flex border-b border-gray-200 gap-1 mb-4 overflow-x-auto">
                    {selectedTypeIds.map((id, index) => {
                      const type = correctionTypes.find((t) => t.CorrectionTypeID === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setActiveDetailTab(index)}
                          className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${activeDetailTab === index
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                          {type?.Name ?? '...'}
                        </button>
                      );
                    })}
                  </div>
                  {selectedTypeIds.map((typeId, index) => {
                    const type = correctionTypes.find((t) => t.CorrectionTypeID === typeId);
                    const fields = type ? parseFieldsConfig(type.FieldsConfig) : [];
                    const values = dynamicFieldValues[typeId] ?? {};
                    if (index !== activeDetailTab) return null;
                    return (
                      <div key={typeId} className="space-y-4">
                        {fields.map((fc, fIndex) => (
                          <div key={fIndex}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {fc.label} {fc.required && '*'}
                            </label>
                            {fc.type === 'textarea' ? (
                              <textarea
                                value={values[`val${fIndex + 1}`] ?? ''}
                                onChange={(e) => handleDynamicFieldChange(typeId, fIndex, e.target.value)}
                                required={fc.required}
                                rows={3}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              />
                            ) : (
                              <input
                                type="text"
                                value={values[`val${fIndex + 1}`] ?? ''}
                                onChange={(e) => handleDynamicFieldChange(typeId, fIndex, e.target.value)}
                                required={fc.required}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">แนบไฟล์ (PNG, JPG, PDF - ไม่เกิน 10MB ต่อไฟล์)</label>
            <div
              onClick={() => {
                const input = document.getElementById('file-input-new') as HTMLInputElement;
                if (input) input.click();
              }}
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <svg className="w-10 h-10 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-600">คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่</p>
              <p className="text-xs text-gray-400 mt-1">รองรับ: PNG, JPG, PDF</p>
            </div>
            <input
              id="file-input-new"
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                const validFiles: File[] = [];
                for (const file of files) {
                  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
                  if (!allowedTypes.includes(file.type)) {
                    alert(`ไฟล์ ${file.name} ไม่รองรับ (รองรับ: PNG, JPG, PDF)`);
                    continue;
                  }
                  if (file.size > 10 * 1024 * 1024) {
                    alert(`ไฟล์ ${file.name} มีขนาดใหญ่เกิน 10MB`);
                    continue;
                  }
                  validFiles.push(file);
                }
                setSelectedFiles((prev) => [...prev, ...validFiles]);
                e.target.value = ''; // Reset input
              }}
              className="hidden"
            />
            {selectedFiles.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {selectedFiles.map((f, index) => (
                  <div key={`${f.name}-${index}`} className="relative group border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="flex flex-col items-center gap-2">
                      {f.type === 'application/pdf' ? (
                        <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                        </svg>
                      ) : (
                        <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      )}
                      <span className="text-xs text-gray-600 truncate max-w-full" title={f.name}>
                        {f.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {(f.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== index))}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-sm hover:bg-red-600"
                      title="ลบไฟล์"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-6 py-2.5 text-gray-600 font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!canNext2}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}

      {/* Step 3: ตรวจสอบและส่ง */}
      {step === 3 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">3. ตรวจสอบข้อมูลทั้งหมด</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-lg border border-gray-200 p-4 bg-gray-50/50">
              <h3 className="font-medium text-gray-900 mb-2">1. ข้อมูลทั่วไป</h3>
              <dl className="space-y-1 text-sm">
                <div><dt className="text-gray-500">หมวดหมู่</dt><dd className="font-medium">{currentCategory?.CategoryName ?? '—'}</dd></div>
                <div><dt className="text-gray-500">สถานที่/ศูนย์ขนถ่าย</dt><dd className="font-medium">{locations.find((l) => String(l.id) === locationId)?.name ?? '—'}</dd></div>
                <div><dt className="text-gray-500">เหตุผล</dt><dd className="font-medium whitespace-pre-wrap">{reason || '—'}</dd></div>
                <div><dt className="text-gray-500">ระบบ</dt><dd className="font-medium">{systemType === 'อื่นๆ' ? systemTypeOther : systemType}</dd></div>
              </dl>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 bg-gray-50/50">
              <h3 className="font-medium text-gray-900 mb-2">2. รายละเอียดการแก้ไข</h3>
              {selectedTypeIds.length > 0 ? (
                <div className="space-y-4">
                  {selectedTypeIds.map((typeId) => {
                    const type = correctionTypes.find((t) => t.CorrectionTypeID === typeId);
                    const fields = type ? parseFieldsConfig(type.FieldsConfig) : [];
                    const values = dynamicFieldValues[typeId] ?? {};
                    return (
                      <div key={typeId} className="border-b border-gray-100 pb-2 last:border-0">
                        <div className="font-medium text-gray-800 mb-1">{type?.Name ?? '—'}</div>
                        <dl className="space-y-1 text-sm pl-2">
                          {fields.map((fc, i) => (
                            <div key={i}>
                              <dt className="text-gray-500">{fc.label}</dt>
                              <dd className="font-medium">{String(values[`val${i + 1}`] ?? '').trim() || '—'}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500">—</p>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 p-4 bg-gray-50/50 md:col-span-2">
              <h3 className="font-medium text-gray-900 mb-2">3. ไฟล์แนบ</h3>
              {selectedFiles.length > 0 ? (
                <ul className="text-sm text-gray-700 list-disc list-inside">
                  {selectedFiles.map((f) => (
                    <li key={f.name}>{f.name}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">ไม่มีไฟล์แนบ</p>
              )}
            </div>
          </div>
          {submitError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {submitError}
            </div>
          )}
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-6 py-2.5 text-gray-600 font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !problemDetailBuilt.trim()}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
            >
              {submitting ? 'กำลังส่ง...' : 'ส่งคำร้อง'}
              {!submitting && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
