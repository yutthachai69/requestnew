'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useNotification } from '@/app/context/NotificationContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';

type RequestDetail = {
  id: number;
  workOrderNo: string | null;
  problemDetail: string;
  status: string;
  requesterId: number;
  attachmentPath: string | null;
};

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function RequestEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { showNotification } = useNotification();
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [problemDetail, setProblemDetail] = useState('');
  const [existingFiles, setExistingFiles] = useState<string[]>([]);
  const [filesToDelete, setFilesToDelete] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('ไม่พบ ID');
      return;
    }
    fetch(`/api/requests/${id}`, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'ไม่พบคำร้อง' : 'โหลดไม่ได้');
        return res.json();
      })
      .then((data) => {
        setRequest(data.request);
        setProblemDetail(data.request?.problemDetail ?? '');
        // Parse existing attachments
        if (data.request?.attachmentPath) {
          try {
            const paths = JSON.parse(data.request.attachmentPath);
            setExistingFiles(Array.isArray(paths) ? paths : [paths]);
          } catch {
            setExistingFiles([data.request.attachmentPath]);
          }
        }
      })
      .catch((e) => {
        setError(e.message ?? 'โหลดไม่ได้');
        setRequest(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles: File[] = [];

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        showNotification(`ไฟล์ ${file.name} ไม่รองรับ (รองรับ: PNG, JPG, PDF)`, 'warning');
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        showNotification(`ไฟล์ ${file.name} มีขนาดใหญ่เกิน 10MB`, 'warning');
        continue;
      }
      validFiles.push(file);
    }

    setNewFiles((prev) => [...prev, ...validFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeNewFile = (index: number) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingFile = (filePath: string) => {
    setExistingFiles((prev) => prev.filter((f) => f !== filePath));
    setFilesToDelete((prev) => [...prev, filePath]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request || request.status !== 'PENDING') {
      showNotification('แก้ไขได้เฉพาะคำร้องที่รอดำเนินการ', 'warning');
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('problemDetail', problemDetail.trim());
      formData.append('existingFiles', JSON.stringify(existingFiles));
      formData.append('filesToDelete', JSON.stringify(filesToDelete));

      for (const file of newFiles) {
        formData.append('attachments', file);
      }

      const res = await fetch(`/api/requests/${id}`, {
        method: 'PUT',
        credentials: 'same-origin',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'บันทึกไม่สำเร็จ');
      showNotification(data.message ?? 'อัปเดตคำร้องสำเร็จ', 'success');
      router.push(`/request/${id}`);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getFileIcon = (filePath: string) => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      return (
        <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM8.5 13a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm2 3.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5h.5a1.5 1.5 0 0 1 0 3H8v.5z" />
        </svg>
      );
    }
    return (
      <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  };

  const getFileName = (filePath: string) => {
    return filePath.split('/').pop() || filePath;
  };

  if (loading) {
    return (
      <div className="w-full p-6 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !request) {
    return (
      <div className="w-full p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">{error ?? 'ไม่พบคำร้อง'}</div>
        <Link href="/dashboard" className="mt-4 inline-block text-blue-600 hover:underline">← กลับไป Dashboard</Link>
      </div>
    );
  }
  if (request.status !== 'PENDING') {
    return (
      <div className="w-full p-6">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4">
          คำร้องนี้ดำเนินการไปแล้ว ไม่สามารถแก้ไขได้
        </div>
        <Link href={`/request/${id}`} className="mt-4 inline-block text-blue-600 hover:underline">← ดูรายละเอียด</Link>
      </div>
    );
  }

  return (
    <div className="w-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">แก้ไขคำร้อง #{request.workOrderNo ?? id}</h1>
        <Link href={`/request/${id}`} className="text-blue-600 hover:underline text-sm">← กลับไปรายละเอียด</Link>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm space-y-6">
        {/* Problem Detail */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียดปัญหา / ความต้องการ</label>
          <textarea
            value={problemDetail}
            onChange={(e) => setProblemDetail(e.target.value)}
            rows={6}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            placeholder="ระบุรายละเอียด..."
          />
        </div>

        {/* Existing Files */}
        {existingFiles.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ไฟล์แนบเดิม</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {existingFiles.map((filePath, index) => (
                <div key={index} className="relative group border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="flex flex-col items-center gap-2">
                    {getFileIcon(filePath)}
                    <span className="text-xs text-gray-600 truncate max-w-full" title={getFileName(filePath)}>
                      {getFileName(filePath)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExistingFile(filePath)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-sm hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="ลบไฟล์"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New Files */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">อัพโหลดไฟล์แนบ (PNG, JPG, PDF - ไม่เกิน 10MB)</label>

          {/* File Input */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <svg className="w-10 h-10 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-600">คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่</p>
            <p className="text-xs text-gray-400 mt-1">รองรับ: PNG, JPG, PDF</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.pdf"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* New Files Preview */}
          {newFiles.length > 0 && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {newFiles.map((file, index) => (
                <div key={index} className="relative group border border-blue-200 rounded-lg p-3 bg-blue-50">
                  <div className="flex flex-col items-center gap-2">
                    {file.type === 'application/pdf' ? (
                      <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                      </svg>
                    ) : (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-12 h-12 object-cover rounded"
                      />
                    )}
                    <span className="text-xs text-gray-600 truncate max-w-full" title={file.name}>
                      {file.name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeNewFile(index)}
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

        {/* Submit Buttons */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
          </button>
          <Link
            href={`/request/${id}`}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}
