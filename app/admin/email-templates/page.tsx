'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import Link from 'next/link';

type TemplateItem = {
  id: number;
  templateName: string;
  description: string | null;
  subject: string;
  body: string;
  placeholders: string;
};

export default function AdminEmailTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<TemplateItem | null>(null);
  const [formSubject, setFormSubject] = useState('');
  const [formBody, setFormBody] = useState('');
  const [saving, setSaving] = useState(false);
  const { showNotification } = useNotification();

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/email-templates', { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string })?.error ?? 'โหลดรายการ Template ไม่ได้';
        throw new Error(msg);
      }
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'โหลดข้อมูลล้มเหลว', 'error');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const openEdit = (item: TemplateItem) => {
    setCurrentItem(item);
    setFormSubject(item.subject);
    setFormBody(item.body);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrentItem(null);
  };

  const handleSave = async () => {
    if (!currentItem) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/email-templates/${currentItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ subject: formSubject, body: formBody }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'บันทึกไม่สำเร็จ');
      showNotification('บันทึก Template สำเร็จ', 'success');
      closeModal();
      loadTemplates();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'บันทึกล้มเหลว', 'error');
    } finally {
      setSaving(false);
    }
  };

  const placeholdersList = (s: string) =>
    s
      ? s
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
      : [];

  return (
    <div className="w-full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">จัดการ Email Templates</h1>
          <p className="text-sm text-gray-500 mt-1">
            แก้ไขหัวข้อและเนื้อหาอีเมลที่ระบบส่งอัตโนมัติได้ที่นี่ (รองรับ HTML)
          </p>
        </div>
        <Link href="/admin" className="text-blue-600 hover:underline text-sm">
          ← กลับไป Admin
        </Link>
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  ชื่อ Template (ในระบบ)
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  คำอธิบาย
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  หัวข้ออีเมล
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  เครื่องมือ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 font-mono">
                    {t.templateName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.description ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate" title={t.subject}>
                    {t.subject}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="แก้ไข"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {templates.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              ยังไม่มีเทมเพลต — รัน <code className="bg-gray-100 px-1 rounded">npm run db:seed</code>{' '}
              เพื่อสร้างเทมเพลตเริ่มต้น
            </div>
          )}
        </div>
      )}

      {/* Modal แก้ไข */}
      {modalOpen && currentItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <h2 className="text-lg font-bold p-6 pb-0">
              แก้ไข Template: {currentItem.templateName}
            </h2>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  หัวข้ออีเมล (Subject)
                </label>
                <input
                  type="text"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เนื้อหาอีเมล (Body)
                </label>
                <textarea
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  rows={14}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm"
                  placeholder="HTML ได้"
                />
                <p className="text-xs text-gray-500 mt-1">คุณสามารถใช้โค้ด HTML ในส่วนนี้ได้</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">ตัวแปรที่ใช้ได้ (Placeholders):</p>
                <div className="flex flex-wrap gap-2">
                  {placeholdersList(currentItem.placeholders).map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
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
