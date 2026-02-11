// components/StatCards.tsx
export default function StatCards({ counts }: { counts: any }) {
  const stats = [
    { label: 'รอดำเนินการ', value: counts.PENDING, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'อนุมัติแล้ว', value: counts.APPROVED, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'ปฏิเสธ/ตีกลับ', value: counts.REJECTED, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'ปิดงานแล้ว', value: counts.CLOSED, color: 'text-gray-600', bg: 'bg-gray-50' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {stats.map((stat) => (
        <div key={stat.label} className={`${stat.bg} p-6 rounded-2xl border border-white shadow-sm`}>
          <p className="text-sm font-medium text-gray-500 uppercase">{stat.label}</p>
          <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}