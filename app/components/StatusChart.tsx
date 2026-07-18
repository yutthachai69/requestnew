// components/StatusChart.tsx
'use client'
import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

/** สี status ตามชื่อ (ภาษาไทย) */
const STATUS_COLOR_MAP: Record<string, string> = {
  // ภาษาไทย — สถานะหลัก
  'รอดำเนินการ': '#F59E0B',       // เหลือง
  'อนุมัติแล้ว': '#3B82F6',       // ฟ้า (อนุมัติแล้วแต่ยังไม่จบ)
  'ปฏิเสธ': '#EF4444',           // แดง
  'ปิดงานแล้ว': '#10B981',       // เขียว (เสร็จสมบูรณ์)
  // ภาษาไทย — สถานะ workflow
  'รอหัวหน้าแผนก': '#F97316',    // ส้ม
  'รอ IT ตรวจสอบ': '#8B5CF6',    // ม่วง
  'รอบัญชีตรวจสอบ': '#06B6D4',   // ฟ้าเทอควอยซ์
  'รอคลังสินค้า': '#84CC16',      // เขียวอ่อน
  'รอผู้อนุมัติขั้นสุดท้าย': '#EC4899', // ชมพู
  'รอ IT ปิดงาน': '#6366F1',      // น้ำเงินม่วง
  // fallback (ภาษาอังกฤษ)
  'PENDING': '#F59E0B',
  'APPROVED': '#3B82F6',
  'REJECTED': '#EF4444',
  'CLOSED': '#10B981',
};
const DEFAULT_COLOR = '#9CA3AF'; // เทา สำหรับสถานะอื่นๆ

function getColor(name: string): string {
  return STATUS_COLOR_MAP[name] ?? DEFAULT_COLOR;
}

// Custom tooltip for better styling
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const total = data.total || 0;
    const percent = total > 0 ? Math.round((data.value / total) * 100) : 0;
    
    return (
      <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-100 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: payload[0].payload.fill }}></div>
          <p className="font-semibold text-gray-800">{payload[0].name}</p>
        </div>
        <div className="flex items-center justify-between mt-1 pl-5 gap-4">
          <p className="text-gray-500 text-sm">จำนวน:</p>
          <p className="font-bold text-gray-900">{payload[0].value} <span className="text-xs text-gray-400 font-normal">รายการ</span></p>
        </div>
        <div className="flex items-center justify-between pl-5 gap-4">
          <p className="text-gray-500 text-sm">สัดส่วน:</p>
          <p className="font-semibold text-blue-600">{percent}%</p>
        </div>
      </div>
    );
  }
  return null;
};

// Custom legend for cleaner layout with percentages
const renderLegend = (props: any) => {
  const { payload } = props;
  
  // Calculate total across all payload items
  const total = payload.reduce((sum: number, entry: any) => sum + entry.payload.value, 0);

  return (
    <div className="flex flex-col h-full pl-4 border-l border-gray-100 ml-2 justify-center">
      <ul className="flex flex-col gap-3">
        {payload.map((entry: any, index: number) => {
          const value = entry.payload.value;
          const percent = total > 0 ? Math.round((value / total) * 100) : 0;
          
          return (
            <li key={`item-${index}`} className="flex items-center justify-between gap-4 text-sm hover:bg-gray-50 p-1.5 -ml-1.5 rounded-lg transition-colors cursor-default">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-md shadow-sm" style={{ backgroundColor: entry.color }}></div>
                <span className="font-medium text-gray-700">{entry.value}</span>
              </div>
              <div className="flex items-center gap-3 text-right">
                <span className="font-bold text-gray-900 w-8">{value}</span>
                <span className="text-xs font-semibold text-gray-400 w-8">{percent}%</span>
              </div>
            </li>
          );
        })}
      </ul>
      
      {/* Total Summary Footer */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-500">รวมทั้งหมด:</span>
        <span className="text-lg font-bold text-gray-900">{total}</span>
      </div>
    </div>
  );
};

export default function StatusChart({ data }: { data: { name: string; value: number }[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-[300px] w-full" />;

  // Calculate total for tooltip injection
  const totalValue = data.reduce((sum, item) => sum + item.value, 0);
  
  // Add total to each item for tooltip to use
  const chartData = data.map(item => ({
    ...item,
    total: totalValue
  }));

  return (
    <div className="min-h-[280px] w-full relative">
      {totalValue === 0 ? (
        /* Empty state — show a gray placeholder donut */
        <div className="flex flex-col sm:flex-row items-center justify-center min-h-[280px] gap-4 sm:gap-8">
          <div className="relative">
            <svg width="190" height="190" viewBox="0 0 190 190">
              <circle
                cx="95" cy="95" r="82"
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="25"
                strokeLinecap="round"
              />
            </svg>
            {/* Center Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-black text-gray-300 tracking-tighter leading-none">0</span>
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mt-1">รายการ</span>
            </div>
          </div>
          
          {/* Legend for empty state */}
          <div className="flex flex-col gap-3 sm:pl-4 sm:border-l border-gray-100">
            {data.map((item, index) => (
              <div key={index} className="flex items-center justify-between gap-4 text-sm p-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-md shadow-sm" style={{ backgroundColor: getColor(item.name) }}></div>
                  <span className="font-medium text-gray-400">{item.name}</span>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <span className="font-bold text-gray-400 w-8">0</span>
                  <span className="text-xs font-semibold text-gray-300 w-8">0%</span>
                </div>
              </div>
            ))}
            <div className="mt-2 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-400">รวมทั้งหมด:</span>
              <span className="text-lg font-bold text-gray-400">0</span>
            </div>
          </div>
        </div>
      ) : (
        /* Normal chart rendering */
        <div className="flex flex-col sm:flex-row min-h-[280px] items-center justify-center gap-3 sm:gap-0 p-4">

          {/* Left side: The Pie Chart + Center Label in a perfect square */}
          <div className="relative w-[180px] h-[180px] flex-shrink-0">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                  cornerRadius={5}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getColor(entry.name)} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Center Label - Perfectly absolute to the 180x180 square */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[28px] font-black text-gray-800 tracking-tighter leading-none">{totalValue}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">รายการ</span>
            </div>
          </div>
          
          {/* Right side: The Legend built manually to avoid Recharts SVG shifting */}
          <div className="w-full sm:flex-1 sm:ml-6 flex flex-col justify-center sm:border-l border-gray-100 sm:pl-6 space-y-3">
            {chartData.map((entry, index) => {
              const bgClass = STATUS_COLOR_MAP[entry.name] || 'bg-gray-400';
              const percent = Math.round((entry.value / totalValue) * 100) || 0;
              return (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${bgClass}`} />
                    <span className="text-[13px] font-medium text-gray-600">{entry.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <span className="font-bold text-gray-800 text-sm w-6">{entry.value}</span>
                    <span className="text-xs font-semibold text-gray-400 w-8">{percent}%</span>
                  </div>
                </div>
              );
            })}
            
            <div className="mt-2 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 tracking-wide uppercase">รวมทั้งหมด</span>
              <span className="text-lg font-black text-gray-800">{totalValue}</span>
            </div>
          </div>
          
        </div>
      )}
    </div>
  );
}