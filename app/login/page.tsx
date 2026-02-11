'use client';

import { signIn, useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { allowedDashboardRoles } from '@/lib/auth-constants';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const [errors, setErrors] = useState({
    username: '',
    password: '',
    auth: ''
  });

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) return;
    const role = (session.user as { roleName?: string }).roleName;
    const allowed = role ? allowedDashboardRoles.includes(role) : true;
    if (allowed) {
      window.location.replace(callbackUrl);
    }
  }, [status, session, callbackUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors = { username: '', password: '', auth: '' };
    let hasError = false;

    if (!username) {
      newErrors.username = 'กรุณากรอกชื่อผู้ใช้';
      hasError = true;
    }
    if (!password) {
      newErrors.password = 'กรุณากรอกรหัสผ่าน';
      hasError = true;
    }

    if (hasError) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setErrors({ username: '', password: '', auth: '' });

    const res = await signIn('credentials', {
      username,
      password,
      remember: remember ? 'true' : 'false',
      redirect: false,
      callbackUrl,
    });

    setLoading(false);

    if (res?.error) {
      setErrors(prev => ({ ...prev, auth: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }));
      return;
    }

    if (res?.ok || (res as { url?: string })?.url) {
      const target = (res as { url?: string })?.url ?? callbackUrl;
      window.location.replace(target);
      return;
    }

    setErrors(prev => ({ ...prev, auth: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }));
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      {/* Left Panel - Blue Side */}
      <div className="relative hidden w-0 flex-1 flex-col justify-between bg-blue-600 lg:flex px-12 py-12 text-white overflow-hidden">
        <div className="relative z-10 flex flex-col justify-center h-full items-center">
          <div className="mb-8">
            <div className="h-40 w-40 bg-white rounded-full flex items-center justify-center mb-6 shadow-xl mx-auto overflow-hidden">
              <video
                autoPlay
                loop
                muted
                playsInline
                className="w-32 h-32 object-contain"
              >
                <source src="/rfp.mp4" type="video/mp4" />
              </video>
            </div>
            <h1 className="text-5xl font-bold tracking-wider text-center uppercase">Request Online</h1>
          </div>
        </div>

        <div className="relative z-10 flex justify-between text-xs font-light opacity-60 w-full">
          <span>v1.0.0</span>
        </div>

        {/* Decoration SVG */}
        <div className="absolute top-0 right-0 bottom-0 w-32 h-full pointer-events-none translate-x-[2px]">
          <svg className="h-full w-full text-white" preserveAspectRatio="none" viewBox="0 0 100 800" fill="currentColor">
            <path d="M0,0 C20,100 60,150 40,200 C20,250 50,300 40,350 C30,400 70,450 30,500 C-10,550 40,600 20,650 C0,700 30,750 0,800 L100,800 L100,0 Z" />
          </svg>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24 bg-white relative z-20 w-full lg:w-1/2">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div className="text-center lg:text-left mb-12">
            <h2 className="text-4xl font-extrabold tracking-tight text-gray-900">เข้าสู่ระบบ</h2>
            <p className="mt-3 text-base text-gray-500">ยินดีต้อนรับ กลับสู่ระบบอีกครั้ง</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8" noValidate>
            {/* Auth Error Message */}
            {errors.auth && (
              <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl animate-pulse">
                {errors.auth}
              </div>
            )}

            <div className="space-y-10">
              {/* Username Field */}
              <div className="space-y-3">
                <label htmlFor="username" className="block text-sm font-semibold text-gray-700 ml-1">
                  ชื่อผู้ใช้ (Username)
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  autoComplete="off"
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errors.username) setErrors(prev => ({ ...prev, username: '' }));
                  }}
                  className={`block w-full rounded-lg px-4 py-3.5 text-gray-900 bg-gray-50 transition-all focus:outline-none focus:ring-2 focus:bg-white text-base ${errors.username ? 'ring-2 ring-red-500 bg-red-50' : 'focus:ring-blue-500'}`}
                  placeholder="Enter your username"
                />
                {errors.username && <p className="text-xs text-red-500 mt-2 font-medium ml-1">{errors.username}</p>}
              </div>

              {/* Password Field */}
              <div className="space-y-3">
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 ml-1">
                  รหัสผ่าน (Password)
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  autoComplete="off"
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors(prev => ({ ...prev, password: '' }));
                  }}
                  className={`block w-full rounded-lg px-4 py-3.5 text-gray-900 bg-gray-50 transition-all focus:outline-none focus:ring-2 focus:bg-white text-base ${errors.password ? 'ring-2 ring-red-500 bg-red-50' : 'focus:ring-blue-500'}`}
                  placeholder="Enter your password"
                />
                {errors.password && <p className="text-xs text-red-500 mt-2 font-medium ml-1">{errors.password}</p>}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-600 cursor-pointer transition-all"
                />
                <label htmlFor="remember-me" className="ml-3 block text-sm font-medium text-gray-700 cursor-pointer">
                  จดจำฉันในระบบ
                </label>
              </div>
              <button type="button" onClick={() => setShowForgotModal(true)} className="text-sm font-bold text-blue-600 hover:text-blue-500 transition-colors">
                ลืมรหัสผ่าน?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-blue-600 px-6 py-4 text-base font-bold text-white shadow-lg hover:bg-blue-700 hover:shadow-blue-200 focus:outline-none transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? 'กำลังตรวจสอบข้อมูล...' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <p className="mt-12 text-center text-xs font-medium text-gray-400">
            System Version 1.0.0
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForgotModal(false)}>
          <div className="bg-white rounded-2xl p-8 max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">ลืมรหัสผ่าน?</h3>
              <p className="text-gray-600 mb-4">กรุณาติดต่อฝ่าย IT เพื่อขอรีเซ็ตรหัสผ่าน</p>
              <div className="bg-blue-50 rounded-xl p-4 mb-6">
                <p className="text-sm text-gray-500">เบอร์ภายใน</p>
                <p className="text-3xl font-bold text-blue-600">250</p>
              </div>
              <button
                onClick={() => setShowForgotModal(false)}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
              >
                เข้าใจแล้ว
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}