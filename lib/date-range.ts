/**
 * ตัวช่วยแปลงช่วงวันที่จากฟอร์ม (YYYY-MM-DD) เป็นช่วงเวลาจริงสำหรับ query
 *
 * ผู้ใช้เลือก "วันที่" ตามปฏิทินไทย (เวลาท้องถิ่นของเซิร์ฟเวอร์) แต่
 * `new Date('2026-09-01')` ถูกตีความเป็น **UTC เที่ยงคืน** ตามสเปกของ JS
 * บนเซิร์ฟเวอร์ที่ตั้ง Asia/Bangkok (UTC+7) ค่านั้นคือ 07:00 ของเช้าวันนั้น
 * ทำให้คำร้องที่สร้างระหว่าง 00:00–07:00 ของวันเริ่มต้น "หายไป" จากรายงาน
 * โดยไม่มี error ใด ๆ
 *
 * ฟังก์ชันในไฟล์นี้จึงตีความสตริงแบบวันที่ล้วนเป็นเวลาท้องถิ่นเสมอ
 * ส่วนสตริงที่ระบุเวลา/โซนมาด้วย (ISO เต็ม) จะเคารพค่าที่ส่งมาตามเดิม
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** true เมื่อสตริงเป็นวันที่ล้วน เช่น "2026-09-01" (ไม่มีส่วนเวลา) */
export function isDateOnly(value: string): boolean {
  return DATE_ONLY.test(value.trim());
}

/** true เมื่อ parse เป็นวันที่ได้จริง — ใช้ตรวจ input ก่อนนำไป query */
export function isValidDateInput(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  const match = DATE_ONLY.exec(trimmed);
  if (match) {
    const [, y, m, d] = match;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    // ปฏิเสธวันที่ไม่มีจริง เช่น 2026-02-31 (JS จะ roll over ไปเดือนถัดไป)
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
  }
  return !Number.isNaN(new Date(trimmed).getTime());
}

/** ต้นวัน (00:00:00.000) ตามเวลาท้องถิ่น สำหรับใช้เป็นขอบล่าง `gte` */
export function startOfDayLocal(value: string): Date {
  const match = DATE_ONLY.exec(value.trim());
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
  }
  return new Date(value);
}

/** ท้ายวัน (23:59:59.999) ตามเวลาท้องถิ่น สำหรับใช้เป็นขอบบน `lte` */
export function endOfDayLocal(value: string): Date {
  const match = DATE_ONLY.exec(value.trim());
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
  }
  // สตริงที่มีเวลามาด้วย: ถือว่าผู้เรียกระบุเวลาสิ้นสุดเองแล้ว
  return new Date(value);
}

export type DateRangeFilter = { gte?: Date; lte?: Date };

/**
 * สร้าง filter ช่วงวันที่สำหรับ Prisma จาก query string
 * คืน `undefined` เมื่อไม่ได้ระบุช่วงวันที่มาเลย
 */
export function buildDateRangeFilter(
  startDate?: string | null,
  endDate?: string | null
): DateRangeFilter | undefined {
  const start = startDate?.trim();
  const end = endDate?.trim();
  if (!start && !end) return undefined;

  const filter: DateRangeFilter = {};
  if (start) filter.gte = startOfDayLocal(start);
  if (end) filter.lte = endOfDayLocal(end);
  return filter;
}
