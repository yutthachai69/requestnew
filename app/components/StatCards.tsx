// components/StatCards.tsx
import { Clock, CheckCircle2, XCircle, CheckSquare } from 'lucide-react';

export default function StatCards({ counts }: { counts: any }) {
  const stats = [
    { 
      label: 'รอดำเนินการ', 
      value: counts.PENDING, 
      color: 'text-amber-600', 
      bg: 'bg-gradient-to-br from-amber-50 to-orange-50',
      borderColor: 'border-amber-100',
      icon: <Clock className="w-6 h-6 text-amber-500" />
    },
    { 
      label: 'อนุมัติแล้ว', 
      value: counts.APPROVED, 
      color: 'text-blue-600', 
      bg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
      borderColor: 'border-blue-100',
      icon: <CheckCircle2 className="w-6 h-6 text-blue-500" />
    },
    { 
      label: 'ปฏิเสธ/ตีกลับ', 
      value: counts.REJECTED, 
      color: 'text-red-600', 
      bg: 'bg-gradient-to-br from-red-50 to-rose-50',
      borderColor: 'border-red-100',
      icon: <XCircle className="w-6 h-6 text-red-500" />
    },
    { 
      label: 'ปิดงานแล้ว', 
      value: counts.CLOSED, 
      color: 'text-emerald-600', 
      bg: 'bg-gradient-to-br from-emerald-50 to-teal-50',
      borderColor: 'border-emerald-100',
      icon: <CheckSquare className="w-6 h-6 text-emerald-500" />
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-6">
      {stats.map((stat) => (
        <div 
          key={stat.label} 
          className={`${stat.bg} relative overflow-hidden p-6 rounded-2xl border ${stat.borderColor} shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition-all hover:shadow-md hover:-translate-y-0.5 group`}
        >
          {/* Background decoration */}
          <div className="absolute -right-6 -top-6 opacity-40 group-hover:scale-110 transition-transform duration-300">
             <div className="p-8 bg-white/40 rounded-full blur-xl"></div>
          </div>
          
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <p className="text-sm font-bold text-gray-600 tracking-wide uppercase">{stat.label}</p>
              <p className={`text-4xl font-extrabold mt-2 tracking-tight ${stat.color}`}>
                {stat.value}
              </p>
            </div>
            <div className={`p-3 rounded-xl bg-white/60 shadow-sm backdrop-blur-sm border ${stat.borderColor} border-opacity-50`}>
               {stat.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}