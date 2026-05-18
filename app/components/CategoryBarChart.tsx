'use client';

import { useState, useEffect } from 'react';
import ChartContainer from '@/app/components/ChartContainer';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    LabelList
} from 'recharts';

export default function CategoryBarChart({
    data
}: {
    data: { categoryId: number; categoryName: string; count: number }[]
}) {
    // Vibrant, modern color palette
    const COLORS = [
        '#3B82F6', // Blue
        '#8B5CF6', // Purple
        '#EC4899', // Pink
        '#F43F5E', // Rose
        '#F97316', // Orange
        '#10B981', // Emerald
        '#06B6D4', // Cyan
    ];
    
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) return <div className="h-[300px] w-full" />;

    // Custom tooltip
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-100 flex flex-col gap-1 max-w-[200px]">
                    <p className="font-semibold text-gray-800 break-words line-clamp-2 leading-tight">{label}</p>
                    <p className="text-gray-500 text-sm mt-1">จำนวน: <span className="font-bold text-gray-900 text-base">{payload[0].value}</span> รายการ</p>
                </div>
            );
        }
        return null;
    };

    // Calculate maximum value for Y-axis domain
    const maxCount = Math.max(...data.map(d => d.count), 0);
    // Increase the max domain a bit so labels don't get cut off at the top
    const yAxisDomain = [0, maxCount > 0 ? Math.ceil(maxCount * 1.2) : 10];
    
    // Calculate total count
    const totalCount = data.reduce((sum, item) => sum + item.count, 0);

    return (
        <div className="flex flex-col h-full">
            {/* Summary Highlight */}
            <div className="bg-gray-50/80 rounded-xl p-3 mb-4 flex items-center justify-between border border-gray-100/50">
                <span className="text-sm font-medium text-gray-500">รวมทุกหมวดหมู่</span>
                <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-gray-900 leading-none">{totalCount}</span>
                    <span className="text-xs font-semibold text-gray-400">รายการ</span>
                </div>
            </div>

            <ChartContainer height={250} className="w-full mt-auto">
                {({ width, height }) => (
                <ResponsiveContainer width={width} height={height}>
                    <BarChart
                        data={data}
                        margin={{ top: 20, right: 10, left: 0, bottom: 25 }}
                        barGap={0}
                    >
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                            dataKey="categoryName"
                            tick={({ x, y, payload }) => (
                                <g transform={`translate(${x},${y})`}>
                                    <text 
                                        x={0} 
                                        y={0} 
                                        dy={16} 
                                        textAnchor="middle" 
                                        fill="#64748b" 
                                        fontSize={11}
                                        fontWeight={500}
                                        className="select-none"
                                    >
                                        {payload.value.length > 15 ? `${payload.value.substring(0, 15)}...` : payload.value}
                                    </text>
                                </g>
                            )}
                            axisLine={{ stroke: '#e2e8f0', strokeWidth: 2 }}
                            tickLine={false}
                            interval={0} // Force show all labels
                        />
                        <YAxis
                            domain={yAxisDomain}
                            tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 500 }}
                            axisLine={false}
                            tickLine={false}
                            tickMargin={10}
                            hide={true} // Hide Y-Axis completely for a cleaner look since we have labels
                        />
                        <Tooltip
                            cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }}
                            content={<CustomTooltip />}
                        />
                        <Bar 
                            dataKey="count" 
                            radius={[6, 6, 0, 0]} 
                            maxBarSize={45}
                            isAnimationActive={true}
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                            <LabelList 
                                dataKey="count" 
                                position="top" 
                                fill="#475569" 
                                fontSize={12} 
                                fontWeight={700}
                                formatter={(value: any) => Number(value) > 0 ? value : ''}
                            />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                )}
            </ChartContainer>
        </div>
    );
}
