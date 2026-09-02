import { Prisma } from '@prisma/client';

/**
 * SQL Server may abort a serializable transaction during a concurrent write.
 *
 * - `P2034` — Prisma's write-conflict/deadlock code.
 * - `ENOTBEGUN` — the mssql adapter reports "Transaction has not begun" when the
 *   server aborted the transaction before the first statement of the batch ran.
 *   Nothing was applied, so replaying the operation is safe: the second attempt
 *   hits the ALREADY_APPROVED guards and fails cleanly instead of 500-ing.
 */
const RETRYABLE_TRANSACTION_CODES = new Set(['P2034', 'ENOTBEGUN']);

export function isRetryableTransactionConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    RETRYABLE_TRANSACTION_CODES.has(error.code)
  );
}

/**
 * ตัวเลือกมาตรฐานสำหรับ interactive transaction
 *
 * ค่า default ของ Prisma คือ timeout 5 วินาที / maxWait 2 วินาที ซึ่งสั้นเกินไป
 * สำหรับงานที่นี่: การสร้างคำร้องและการอนุมัติทำหลายคำสั่งใน SERIALIZABLE
 * transaction เดียว (ออกเลขเอกสาร + อัปเดตสถานะ + audit log + ประวัติอนุมัติ)
 * เมื่อมีผู้ใช้พร้อมกันหลายคนหรือฐานข้อมูลเพิ่งรีสตาร์ท งานชุดนี้ใช้เวลาเกิน
 * 5 วินาทีได้ แล้ว Prisma จะยกเลิกด้วย P2028 ("query cannot be executed on an
 * expired transaction") ซึ่งผู้ใช้เห็นเป็นการบันทึกล้มเหลวโดยไม่มีสาเหตุที่
 * อธิบายได้ ปรับผ่าน env ได้เพื่อจูนตอน load test
 */
export const TRANSACTION_OPTIONS = {
  timeout: Number(process.env.PRISMA_TRANSACTION_TIMEOUT_MS ?? 20_000),
  maxWait: Number(process.env.PRISMA_TRANSACTION_MAX_WAIT_MS ?? 10_000),
};

export async function withTransactionRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableTransactionConflict(error) || attempt === maxAttempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw new Error('Transaction retry limit reached');
}
