/**
 * Regression test สำหรับ deadlock ตอนออกเลขเอกสารพร้อมกัน
 *
 * ต้องใช้ฐานข้อมูลจริง จึงข้ามโดยปริยาย เปิดด้วย:
 *   RUN_DB_TESTS=true npx vitest run lib/document-number.db.test.ts
 *
 * สิ่งที่คุ้มกัน: เดิม generateRequestNumber อ่าน (SELECT) ก่อนแล้วค่อยเขียน
 * (UPDATE) ภายใต้ SERIALIZABLE ทำให้สอง transaction ต่างถือ shared lock บนแถว
 * DocConfig เดียวกันแล้วต่างขอ exclusive lock → deadlock แบบ lock upgrade
 * วัดได้จริงตอนสร้าง 5 ใบพร้อมกัน: ล้มเหลว 27% และช้าสุด 13.7 วินาที
 *
 * เทสนี้ยืนยัน "ความถูกต้อง" ไม่ใช่ "ความเร็ว" (ไม่ assert เวลา เพราะเครื่องที่
 * โหลดหนักจะทำให้ผลแกว่ง) ถ้าใครแก้กลับไปเป็นอ่านก่อนเขียน เทสจะล้มด้วย
 * deadlock error หรือเลขซ้ำ/ขาดหาย
 */
// ต้องมาก่อน import prisma — vitest ไม่โหลด .env ให้เอง และ prisma singleton
// อ่านค่า MSSQL_* ตอน import
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { generateRequestNumber } from './document-number';

const ENABLED = process.env.RUN_DB_TESTS === 'true';
const CONCURRENCY = 20;

describe.skipIf(!ENABLED)('generateRequestNumber ภายใต้การใช้งานพร้อมกัน (ต้องมีฐานข้อมูล)', () => {
  let categoryId: number;
  const categoryName = `DBTEST DocNumber ${Date.now()}`;

  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { name: categoryName },
      select: { id: true },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    if (categoryId) {
      await prisma.docConfig.deleteMany({ where: { categoryId } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
    }
  });

  it(`ออกเลข ${CONCURRENCY} ใบพร้อมกันได้ครบ ไม่ deadlock และเลขไม่ซ้ำ`, async () => {
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () =>
        prisma.$transaction(
          (tx) => generateRequestNumber(tx, categoryId, new Date('2026-06-15T03:00:00Z')),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000, maxWait: 20_000 }
        )
      )
    );

    const failures = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    const reasons = failures.map((f) =>
      f.reason instanceof Error ? (f.reason.message.split(/\r?\n/).filter(Boolean).pop() ?? '') : String(f.reason)
    );
    expect(failures.length, `ล้มเหลว ${failures.length}/${CONCURRENCY}: ${reasons.join(' | ')}`).toBe(0);

    const numbers = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map((r) => r.value);

    // เลขต้องไม่ซ้ำ
    expect(new Set(numbers).size, `เลขซ้ำ: ${numbers.join(', ')}`).toBe(CONCURRENCY);

    // และต้องเรียงต่อเนื่อง 1..CONCURRENCY ไม่มีเลขหาย
    const running = numbers
      .map((n) => Number(n.split('-').pop()))
      .sort((a, b) => a - b);
    expect(running).toEqual(Array.from({ length: CONCURRENCY }, (_, i) => i + 1));
  }, 120_000);

  it('เลขเดินต่อจากของเดิมเมื่อเรียกซ้ำ', async () => {
    const before = await prisma.docConfig.findFirstOrThrow({
      where: { categoryId },
      select: { lastRunningNumber: true },
    });
    const next = await prisma.$transaction(
      (tx) => generateRequestNumber(tx, categoryId, new Date('2026-06-15T03:00:00Z')),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    expect(Number(next.split('-').pop())).toBe(before.lastRunningNumber + 1);
  }, 60_000);
});
