'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];
const THAI_DAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

type DatePickerProps = {
  /** Currently selected start date (YYYY-MM-DD) */
  startDate?: string;
  /** Currently selected end date (YYYY-MM-DD) */
  endDate?: string;
  /** Called when a date range is confirmed */
  onApply: (startDate: string, endDate: string) => void;
  /** Called when the picker is closed/cancelled */
  onClose: () => void;
};

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isBetween(d: Date, start: Date, end: Date): boolean {
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export default function DateRangePicker({ startDate, endDate, onApply, onClose }: DatePickerProps) {
  const today = useMemo(() => new Date(), []);
  
  // Calendar view state
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  
  // Selection state
  const [selStart, setSelStart] = useState<Date | null>(startDate ? new Date(startDate) : null);
  const [selEnd, setSelEnd] = useState<Date | null>(endDate ? new Date(endDate) : null);
  const [selecting, setSelecting] = useState<'start' | 'end'>('start');

  // Generate calendar grid for current month
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startDayOfWeek = firstDay.getDay(); // 0=Sunday
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    
    const days: (Date | null)[] = [];
    // Fill blanks before month start
    for (let i = 0; i < startDayOfWeek; i++) days.push(null);
    // Fill actual days
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(viewYear, viewMonth, d));
    // Fill remaining blanks to complete last row
    while (days.length % 7 !== 0) days.push(null);
    
    return days;
  }, [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  const handleDayClick = (day: Date) => {
    if (selecting === 'start') {
      setSelStart(day);
      // If the new start is after end, reset end
      if (selEnd && day.getTime() > selEnd.getTime()) {
        setSelEnd(null);
      }
      setSelecting('end');
    } else {
      // If clicked date is before start, swap
      if (selStart && day.getTime() < selStart.getTime()) {
        setSelEnd(selStart);
        setSelStart(day);
      } else {
        setSelEnd(day);
      }
      setSelecting('start');
    }
  };

  const handleApply = () => {
    if (selStart) {
      const start = toYMD(selStart);
      const end = selEnd ? toYMD(selEnd) : start;
      onApply(start, end);
    }
  };

  const isInRange = (day: Date): boolean => {
    if (!selStart || !selEnd) return false;
    return isBetween(day, selStart, selEnd);
  };

  const isStart = (day: Date): boolean => !!selStart && isSameDay(day, selStart);
  const isEnd = (day: Date): boolean => !!selEnd && isSameDay(day, selEnd);
  const isToday = (day: Date): boolean => isSameDay(day, today);
  const isFuture = (day: Date): boolean => day.getTime() > today.getTime();

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30" onClick={onClose} />
      
      {/* Calendar Popup */}
      <div className="absolute right-0 top-full mt-2 z-40 bg-white rounded-2xl border border-gray-100 shadow-2xl p-5 w-[320px] select-none">
        {/* Month/Year Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button 
            onClick={prevMonth} 
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3 className="text-sm font-bold text-gray-800">
            {THAI_MONTHS[viewMonth]} {viewYear + 543}
          </h3>
          <div className="flex items-center gap-1">
            <button 
              onClick={goToToday}
              className="px-2 py-1 text-xs font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
            >
              ล่าสุด
            </button>
            <button 
              onClick={nextMonth} 
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {THAI_DAYS.map((d) => (
            <div key={d} className="text-center text-xs font-bold text-gray-400 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {calendarDays.map((day, i) => {
            if (!day) return <div key={`blank-${i}`} />;
            
            const start = isStart(day);
            const end = isEnd(day);
            const inRange = isInRange(day);
            const todayMark = isToday(day);
            const future = isFuture(day);
            const selected = start || end;

            return (
              <button
                key={i}
                onClick={() => !future && handleDayClick(day)}
                disabled={future}
                className={`
                  relative w-full aspect-square flex items-center justify-center text-sm font-medium rounded-full transition-all
                  ${future ? 'text-gray-300 cursor-not-allowed' : 'cursor-pointer'}
                  ${selected ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : ''}
                  ${inRange && !selected ? 'bg-blue-50 text-blue-700' : ''}
                  ${todayMark && !selected ? 'ring-2 ring-blue-400 ring-offset-1 text-blue-600 font-bold' : ''}
                  ${!selected && !inRange && !todayMark && !future ? 'text-gray-700 hover:bg-gray-100' : ''}
                `}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>

        {/* Selected range display & actions */}
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
            <div className="flex items-center gap-1">
              <span className="font-medium text-gray-700">
                {selStart ? selStart.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
              </span>
              <span>→</span>
              <span className="font-medium text-gray-700">
                {selEnd ? selEnd.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
              </span>
            </div>
            {selecting === 'end' && <span className="text-blue-500 text-[11px]">เลือกวันสิ้นสุด</span>}
            {selecting === 'start' && selStart && <span className="text-gray-400 text-[11px]">เลือกเสร็จแล้ว</span>}
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onClose}
              className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleApply}
              disabled={!selStart}
              className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              ตกลง
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
