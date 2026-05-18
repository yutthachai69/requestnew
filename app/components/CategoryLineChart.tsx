'use client';

import { useState, useEffect } from 'react';
import ChartContainer from '@/app/components/ChartContainer';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export type TrendData = {
  date: string;
  label: string;
  count: number;
};

export default function CategoryLineChart({ data }: { data: TrendData[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-[250px] w-full" />;

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6 flex items-center justify-center h-[200px] shadow-sm mb-6">
        <p className="text-gray-500">ไม่มีข้อมูลสถิติ</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-100 flex flex-col gap-1 min-w-[120px]">
          <p className="font-semibold text-gray-800 leading-tight">{payload[0].payload.label}</p>
          <p className="text-gray-500 text-sm mt-1">
            จำนวน: <span className="font-bold text-gray-900 text-base">{payload[0].value}</span> รายการ
          </p>
        </div>
      );
    }
    return null;
  };

  const totalCount = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm mb-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            สถิติปริมาณคำร้องย้อนหลัง
          </h2>
          <p className="text-sm text-gray-500 mt-1">แนวโน้มการแจ้งงานในหมวดหมู่นี้ ตลอด 7 วันที่ผ่านมา</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500 font-medium mb-1">รวม 7 วันย้อนหลัง</p>
          <div className="flex items-baseline gap-1 justify-end">
            <span className="text-2xl font-bold text-gray-900 leading-none">{totalCount}</span>
            <span className="text-xs font-semibold text-gray-500">รายการ</span>
          </div>
        </div>
      </div>

      <ChartContainer height={250} className="w-full">
        {({ width, height }) => (
        <ResponsiveContainer width={width} height={height}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis 
              dataKey="label" 
              axisLine={{ stroke: '#e2e8f0', strokeWidth: 2 }}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
              dy={10}
            />
            <YAxis 
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 500 }}
              dx={-10}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1, strokeDasharray: '4 4' }} />
            <Line 
              type="monotone" 
              dataKey="count" 
              stroke="#3B82F6" 
              strokeWidth={3}
              dot={{ r: 4, fill: '#3B82F6', strokeWidth: 2, stroke: '#ffffff' }}
              activeDot={{ r: 6, fill: '#3B82F6', stroke: '#EFF6FF', strokeWidth: 4 }}
              isAnimationActive={true}
            />
          </LineChart>
        </ResponsiveContainer>
        )}
      </ChartContainer>
    </div>
  );
}
