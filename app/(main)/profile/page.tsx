'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { ProfileSkeleton, Skeleton } from '@/app/components/Skeleton';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<{ requestsCreated: number; actionsTaken: number } | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [originalSignatureUrl, setOriginalSignatureUrl] = useState<string | null>(null);
  const [isSavingSignature, setIsSavingSignature] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const user = session?.user as {
    id?: string;
    name?: string | null;
    email?: string | null;
    roleName?: string;
    department?: string;
    position?: string;
  } | undefined;

  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/auth/my-stats', { credentials: 'same-origin' })
      .then((res) => res.ok ? res.json() : { requestsCreated: 0, actionsTaken: 0 })
      .then((data) => setStats(data))
      .catch(() => setStats({ requestsCreated: 0, actionsTaken: 0 }))
      .finally(() => setLoadingStats(false));

    // Fetch existing signature
    fetch('/api/me') // Assuming we have or can create a generic /api/me to fetch user details, or we just rely on session.
      .then(res => res.json())
      .then(data => {
        if (data?.user?.signatureUrl) {
          setSignatureUrl(data.user.signatureUrl);
          setOriginalSignatureUrl(data.user.signatureUrl);
        }
      })
      .catch(() => { });
  }, [session]);

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น');
      return;
    }

    // Limit to 2MB
    if (file.size > 2 * 1024 * 1024) {
      toast.error('ขนาดไฟล์ต้องไม่เกิน 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result as string;
      setSignatureUrl(base64String);
    };
    reader.readAsDataURL(file);
  };

  const saveSignature = async () => {
    if (!signatureUrl) {
      toast.error('กรุณาเลือกรูปลายเซ็นก่อนบันทึก');
      return;
    }

    setIsSavingSignature(true);
    try {
      const res = await fetch('/api/me/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureData: signatureUrl }),
      });

      if (!res.ok) throw new Error('Failed to save');
      setOriginalSignatureUrl(signatureUrl);
      toast.success('บันทึกลายเซ็นเรียบร้อยแล้ว');
    } catch {
      toast.error('เกิดข้อผิดพลาดในการบันทึกลายเซ็น');
    } finally {
      setIsSavingSignature(false);
    }
  };

  const clearSignature = () => {
    setDeleteModalOpen(true);
  };

  const confirmClearSignature = async () => {
    setIsSavingSignature(true);
    try {
      const res = await fetch('/api/me/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureData: null }),
      });

      if (!res.ok) throw new Error('Failed to clear');
      setSignatureUrl(null);
      setOriginalSignatureUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setDeleteModalOpen(false);
      toast.success('ลบลายเซ็นเรียบร้อยแล้ว');
    } catch {
      toast.error('เกิดข้อผิดพลาดในการลบลายเซ็น');
    } finally {
      setIsSavingSignature(false);
    }
  };

  if (status === 'loading') {
    return <ProfileSkeleton />;
  }

  if (!session?.user) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center">
        <p className="text-gray-500">กรุณาเข้าสู่ระบบ</p>
      </div>
    );
  }

  // Get initials for avatar
  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
      {/* Header Card with Avatar */}
      <div className="relative bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 rounded-2xl p-8 text-white overflow-hidden shadow-lg">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="white" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative flex items-center gap-6">
          {/* Avatar */}
          <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl font-bold border-4 border-white/30 shadow-xl">
            {getInitials(user?.name)}
          </div>

          {/* User Info */}
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-1">{user?.name || 'ผู้ใช้งาน'}</h1>
            <p className="text-blue-100 text-lg">{user?.position || 'ไม่ระบุตำแหน่ง'}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                {user?.department || 'ไม่ระบุแผนก'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {user?.roleName || 'User'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Requests Created */}
        <div className="group bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
              <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">คำร้องที่สร้าง</p>
              {loadingStats ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-3xl font-bold text-gray-900">{stats?.requestsCreated ?? 0}</p>
              )}
            </div>
          </div>
        </div>

        {/* Actions Taken */}
        <div className="group bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center group-hover:bg-green-100 transition-colors">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">ดำเนินการแล้ว</p>
              {loadingStats ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-3xl font-bold text-gray-900">{stats?.actionsTaken ?? 0}</p>
              )}
            </div>
          </div>
        </div>

        {/* Status Card */}
        <div className="group bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
              <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">สถานะบัญชี</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                <p className="text-lg font-bold text-gray-900">Active</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contact Info */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            ข้อมูลติดต่อ
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-gray-600">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="truncate">{user?.email || 'ไม่ระบุอีเมล'}</span>
            </div>
          </div>
        </div>

        {/* Signature Upload */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm flex flex-col">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            ลายเซ็นอิเล็กทรอนิกส์
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            รูปลายเซ็นของคุณจะถูกนำไปวางในช่อง 'ผู้ขอ' หรือ 'ผู้อนุมัติ' อัตโนมัติเมื่อสั่งพิมพ์เอกสาร แนะนำให้ใช้ไฟล์พื้นหลังโปร่งใส (PNG)
          </p>

          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-4 bg-gray-50 relative min-h-[120px]">
            {signatureUrl ? (
              <div className="relative w-full flex flex-col items-center">
                {/* Visual constraints box to simulate the F07 form box */}
                <div className="w-full max-w-[200px] h-[60px] flex items-center justify-center border border-blue-100 bg-white rounded-md p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={signatureUrl} alt="Signature Preview" className="max-w-full max-h-full object-contain" />
                </div>

                <div className="flex gap-2 mt-4">
                  {signatureUrl !== originalSignatureUrl ? (
                    <>
                      <button
                        onClick={saveSignature}
                        disabled={isSavingSignature}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {isSavingSignature ? 'กำลังบันทึก...' : 'บันทึกลายเซ็น'}
                      </button>
                      <button
                        onClick={() => {
                          setSignatureUrl(originalSignatureUrl);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        disabled={isSavingSignature}
                        className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
                      >
                        ยกเลิก
                      </button>
                    </>
                  ) : (
                    <>
                      <label
                        htmlFor="signature-upload-change"
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        เปลี่ยนรูปอัปโหลด
                        <input id="signature-upload-change" name="signature-upload-change" type="file" className="sr-only" accept="image/*" onChange={handleSignatureUpload} ref={fileInputRef} />
                      </label>
                      <button
                        onClick={clearSignature}
                        disabled={isSavingSignature}
                        className="px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        ลบ
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <svg className="mx-auto h-10 w-10 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="mt-2 flex text-sm text-gray-600 justify-center">
                  <label htmlFor="signature-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 px-2 py-1 shadow-sm border border-gray-200">
                    <span>อัปโหลดรูปภาพ</span>
                    <input id="signature-upload" name="signature-upload" type="file" className="sr-only" accept="image/*" onChange={handleSignatureUpload} ref={fileInputRef} />
                  </label>
                </div>
                <p className="mt-1 text-xs text-gray-500">PNG, JPG ไม่เกิน 2MB</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"
            onClick={() => !isSavingSignature && setDeleteModalOpen(false)}
          />

          {/* Modal Content */}
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 transform transition-all">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>

            <h3 className="text-lg font-bold text-center text-gray-900 mb-2">
              ยืนยันการลบลายเซ็น
            </h3>
            <p className="text-sm text-center text-gray-500 mb-6">
              คุณแน่ใจหรือไม่ที่จะลบรูปภาพลายเซ็นนี้? การกระทำนี้ไม่สามารถย้อนกลับได้
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                className="w-full flex-1 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 transition-all"
                onClick={() => setDeleteModalOpen(false)}
                disabled={isSavingSignature}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="w-full flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 focus:ring-2 focus:ring-red-500 disabled:opacity-50 flex items-center justify-center transition-all shadow-sm"
                onClick={confirmClearSignature}
                disabled={isSavingSignature}
              >
                {isSavingSignature ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  'ลบลายเซ็น'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

