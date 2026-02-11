'use client';

export default function Loading() {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4">
                {/* Logo Spinner */}
                <div className="relative">
                    {/* Outer Ring */}
                    <div className="w-16 h-16 rounded-full border-4 border-gray-200" />

                    {/* Spinning Arc */}
                    <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent border-t-blue-600 animate-spin" />

                    {/* Inner Pulse */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse shadow-lg" />
                    </div>
                </div>

                {/* Loading Text */}
                <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-gray-600">กำลังโหลด</span>
                    <span className="flex gap-0.5">
                        <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                </div>
            </div>
        </div>
    );
}
