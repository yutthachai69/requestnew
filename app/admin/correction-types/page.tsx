'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';

type FieldConfig = { label: string; type: 'text' | 'textarea'; required: boolean };

type CorrectionType = {
  CorrectionTypeID: number;
  Name: string;
  DisplayOrder: number;
  IsActive: boolean;
  TemplateString?: string | null;
  FieldsConfig?: string | null;
  CategoryIDs: number[];
  CategoryNames: string[];
};

type Category = { CategoryID: number; CategoryName: string };

const PER_PAGE = 10;

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

export default function AdminCorrectionTypesPage() {
  const [list, setList] = useState<CorrectionType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [current, setCurrent] = useState<CorrectionType | null>(null);
  const [toDelete, setToDelete] = useState<CorrectionType | null>(null);
  const [formName, setFormName] = useState('');
  const [formDisplayOrder, setFormDisplayOrder] = useState(10);
  const [formActive, setFormActive] = useState(true);
  const [formCategoryIds, setFormCategoryIds] = useState<number[]>([]);
  const [formTemplateString, setFormTemplateString] = useState('');
  const [formFieldsConfig, setFormFieldsConfig] = useState<FieldConfig[]>([]);
  const { showNotification } = useNotification();

  const fetchList = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/correction-types?page=${p}&perPage=${PER_PAGE}`);
      if (!res.ok) throw new Error('โหลดข้อมูลไม่ได้');
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
      const totalHeader = res.headers.get('X-Total-Count');
      setTotal(totalHeader ? parseInt(totalHeader, 10) : 0);
    } catch (e) {
      showNotification('โหลดประเภทการแก้ไขล้มเหลว', 'error');
      setList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, showNotification]);

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
    fetchList(page);
  }, [fetchList, page]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleOpen = (item: CorrectionType | null) => {
    setCurrent(item);
    setFormName(item ? item.Name : '');
    setFormDisplayOrder(item ? item.DisplayOrder : 10);
    setFormActive(item ? item.IsActive : true);
    setFormCategoryIds(item && item.CategoryIDs ? item.CategoryIDs : []);
    setFormTemplateString(item && item.TemplateString ? item.TemplateString : '');
    setFormFieldsConfig(item && item.FieldsConfig ? parseFieldsConfig(item.FieldsConfig) : []);
    setOpen(true);
  };

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) {
      showNotification('กรุณากรอกชื่อประเภท', 'warning');
      return;
    }
    const payload = {
      name,
      displayOrder: formDisplayOrder,
      isActive: formActive,
      categoryIds: formCategoryIds,
      templateString: formTemplateString.trim() || null,
      fieldsConfig: formFieldsConfig.length ? JSON.stringify(formFieldsConfig) : null,
    };
    try {
      if (current) {
        const res = await fetch(`/api/admin/correction-types/${current.CorrectionTypeID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'อัปเดตล้มเหลว');
        showNotification('อัปเดตประเภทการแก้ไขสำเร็จ', 'success');
      } else {
        const res = await fetch('/api/admin/correction-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'สร้างล้มเหลว');
        showNotification('สร้างประเภทการแก้ไขสำเร็จ', 'success');
      }
      setOpen(false);
      fetchList(page);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด', 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!toDelete) return;
    try {
      const res = await fetch(`/api/admin/correction-types/${toDelete.CorrectionTypeID}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'ลบล้มเหลว');
      }
      showNotification(`ลบ "${toDelete.Name}" สำเร็จ`, 'success');
      setConfirmOpen(false);
      setToDelete(null);
      fetchList(page);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'ลบล้มเหลว', 'error');
    }
  };

  const handleFieldChange = (index: number, field: keyof FieldConfig, value: string | boolean) => {
    const next = [...formFieldsConfig];
    if (!next[index]) return;
    (next[index] as Record<string, unknown>)[field] = value;
    setFormFieldsConfig(next);
  };

  const addField = () => {
    setFormFieldsConfig((prev) => [...prev, { label: '', type: 'text', required: false }]);
  };

  const removeField = (index: number) => {
    setFormFieldsConfig((prev) => prev.filter((_, i) => i !== index));
  };

  /** สร้าง template ต้นแบบจากชื่อประเภท + label ของช่อง (แล้วแก้ไขได้) */
  const generateTemplateFromFields = () => {
    const name = formName.trim() || 'ประเภทการแก้ไข';
    if (formFieldsConfig.length === 0) {
      setFormTemplateString(name);
      return;
    }
    const parts = formFieldsConfig.map((f, i) => {
      const label = (f.label || '').trim() || `ช่องที่ ${i + 1}`;
      return `${label} {val${i + 1}}`;
    });
    setFormTemplateString(`${name} ${parts.join(' ')}`);
  };

  /** เติม placeholder {val1} {val2} ... ต่อท้ายตามจำนวนช่อง */
  const appendPlaceholders = () => {
    if (formFieldsConfig.length === 0) {
      setFormTemplateString((prev) => prev + ' {val1}');
      return;
    }
    const placeholders = formFieldsConfig.map((_, i) => `{val${i + 1}}`).join(' ');
    setFormTemplateString((prev) => (prev ? `${prev} ${placeholders}` : placeholders));
  };

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const selectedCategoryNames = formCategoryIds
    .map((id) => categories.find((c) => c.CategoryID === id)?.CategoryName)
    .filter(Boolean) as string[];

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">จัดการประเภทการแก้ไข</h1>
        <button
          type="button"
          onClick={() => handleOpen(null)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          สร้างประเภทใหม่
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ชื่อ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ใช้งานในหมวดหมู่</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ลำดับความสำคัญ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">สถานะ</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">เครื่องมือ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {list.map((ct) => (
                  <tr key={ct.CorrectionTypeID} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{ct.Name}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {ct.CategoryNames?.length
                          ? ct.CategoryNames.map((catName) => (
                            <span key={catName} className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                              {catName}
                            </span>
                          ))
                          : <span className="text-sm text-gray-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{ct.DisplayOrder}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${ct.IsActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {ct.IsActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => handleOpen(ct)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="แก้ไข">
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button type="button" onClick={() => { setToDelete(ct); setConfirmOpen(true); }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" title="ลบ">
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length === 0 && <div className="py-12 text-center text-gray-500">ยังไม่มีประเภทการแก้ไข</div>}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-4">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">&lt;</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button key={p} type="button" onClick={() => setPage(p)} className={`px-3 py-1.5 rounded-lg text-sm ${p === page ? 'bg-blue-600 text-white' : 'border border-gray-300 hover:bg-gray-50'}`}>{p}</button>
              ))}
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">&gt;</button>
            </div>
          )}
        </>
      )}

      {/* Modal สร้าง/แก้ไข — ตรงกับแบบ (ชื่อ, หมวดหมู่ chips, ลำดับ, Switch, ตั้งค่าฟอร์มไดนามิก, Template) */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 my-auto max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{current ? 'แก้ไขประเภทการแก้ไข' : 'สร้างประเภทใหม่'}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อประเภท <span className="text-red-500">*</span></label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="เช่น แก้ไขบิลน้ำมัน" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ใช้งานในหมวดหมู่</label>
                <div className="min-h-[42px] border border-gray-300 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2 bg-white">
                  {selectedCategoryNames.length > 0 ? (
                    selectedCategoryNames.map((name) => (
                      <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 text-sm">
                        {name}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400 text-sm">เลือกหมวดหมู่ด้านล่าง</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 pl-0">
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ลำดับความสำคัญ (Priority)</label>
                <input
                  type="number"
                  min={0}
                  value={formDisplayOrder}
                  onChange={(e) => setFormDisplayOrder(parseInt(e.target.value, 10) || 0)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-0.5">ยิ่งเลขน้อย ยิ่งสำคัญมาก (เช่น 1 สำคัญกว่า 99)</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={formActive}
                  onClick={() => setFormActive((v) => !v)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${formActive ? 'bg-blue-600' : 'bg-gray-200'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${formActive ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm text-gray-700">{formActive ? 'สถานะ: เปิดใช้งาน' : 'สถานะ: ปิดใช้งาน'}</span>
              </div>

              <div className="border-t border-gray-200 pt-4 mt-4">
                <p className="text-sm font-medium text-gray-700 mb-3">ตั้งค่าฟอร์มแบบไดนามิก</p>

                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">ช่องกรอกข้อมูล</p>
                  <div className="space-y-3">
                    {formFieldsConfig.map((field, index) => (
                      <div key={index} className="flex flex-wrap items-center gap-2 p-2 border border-gray-200 rounded-lg bg-gray-50/50">
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => handleFieldChange(index, 'label', e.target.value)}
                          placeholder={`Label ช่องที่ ${index + 1}`}
                          className="flex-1 min-w-[120px] border border-gray-300 rounded px-2 py-1.5 text-sm"
                        />
                        <select
                          value={field.type}
                          onChange={(e) => handleFieldChange(index, 'type', e.target.value as 'text' | 'textarea')}
                          className="border border-gray-300 rounded px-2 py-1.5 text-sm min-w-[130px]"
                        >
                          <option value="text">Text Field</option>
                          <option value="textarea">Text Area</option>
                        </select>
                        <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                          <input type="checkbox" checked={field.required} onChange={(e) => handleFieldChange(index, 'required', e.target.checked)} className="rounded border-gray-300" />
                          บังคับกรอก
                        </label>
                        <button type="button" onClick={() => removeField(index)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="ลบช่องข้อมูล">
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addField} className="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    เพิ่มช่องข้อมูล
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-sm font-medium text-gray-700">Template ข้อความ</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={generateTemplateFromFields}
                        className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
                      >
                        สร้าง template ต้นแบบ
                      </button>
                      <button
                        type="button"
                        onClick={appendPlaceholders}
                        className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700"
                      >
                        เติม placeholder
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={formTemplateString}
                    onChange={(e) => setFormTemplateString(e.target.value)}
                    rows={4}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="เช่น แก้ไขบิลน้ำมันเลขที่ {val1} จาก {val2} เป็น {val3}"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">ใช้ {'{val1}'}, {'{val2}'}, ... แทนค่าจากช่องข้อมูลด้านบนตามลำดับ</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-gray-100">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">ยกเลิก</button>
              <button type="button" onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-2">ยืนยันการลบ</h2>
            <p className="text-gray-600 mb-6">คุณต้องการลบประเภทการแก้ไข &quot;{toDelete.Name}&quot; จริงหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้</p>
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
