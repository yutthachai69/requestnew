'use client';

import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const isDev = process.env.NODE_ENV !== 'production';

    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center p-4">
            <div className="w-full max-w-md text-center">
                <h2 className="text-xl font-bold text-gray-800 mb-2">
                    เกิดข้อผิดพลาด (Something went wrong!)
                </h2>
                <p className="text-gray-500 mb-2">
                    ไม่สามารถโหลดข้อมูลในส่วนนี้ได้
                </p>
                {isDev ? (
                    <pre className="text-left text-xs text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-6 overflow-x-auto whitespace-pre-wrap">
                        {error.message}
                    </pre>
                ) : (
                    error.digest && (
                        <p className="text-xs text-gray-400 mb-6 font-mono">รหัสอ้างอิง: {error.digest}</p>
                    )
                )}
                <button
                    onClick={() => reset()}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 transition-colors"
                >
                    ลองโหลดใหม่ (Try again)
                </button>
            </div>
        </div>
    );
}
