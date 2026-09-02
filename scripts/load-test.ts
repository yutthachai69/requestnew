/**
 * Load test: ผู้ใช้จริงหลายคนใช้งานพร้อมกัน
 *
 *   npx tsx scripts/load-test.ts --setup 60          # สร้างบัญชีทดสอบ 60 คน
 *   npx tsx scripts/load-test.ts --users 30 --seconds 60
 *   npx tsx scripts/load-test.ts --write-bench 20 --rounds 3   # วัดคอขวดตอนสร้างคำร้อง
 *   npx tsx scripts/load-test.ts --clean             # ลบบัญชีและคำร้องที่สร้าง
 *
 * ข้อจำกัด: ตัวยิงรันบนเครื่องเดียวกับ SQL Server และ Next.js จึงแย่ง CPU กัน
 * ตัวเลขที่ได้เป็น "ขอบล่าง" ของความสามารถจริง
 *
 * หมายเหตุเรื่อง rate limit: middleware จำกัด 100 req/นาที ต่อ "ผู้ใช้" ไม่ใช่ต่อ IP
 * สคริปต์จึงกระจายโหลดข้ามบัญชีจำนวนมาก และรายงาน 429 แยกไว้ต่างหาก เพื่อให้
 * เห็นว่าอะไรเป็นขีดจำกัดของแอปจริง ๆ กับอะไรเป็นขีดจำกัดของตัว limiter เอง
 */
import 'dotenv/config';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/hash';
import { generateRequestNumber } from '../lib/document-number';
import { withTransactionRetry, TRANSACTION_OPTIONS } from '../lib/transaction-retry';

const BASE_URL = process.env.LOAD_TEST_URL ?? 'http://localhost:3000';
const USER_PREFIX = 'loaduser_';
const PASSWORD = 'load-test-1234';
const REQUEST_TAG = 'LOADTEST-VU';

type Sample = { op: string; ms: number; status: number };

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

// ── ตั้งค่าบัญชีทดสอบ ──────────────────────────────────────────────────────
async function setup(count: number) {
  const seed = await prisma.user.findFirst({
    where: { username: process.env.TEST_REQUESTER ?? 'req_cane' },
    select: { roleId: true, departmentId: true, accessibleCategories: { select: { id: true } } },
  });
  if (!seed) throw new Error('ไม่พบบัญชีต้นแบบ (req_cane)');

  const existing = await prisma.user.count({ where: { username: { startsWith: USER_PREFIX } } });
  const password = hashPassword(PASSWORD);
  let created = 0;
  for (let i = existing; i < count; i += 1) {
    await prisma.user.create({
      data: {
        username: `${USER_PREFIX}${i}`,
        password,
        fullName: `Load Test User ${i}`,
        email: `load.${i}@example.com`,
        roleId: seed.roleId,
        departmentId: seed.departmentId,
        isActive: true,
        accessibleCategories: { connect: seed.accessibleCategories.map((c) => ({ id: c.id })) },
      },
    });
    created += 1;
  }
  console.log(`บัญชีทดสอบพร้อม ${Math.max(existing, count)} คน (สร้างใหม่ ${created})`);
}

async function clean() {
  const requests = await prisma.iTRequestF07.findMany({
    where: { problemDetail: { startsWith: REQUEST_TAG } },
    select: { id: true },
  });
  for (const r of requests) {
    await prisma.notification.deleteMany({ where: { requestId: r.id } });
    await prisma.auditLog.deleteMany({ where: { requestId: r.id } });
    await prisma.approvalHistory.deleteMany({ where: { requestId: r.id } });
    await prisma.requestCorrectionType.deleteMany({ where: { requestId: r.id } });
    await prisma.iTRequestF07.delete({ where: { id: r.id } });
  }
  const users = await prisma.user.findMany({
    where: { username: { startsWith: USER_PREFIX } },
    select: { id: true },
  });
  let deleted = 0;
  let deactivated = 0;
  for (const u of users) {
    try {
      await prisma.user.delete({ where: { id: u.id } });
      deleted += 1;
    } catch {
      await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
      deactivated += 1;
    }
  }
  console.log(`ลบคำร้อง ${requests.length} รายการ, ลบบัญชี ${deleted}, ปิดใช้งาน ${deactivated}`);
}

// ── virtual user: login แล้วเก็บ cookie ────────────────────────────────────
class VirtualUser {
  cookies = new Map<string, string>();
  categoryId?: number;
  departmentId?: number;
  locationId?: number;

  constructor(readonly username: string) {}

  private cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private absorb(response: Response) {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      redirect: 'manual',
      headers: { ...(init.headers ?? {}), cookie: this.cookieHeader() },
    });
    this.absorb(response);
    return response;
  }

  async login() {
    const csrfResponse = await this.fetch('/api/auth/csrf');
    const { csrfToken } = await csrfResponse.json();
    const body = new URLSearchParams({
      csrfToken,
      username: this.username,
      password: PASSWORD,
      callbackUrl: '/dashboard',
      json: 'true',
    });
    const auth = await this.fetch('/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (auth.status >= 400) throw new Error(`login ${this.username} → ${auth.status}`);
    const me = await this.fetch('/api/me');
    if (me.status !== 200) throw new Error(`/api/me ${this.username} → ${me.status}`);
    const { user } = await me.json();
    this.departmentId = user.departmentId;

    const categories = await (await this.fetch('/api/master/categories')).json();
    const first = Array.isArray(categories) ? categories[0] : undefined;
    this.categoryId = first?.CategoryID ?? first?.id;
    this.locationId = first?.locations?.[0]?.id;
  }
}

// ── ปฏิบัติการที่จำลอง ─────────────────────────────────────────────────────
async function readOp(vu: VirtualUser, samples: Sample[], op: string, path: string) {
  const started = performance.now();
  const response = await vu.fetch(path);
  await response.arrayBuffer();
  samples.push({ op, ms: performance.now() - started, status: response.status });
}

/**
 * วัดการ "สร้างคำร้อง" ที่ชั้น transaction
 *
 * การสร้างคำร้องจริงเป็น Next.js server action ซึ่งเรียกจากสคริปต์ภายนอกไม่ได้
 * (ต้องมี action id ที่ถูกเข้ารหัสมากับหน้าเว็บ) จึงจำลอง transaction ชุดเดียวกัน
 * คือ ออกเลขเอกสารจาก DocConfig + สร้างคำร้อง ภายใต้ SERIALIZABLE เหมือนของจริง
 * นี่คือจุดที่สงสัยว่าเป็นคอขวด เพราะทุกใบในหมวดเดียวกันต้องแย่ง DocConfig แถวเดียว
 */
async function createTransaction(userId: number, ctx: { categoryId: number; departmentId: number; locationId: number; statusId: number }) {
  return withTransactionRetry(() =>
    prisma.$transaction(async (tx) => {
      const workOrderNo = await generateRequestNumber(tx, ctx.categoryId);
      return tx.iTRequestF07.create({
        data: {
          workOrderNo,
          thaiName: 'Load Test',
          problemDetail: `${REQUEST_TAG} ${userId} ${Date.now()}`,
          systemType: 'LOADTEST',
          status: 'PENDING',
          currentStatusId: ctx.statusId,
          requesterId: userId,
          departmentId: ctx.departmentId,
          locationId: ctx.locationId,
          categoryId: ctx.categoryId,
          approvalToken: crypto.randomUUID(),
        },
        select: { id: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, ...TRANSACTION_OPTIONS })
  );
}

/** ยิงสร้างคำร้องพร้อมกัน C ใบ วัดว่าคอขวด DocConfig หน่วงแค่ไหน */
async function writeBench(concurrency: number, rounds: number) {
  const requester = await prisma.user.findFirst({
    where: { username: { startsWith: USER_PREFIX }, isActive: true },
    select: { id: true, departmentId: true, accessibleCategories: { select: { id: true } } },
  });
  const location = await prisma.location.findFirst({ select: { id: true } });
  const status = await prisma.status.findFirst({ where: { isInitialState: true }, select: { id: true } });
  if (!requester || !location || !status || requester.accessibleCategories.length === 0) {
    throw new Error('ข้อมูลตั้งต้นไม่ครบ — รัน --setup ก่อน');
  }
  const ctx = {
    categoryId: requester.accessibleCategories[0].id,
    departmentId: requester.departmentId!,
    locationId: location.id,
    statusId: status.id,
  };

  console.log(`
สร้างคำร้องพร้อมกัน ${concurrency} ใบ x ${rounds} รอบ (คอขวด DocConfig)
`);
  const all: number[] = [];
  let failures = 0;
  const failureReasons = new Map<string, number>();
  const numbers = new Set<string>();

  for (let round = 0; round < rounds; round += 1) {
    const started = performance.now();
    const results = await Promise.allSettled(
      Array.from({ length: concurrency }, () => {
        const t = performance.now();
        return createTransaction(requester.id, ctx).then((r) => ({ r, ms: performance.now() - t }));
      })
    );
    const wall = performance.now() - started;
    for (const res of results) {
      if (res.status === 'fulfilled') {
        all.push(res.value.ms);
      } else {
        failures += 1;
        const reason = res.reason;
        const key =
          reason instanceof Error
            ? (reason.message.split(/\r?\n/).filter(Boolean).pop() ?? reason.message).slice(0, 100)
            : String(reason).slice(0, 100);
        failureReasons.set(key, (failureReasons.get(key) ?? 0) + 1);
      }
    }
    console.log(`  รอบ ${round + 1}: ${wall.toFixed(0)} ms รวม (${(concurrency / (wall / 1000)).toFixed(1)} ใบ/วินาที)`);
  }

  const created = await prisma.iTRequestF07.findMany({
    where: { problemDetail: { startsWith: REQUEST_TAG } },
    select: { workOrderNo: true },
  });
  for (const c of created) if (c.workOrderNo) numbers.add(c.workOrderNo);

  const sorted = all.sort((a, b) => a - b);
  console.log(
    `
  สำเร็จ ${all.length} ใบ, ล้มเหลว ${failures} ใบ
` +
      `  เวลาต่อใบ: p50 ${percentile(sorted, 50).toFixed(0)} ms, ` +
      `p95 ${percentile(sorted, 95).toFixed(0)} ms, ` +
      `p99 ${percentile(sorted, 99).toFixed(0)} ms, ` +
      `สูงสุด ${(sorted[sorted.length - 1] ?? 0).toFixed(0)} ms`
  );
  console.log(`  เลขเอกสารไม่ซ้ำ: ${numbers.size}/${created.length} ${numbers.size === created.length ? '✅' : '❌ ซ้ำ!'}`);
  if (failureReasons.size > 0) {
    console.log('\n  สาเหตุที่ล้มเหลว:');
    for (const [reason, count] of [...failureReasons].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${count} ครั้ง: ${reason}`);
    }
  }
}

// ── รันโหลด ────────────────────────────────────────────────────────────────
async function run(userCount: number, seconds: number) {
  const usernames = (
    await prisma.user.findMany({
      where: { username: { startsWith: USER_PREFIX }, isActive: true },
      select: { username: true },
      orderBy: { id: 'asc' },
      take: userCount,
    })
  ).map((u) => u.username);
  if (usernames.length < userCount) {
    throw new Error(`มีบัญชีทดสอบแค่ ${usernames.length} คน — รัน --setup ${userCount} ก่อน`);
  }

  console.log(`\nกำลัง login ${userCount} บัญชี...`);
  const vus: VirtualUser[] = [];
  for (const username of usernames) {
    const vu = new VirtualUser(username);
    await vu.login();
    vus.push(vu);
  }
  console.log(`login สำเร็จ ${vus.length} คน — เริ่มยิงโหลดอ่าน ${seconds} วินาที\n`);

  const samples: Sample[] = [];
  const deadline = Date.now() + seconds * 1000;
  let stopped = false;

  const worker = async (vu: VirtualUser, index: number) => {
    while (Date.now() < deadline && !stopped) {
      try {
        const roll = Math.random();
        if (roll < 0.5) {
          await readOp(vu, samples, 'list', '/api/requests?limit=20&page=1');
        } else if (roll < 0.8) {
          await readOp(vu, samples, 'dashboard', '/api/dashboard/overview');
        } else {
          await readOp(vu, samples, 'notifications', '/api/notifications');
        }
      } catch (e) {
        samples.push({ op: 'error', ms: 0, status: 0 });
        if (samples.filter((s) => s.status === 0).length > 50) stopped = true;
      }
      // เว้นจังหวะเล็กน้อยเลียนแบบคนใช้งานจริง (ไม่ใช่ยิงรัวไม่หยุด)
      await new Promise((r) => setTimeout(r, 200 + (index % 5) * 100));
    }
  };

  const startedAt = performance.now();
  await Promise.all(vus.map((vu, i) => worker(vu, i)));
  const elapsedSec = (performance.now() - startedAt) / 1000;

  // ── รายงานผล ──
  const byOp = new Map<string, Sample[]>();
  for (const s of samples) {
    if (!byOp.has(s.op)) byOp.set(s.op, []);
    byOp.get(s.op)!.push(s);
  }

  console.log(`ผลการทดสอบ — ${userCount} ผู้ใช้พร้อมกัน, ${elapsedSec.toFixed(0)} วินาที\n`);
  console.log('  operation      จำนวน   ok    429   5xx   อื่น |   p50    p95    p99    max');
  console.log('  ' + '─'.repeat(76));
  for (const [op, list] of [...byOp].sort()) {
    const ok = list.filter((s) => s.status >= 200 && s.status < 400).length;
    const tooMany = list.filter((s) => s.status === 429).length;
    const server = list.filter((s) => s.status >= 500).length;
    const other = list.length - ok - tooMany - server;
    const times = list.filter((s) => s.status !== 0).map((s) => s.ms).sort((a, b) => a - b);
    console.log(
      `  ${op.padEnd(14)}${String(list.length).padStart(6)}${String(ok).padStart(6)}` +
        `${String(tooMany).padStart(6)}${String(server).padStart(6)}${String(other).padStart(6)} |` +
        `${percentile(times, 50).toFixed(0).padStart(6)}${percentile(times, 95).toFixed(0).padStart(7)}` +
        `${percentile(times, 99).toFixed(0).padStart(7)}${(times[times.length - 1] ?? 0).toFixed(0).padStart(7)}`
    );
  }

  const total = samples.length;
  const failed = samples.filter((s) => s.status >= 500 || s.status === 0).length;
  const limited = samples.filter((s) => s.status === 429).length;
  console.log('  ' + '─'.repeat(76));
  console.log(
    `  รวม ${total} คำขอ | ${(total / elapsedSec).toFixed(1)} req/s | ` +
      `ล้มเหลว (5xx/เชื่อมต่อไม่ได้) ${failed} (${((failed / total) * 100).toFixed(1)}%) | ` +
      `ติด rate limit ${limited} (${((limited / total) * 100).toFixed(1)}%)`
  );
}

async function main() {
  if (process.argv.includes('--clean')) return clean();
  const setupCount = arg('setup', 0);
  if (setupCount > 0) return setup(setupCount);
  const writeConcurrency = arg('write-bench', 0);
  if (writeConcurrency > 0) return writeBench(writeConcurrency, arg('rounds', 3));
  await run(arg('users', 20), arg('seconds', 60));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('ERR', e instanceof Error ? e.message : e);
    process.exit(1);
  });
