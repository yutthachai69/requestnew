'use client';

import { useEffect } from 'react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <html>
            <body>
                <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-4">
                    <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg text-center">
                        <h2 className="text-2xl font-bold text-red-600 mb-4">
                            เกิดข้อผิดพลาดร้ายแรง (Something went wrong!)
                        </h2>
                        <p className="text-gray-600 mb-6">
                            ระบบเกิดข้อขัดข้องทางเทคนิค กรุณาลองใหม่อีกครั้ง
                        </p>
                        <button
                            onClick={() => reset()}
                            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors"
                        >
                            ลองใหม่อีกครั้ง (Try again)
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
