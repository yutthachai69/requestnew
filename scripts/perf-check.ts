/**
 * วัดประสิทธิภาพหน้าหนัก ๆ บนข้อมูลปริมาณจริง
 *
 *   npx tsx scripts/perf-check.ts            # วัดกับข้อมูลที่มีอยู่
 *   npx tsx scripts/perf-check.ts --seed 30000   # เติมข้อมูลจำลองก่อนวัด
 *   npx tsx scripts/perf-check.ts --clean        # ลบข้อมูลจำลองทั้งหมด
 *
 * ข้อมูลจำลองถูกทำเครื่องหมายด้วย LOADTEST_TAG ใน problemDetail จึงลบออกได้
 * ครบโดยไม่แตะข้อมูลจริง
 */
import 'dotenv/config';

// ต้องตั้งก่อน import lib/prisma เพื่อให้ singleton ถูกสร้างพร้อม query event
process.env.PRISMA_QUERY_LOG = 'true';
// eslint-disable-next-line import/first
import { prisma } from '../lib/prisma';

const LOADTEST_TAG = 'LOADTEST';
const BATCH_SIZE = 1000;

let queryCount = 0;
let queryLog: string[] = [];
(prisma as unknown as { $on: (event: 'query', cb: (e: { query: string; duration: number }) => void) => void }).$on('query', (e) => {
  queryCount += 1;
  queryLog.push(e.query);
});

function startCounting() {
  queryCount = 0;
  queryLog = [];
}

/** จับเวลา + นับจำนวน query ที่วิ่งจริง (ใช้ตรวจ N+1) */
async function measure<T>(label: string, fn: () => Promise<T>): Promise<void> {
  // อุ่นเครื่องหนึ่งรอบ ไม่ให้ cold start ของ connection ทำให้ตัวเลขเพี้ยน
  await fn().catch(() => undefined);

  startCounting();
  const started = performance.now();
  let failed: string | null = null;
  try {
    await fn();
  } catch (e) {
    failed = e instanceof Error ? e.message : String(e);
  }
  const ms = performance.now() - started;
  const queries = queryCount;

  const flag = failed ? 'ERROR' : ms > 1000 ? 'SLOW ' : queries > 20 ? 'N+1? ' : 'ok   ';
  console.log(
    `  [${flag}] ${label.padEnd(46)} ${ms.toFixed(0).padStart(6)} ms   ${String(queries).padStart(4)} queries` +
      (failed ? `\n           ↳ ${failed}` : '')
  );

  if (queries > 20 && !failed) {
    // แสดงรูปแบบ query ที่ซ้ำมากที่สุด — มักเป็นตัวการ N+1
    const shapes = new Map<string, number>();
    for (const q of queryLog) {
      const shape = q.replace(/@P\d+/g, '?').slice(0, 110);
      shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
    }
    const worst = [...shapes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (worst && worst[1] > 5) console.log(`           ↳ ซ้ำ ${worst[1]} ครั้ง: ${worst[0]}`);
  }
}

async function seed(target: number) {
  const [requesters, departments, locations, categories, statuses] = await Promise.all([
    prisma.user.findMany({ select: { id: true, departmentId: true }, take: 50 }),
    prisma.department.findMany({ select: { id: true } }),
    prisma.location.findMany({ select: { id: true } }),
    prisma.category.findMany({ select: { id: true } }),
    prisma.status.findMany({ select: { id: true, code: true } }),
  ]);
  if (!requesters.length || !locations.length || !categories.length || !statuses.length) {
    throw new Error('ข้อมูลตั้งต้นไม่ครบ — รัน seed ก่อน');
  }

  const existing = await prisma.iTRequestF07.count({
    where: { problemDetail: { startsWith: LOADTEST_TAG } },
  });
  const toCreate = target - existing;
  if (toCreate <= 0) {
    console.log(`ข้อมูลจำลองมีอยู่แล้ว ${existing} รายการ (>= ${target}) — ข้ามการเติม`);
    return;
  }
  console.log(`เติมข้อมูลจำลองอีก ${toCreate} รายการ (มีอยู่ ${existing})...`);

  const now = Date.now();
  const yearMs = 365 * 24 * 60 * 60 * 1000;

  for (let created = 0; created < toCreate; created += BATCH_SIZE) {
    const batch = Array.from({ length: Math.min(BATCH_SIZE, toCreate - created) }, (_, i) => {
      const n = existing + created + i;
      const requester = requesters[n % requesters.length];
      const status = statuses[n % statuses.length];
      const departmentId = requester.departmentId ?? departments[n % departments.length].id;
      return {
        workOrderNo: `${LOADTEST_TAG}-${String(n).padStart(7, '0')}`,
        thaiName: `ผู้แจ้งทดสอบ ${n}`,
        problemDetail: `${LOADTEST_TAG} รายการทดสอบประสิทธิภาพ ลำดับ ${n}`,
        systemType: 'LOADTEST',
        status: status.code,
        currentStatusId: status.id,
        // กระจายย้อนหลัง 2 ปี เพื่อให้ filter ช่วงวันที่มีความหมาย
        createdAt: new Date(now - Math.floor((n / toCreate) * 2 * yearMs)),
        requesterId: requester.id,
        departmentId,
        locationId: locations[n % locations.length].id,
        categoryId: categories[n % categories.length].id,
      };
    });
    await prisma.iTRequestF07.createMany({ data: batch });
    process.stdout.write(`\r  สร้างแล้ว ${Math.min(created + BATCH_SIZE, toCreate)}/${toCreate}`);
  }
  console.log('');
}

async function clean() {
  const target = await prisma.iTRequestF07.findMany({
    where: { problemDetail: { startsWith: LOADTEST_TAG } },
    select: { id: true },
  });
  const ids = target.map((r) => r.id);
  console.log(`ลบข้อมูลจำลอง ${ids.length} รายการ...`);
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    await prisma.notification.deleteMany({ where: { requestId: { in: chunk } } });
    await prisma.auditLog.deleteMany({ where: { requestId: { in: chunk } } });
    await prisma.approvalHistory.deleteMany({ where: { requestId: { in: chunk } } });
    await prisma.requestCorrectionType.deleteMany({ where: { requestId: { in: chunk } } });
    await prisma.iTRequestF07.deleteMany({ where: { id: { in: chunk } } });
  }
  console.log('ลบเรียบร้อย');
}

async function runBenchmarks() {
  const total = await prisma.iTRequestF07.count();
  console.log(`\nจำนวนคำร้องทั้งหมดในฐานข้อมูล: ${total.toLocaleString()}\n`);

  const { fetchRequestsList } = await import('../lib/requests-list');
  const { fetchDashboardStatistics } = await import('../lib/dashboard-stats');
  const { getPendingTransitionMetaForUser } = await import('../lib/pending-tasks-shared');

  const admin = await prisma.user.findFirst({
    where: { role: { roleName: 'Admin' }, isActive: true },
    select: { id: true, role: { select: { roleName: true } } },
  });
  const head = await prisma.user.findFirst({
    where: { role: { roleName: 'Head of Department' }, isActive: true },
    select: { id: true, role: { select: { roleName: true } } },
  });
  if (!admin || !head) throw new Error('ไม่พบบัญชี Admin หรือ Head of Department');

  const now = new Date();
  const startOfYear = `${now.getFullYear()}-01-01`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  console.log('รายการคำร้อง (หน้าแรก / ค้นหา / กรองวันที่)');
  const adminSession = { userId: admin.id, roleName: 'Admin' };
  const headSession = { userId: head.id, roleName: head.role.roleName };

  await measure('requests page 1, limit 20 (admin)', () =>
    fetchRequestsList(adminSession, { page: 1, limit: 20 })
  );
  await measure('requests page 50, limit 20 (admin)', () =>
    fetchRequestsList(adminSession, { page: 50, limit: 20 })
  );
  await measure('requests + date range ทั้งปี (admin)', () =>
    fetchRequestsList(adminSession, { page: 1, limit: 20, startDate: startOfYear, endDate: today })
  );
  await measure('requests + ค้นหาข้อความไทย (admin)', () =>
    fetchRequestsList(adminSession, { page: 1, limit: 20, search: 'ทดสอบ' })
  );
  await measure('requests หน้าแรก (head of department)', () =>
    fetchRequestsList(headSession, { page: 1, limit: 20 })
  );

  console.log('\nDashboard / รายงาน');
  await measure('dashboard stats (admin, ไม่กรองวันที่)', () =>
    fetchDashboardStatistics(admin.id, 'Admin')
  );
  await measure('dashboard stats (admin, ทั้งปี)', () =>
    fetchDashboardStatistics(admin.id, 'Admin', { startDate: startOfYear, endDate: today })
  );
  await measure('dashboard stats (head of department)', () =>
    fetchDashboardStatistics(head.id, head.role.roleName)
  );

  console.log('\nคิวงานรออนุมัติ');
  await measure('pending tasks meta (head of department)', () =>
    getPendingTransitionMetaForUser(head.id, head.role.roleName)
  );

  console.log('\nคำอธิบาย: SLOW = ช้ากว่า 1 วินาที, N+1? = ใช้มากกว่า 20 query ต่อ 1 หน้า');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--clean')) {
    await clean();
    return;
  }
  const seedIndex = args.indexOf('--seed');
  if (seedIndex !== -1) {
    const target = Number(args[seedIndex + 1] ?? 30000);
    await seed(target);
  }
  await runBenchmarks();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('ERR', e);
    await prisma.$disconnect();
    process.exit(1);
  });
