import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildHealthReport, checkDatabase, healthStatusCode } from '@/lib/health';

/**
 * GET /api/health — สำหรับตัวเฝ้าภายนอก (Task Scheduler / uptime monitor)
 *
 * ไม่ต้อง login เพราะตัวเฝ้าล็อกอินไม่ได้ และ middleware ไม่ครอบ path นี้
 * จึงไม่โดน rate limit (ตัวเฝ้าที่โดน 429 คือตัวเฝ้าที่ใช้ไม่ได้)
 *
 * ตอบ 200 เมื่อใช้งานได้จริง และ 503 เมื่อต่อฐานข้อมูลไม่ได้
 * ไม่คืนรายละเอียดระบบ (ชื่อเซิร์ฟเวอร์ เวอร์ชัน connection string) เพราะเปิดสาธารณะ
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const database = await checkDatabase(() => prisma.$queryRaw`SELECT 1 AS ok`);
  const report = buildHealthReport(database, process.uptime());

  return NextResponse.json(report, {
    status: healthStatusCode(report),
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
