'use client';

export default function Loading() {
    return (
        <div className="flex-1 flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center gap-4">
                {/* Spinner with Logo */}
                <div className="relative">
                    {/* Outer Ring */}
                    <div className="w-14 h-14 rounded-full border-4 border-gray-200" />

                    {/* Spinning Arc */}
                    <div className="absolute inset-0 w-14 h-14 rounded-full border-4 border-transparent border-t-blue-600 border-r-blue-400 animate-spin" />

                    {/* Inner Pulse */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse shadow-md" />
                    </div>
                </div>

                {/* Loading Text with Dots */}
                <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-gray-500">กำลังโหลด</span>
                    <span className="flex gap-0.5">
                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                </div>
            </div>
        </div>
    );
}
