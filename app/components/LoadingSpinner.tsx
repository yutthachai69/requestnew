'use client';

interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    text?: string;
}

export default function LoadingSpinner({ size = 'md', text = 'กำลังโหลด' }: LoadingSpinnerProps) {
    const sizeClasses = {
        sm: { outer: 'w-10 h-10', inner: 'w-4 h-4', border: 'border-[3px]' },
        md: { outer: 'w-14 h-14', inner: 'w-6 h-6', border: 'border-4' },
        lg: { outer: 'w-20 h-20', inner: 'w-8 h-8', border: 'border-4' },
    };

    const s = sizeClasses[size];

    return (
        <div className="flex flex-col items-center gap-3">
            {/* Spinner */}
            <div className="relative">
                {/* Outer Ring */}
                <div className={`${s.outer} rounded-full ${s.border} border-gray-200`} />

                {/* Spinning Arc - Gradient effect */}
                <div
                    className={`absolute inset-0 ${s.outer} rounded-full ${s.border} border-transparent border-t-blue-600 border-r-blue-400 animate-spin`}
                    style={{ animationDuration: '0.8s' }}
                />

                {/* Inner Pulse */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`${s.inner} rounded-full bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse shadow-lg`} />
                </div>
            </div>

            {/* Loading Text with Bouncing Dots */}
            {text && (
                <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-gray-500">{text}</span>
                    <span className="flex gap-0.5 ml-0.5">
                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                </div>
            )}
        </div>
    );
}
