// components/StatusChart.tsx
'use client'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

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

export default function StatusChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(entry.name)} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}