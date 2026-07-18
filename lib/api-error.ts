import { NextResponse } from 'next/server';

/**
 * Error ที่ตั้งใจโยนขึ้นมาเอง (business/validation error) — ข้อความปลอดภัยที่จะส่งให้ client เห็นตรงๆ เสมอ
 * ใช้แทนการ return NextResponse.json({...}, {status}) มือ ๆ กระจายอยู่ทุก route
 */
export class AppError extends Error {
  readonly httpStatus: number;
  readonly code: string;

  constructor(message: string, httpStatus = 400, code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

function generateErrorId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/**
 * Handler กลางสำหรับ catch block ของทุก API route
 * - error ที่ตั้งใจโยน (AppError) → ส่งข้อความ + code จริงกลับไปเสมอ (ปลอดภัย ตั้งใจให้ user เห็น)
 * - error ที่ไม่คาดคิด (bug, DB error, ฯลฯ) → log รายละเอียดจริงฝั่ง server เสมอ
 *   dev: ส่ง error.message จริงกลับไปด้วย (debug ง่าย)
 *   prod: ส่งข้อความ generic + errorId กลับไป (ปลอดภัย ไม่หลุด stack/schema) — เอา errorId ไปค้นใน server log ได้
 */
export function handleApiError(error: unknown, context: string): NextResponse {
  if (error instanceof AppError) {
    console.error(`[${context}] ${error.code}: ${error.message}`);
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.httpStatus });
  }

  const errorId = generateErrorId();
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}] errorId=${errorId}:`, error);

  const isDev = process.env.NODE_ENV !== 'production';
  return NextResponse.json(
    {
      error: isDev ? message : `เกิดข้อผิดพลาดบางอย่าง กรุณาลองใหม่อีกครั้ง (รหัสอ้างอิง: ${errorId})`,
      errorId,
    },
    { status: 500 }
  );
}

/**
 * เหมือน handleApiError แต่ใช้ใน Server Actions (`app/actions/**`) ซึ่งคืนค่าเป็น plain object
 * ไม่ใช่ NextResponse — logic การ log/เลือกข้อความ dev-vs-prod เหมือนกันทุกประการ
 */
export function handleActionError(error: unknown, context: string): { error: string; errorId?: string } {
  if (error instanceof AppError) {
    console.error(`[${context}] ${error.code}: ${error.message}`);
    return { error: error.message };
  }

  const errorId = generateErrorId();
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}] errorId=${errorId}:`, error);

  const isDev = process.env.NODE_ENV !== 'production';
  return {
    error: isDev ? message : `เกิดข้อผิดพลาดบางอย่าง กรุณาลองใหม่อีกครั้ง (รหัสอ้างอิง: ${errorId})`,
    errorId,
  };
}
