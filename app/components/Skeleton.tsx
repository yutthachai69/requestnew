'use client';

interface SkeletonProps {
    className?: string;
}

/** Base skeleton pulse element */
export function Skeleton({ className = '' }: SkeletonProps) {
    return (
        <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
    );
}

/** Skeleton for stat cards (like StatCards component) */
export function StatCardsSkeleton() {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center gap-4">
                        <Skeleton className="w-12 h-12 rounded-xl" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-7 w-12" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Skeleton for table rows */
export function TableRowSkeleton({ columns = 6 }: { columns?: number }) {
    return (
        <tr className="border-b border-gray-50">
            {Array.from({ length: columns }).map((_, i) => (
                <td key={i} className="px-4 py-4">
                    <Skeleton className="h-4 w-full max-w-[120px]" />
                </td>
            ))}
        </tr>
    );
}

/** Skeleton for full table */
export function TableSkeleton({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                    <tr>
                        {Array.from({ length: columns }).map((_, i) => (
                            <th key={i} className="px-4 py-3">
                                <Skeleton className="h-3 w-16" />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: rows }).map((_, i) => (
                        <TableRowSkeleton key={i} columns={columns} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** Skeleton for request/card list item */
export function CardSkeleton() {
    return (
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="flex items-center justify-between pt-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
        </div>
    );
}

/** Skeleton for list of cards */
export function CardListSkeleton({ count = 5 }: { count?: number }) {
    return (
        <div className="space-y-4">
            {Array.from({ length: count }).map((_, i) => (
                <CardSkeleton key={i} />
            ))}
        </div>
    );
}

/** Skeleton for profile page */
export function ProfileSkeleton() {
    return (
        <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8">
                <div className="flex items-center gap-6">
                    <Skeleton className="w-24 h-24 rounded-full bg-white/20" />
                    <div className="space-y-3">
                        <Skeleton className="h-8 w-48 bg-white/20" />
                        <Skeleton className="h-4 w-32 bg-white/20" />
                        <div className="flex gap-3">
                            <Skeleton className="h-6 w-24 rounded-full bg-white/20" />
                            <Skeleton className="h-6 w-20 rounded-full bg-white/20" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-100 p-6">
                        <div className="flex items-center gap-4">
                            <Skeleton className="w-14 h-14 rounded-xl" />
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-8 w-12" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Skeleton for dashboard page */
export function DashboardSkeleton() {
    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-64" />
            </div>

            {/* Stat Cards */}
            <StatCardsSkeleton />

            {/* Table Section */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
                    <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <Skeleton key={i} className="h-10 w-20 rounded-lg" />
                        ))}
                    </div>
                    <Skeleton className="h-10 w-48 rounded-lg" />
                </div>
                <div className="p-4">
                    <TableSkeleton rows={5} columns={6} />
                </div>
            </div>
        </div>
    );
}
