/**
 * แยกผลของ 2 ตัวแปรที่แก้ไปพร้อมกัน: READ_COMMITTED_SNAPSHOT และขนาด connection pool
 *
 *   MSSQL_POOL_MAX=10 npx tsx scripts/verify-contention.ts
 *   MSSQL_POOL_MAX=25 npx tsx scripts/verify-contention.ts
 *
 * สลับ RCSI ด้วย scripts/enable-rcsi.ts (--off เพื่อปิด) แล้วรันซ้ำ
 * เพื่อเทียบทีละตัวแปร
 */
import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

const WRITER_HOLD_MS = 6000;
const REPEATS = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const [{ rcsi }] = await prisma.$queryRawUnsafe<{ rcsi: boolean }[]>(
    'SELECT is_read_committed_snapshot_on AS rcsi FROM sys.databases WHERE database_id = DB_ID()'
  );
  const poolMax = process.env.MSSQL_POOL_MAX ?? '25 (default ในโค้ด)';
  const total = await prisma.iTRequestF07.count();
  console.log(`\n=== RCSI=${rcsi ? 'ON' : 'OFF'}  poolMax=${poolMax}  แถวในตาราง=${total.toLocaleString()} ===`);

  const admin = await prisma.user.findFirst({
    where: { role: { roleName: 'Admin' }, isActive: true },
    select: { id: true },
  });
  const target = await prisma.iTRequestF07.findFirst({
    where: { status: 'CLOSED' },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!admin || !target) throw new Error('ข้อมูลตั้งต้นไม่ครบ (ต้องมี Admin และคำร้อง CLOSED)');

  const { fetchRequestsList } = await import('../lib/requests-list');
  const read = () =>
    fetchRequestsList({ userId: admin.id, roleName: 'Admin' }, { status: 'CLOSED', limit: 100, page: 1 });

  // ── การทดสอบที่ 1: การอ่านถูกกระทบแค่ไหนเมื่อมี SERIALIZABLE writer ค้าง ──
  const baseline: number[] = [];
  for (let i = 0; i < REPEATS; i += 1) {
    const t = performance.now();
    await read();
    baseline.push(performance.now() - t);
  }

  const underWriter: number[] = [];
  for (let i = 0; i < REPEATS; i += 1) {
    const writer = prisma
      .$transaction(
        async (tx) => {
          await tx.iTRequestF07.update({ where: { id: target.id }, data: { updatedAt: new Date() } });
          await new Promise((r) => setTimeout(r, WRITER_HOLD_MS));
          throw new Error('ROLLBACK_PROBE');
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000, maxWait: 15_000 }
      )
      .catch(() => undefined);

    await new Promise((r) => setTimeout(r, 800));
    const t = performance.now();
    try {
      await read();
      underWriter.push(performance.now() - t);
    } catch {
      underWriter.push(Number.POSITIVE_INFINITY);
    }
    await writer;
  }

  console.log('\n1) อ่านรายการขณะมี SERIALIZABLE writer ค้าง (ตัวแปรที่ RCSI แก้)');
  console.log(`   ปกติ (ไม่มี writer) : ${median(baseline).toFixed(0)} ms`);
  console.log(`   ขณะมี writer ค้าง   : ${median(underWriter).toFixed(0)} ms`);
  const slowdown = median(underWriter) / Math.max(median(baseline), 1);
  console.log(`   ช้าลง ${slowdown.toFixed(1)} เท่า`);

  // ── การทดสอบที่ 2: ยิงพร้อมกันเกินขนาด pool (ตัวแปรที่ pool.max แก้) ──
  const CONCURRENCY = 30;
  const started = performance.now();
  const results = await Promise.allSettled(Array.from({ length: CONCURRENCY }, () => read()));
  const elapsed = performance.now() - started;
  const failed = results.filter((r) => r.status === 'rejected');

  console.log(`\n2) ยิงอ่านพร้อมกัน ${CONCURRENCY} คำขอ (ตัวแปรที่ pool.max แก้)`);
  console.log(`   ใช้เวลารวม : ${elapsed.toFixed(0)} ms`);
  console.log(`   ล้มเหลว    : ${failed.length}/${CONCURRENCY}`);
  if (failed.length > 0) {
    const reason = (failed[0] as PromiseRejectedResult).reason;
    console.log(`   ตัวอย่างข้อผิดพลาด: ${reason instanceof Error ? reason.message.split('\n').filter(Boolean).pop() : reason}`);
  }

  const probeLeft = await prisma.auditLog.count({ where: { action: 'PERF_PROBE' } });
  console.log(`\n   (ข้อมูลค้างจาก probe: ${probeLeft})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('ERR', e);
    process.exit(1);
  });
