/**
 * พิสูจน์การแก้ timezone ในระดับข้อมูลจริง
 *
 * บั๊กเดิม: `new Date('2026-09-01')` = เที่ยงคืน UTC = 07:00 ตามเวลาไทย
 * ทำให้คำร้องที่สร้างช่วง 00:00–07:00 ของวันเริ่มต้น หลุดออกจากรายงาน
 * E2E พิสูจน์ไม่ได้เพราะสร้างคำร้องตอนตี 2 ไม่ได้ — สคริปต์นี้จึงเขียน
 * createdAt ลงฐานข้อมูลตรง ๆ แล้วเรียกโค้ดจริงของแอปมาตรวจ
 *
 *   npx tsx scripts/verify-timezone.ts
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { buildDateRangeFilter } from '../lib/date-range';

const TAG = 'TZVERIFY';

/** ตรรกะเดิมก่อนแก้ — เก็บไว้เทียบให้เห็นว่าบั๊กมีจริง */
function legacyRange(startDate: string, endDate: string) {
  const gte = new Date(startDate);
  const lte = new Date(endDate);
  lte.setHours(23, 59, 59, 999);
  return { gte, lte };
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

async function main() {
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const offsetHours = -now.getTimezoneOffset() / 60;
  console.log(`\nเขตเวลาเซิร์ฟเวอร์: UTC${offsetHours >= 0 ? '+' : ''}${offsetHours}  วันที่ทดสอบ: ${today}`);

  const [requester, department, location, category, status] = await Promise.all([
    prisma.user.findFirst({ where: { isActive: true }, select: { id: true, departmentId: true } }),
    prisma.department.findFirst({ select: { id: true } }),
    prisma.location.findFirst({ select: { id: true } }),
    prisma.category.findFirst({ select: { id: true } }),
    prisma.status.findFirst({ where: { isInitialState: true }, select: { id: true, code: true } }),
  ]);
  if (!requester || !department || !location || !category || !status) {
    throw new Error('ข้อมูลตั้งต้นไม่ครบ');
  }

  // คำร้องที่ยื่นตอนตี 2 ของวันนี้ (กะดึก) — จุดที่บั๊กเดิมทำให้หายไป
  const earlyMorning = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 2, 0, 0, 0);

  const created = await prisma.iTRequestF07.create({
    data: {
      workOrderNo: `${TAG}-${Date.now()}`,
      thaiName: `${TAG} กะดึก`,
      problemDetail: `${TAG} คำร้องที่ยื่นตอน 02:00 ของวันนี้`,
      systemType: TAG,
      status: status.code,
      currentStatusId: status.id,
      createdAt: earlyMorning,
      requesterId: requester.id,
      departmentId: requester.departmentId ?? department.id,
      locationId: location.id,
      categoryId: category.id,
    },
    select: { id: true, createdAt: true },
  });

  try {
    console.log(`สร้างคำร้อง id=${created.id} createdAt=${created.createdAt.toISOString()} (ท้องถิ่น ${created.createdAt.toLocaleString('sv-SE')})`);

    // ── 1. เทียบขอบเขตช่วงวันที่: ของเดิม vs ของใหม่ ──
    const legacy = legacyRange(today, today);
    const fixed = buildDateRangeFilter(today, today)!;
    console.log('\nขอบล่างของช่วง "วันนี้ถึงวันนี้"');
    console.log(`  ตรรกะเดิม : ${legacy.gte.toISOString()}  (ท้องถิ่น ${legacy.gte.toLocaleString('sv-SE')})`);
    console.log(`  ตรรกะใหม่ : ${fixed.gte!.toISOString()}  (ท้องถิ่น ${fixed.gte!.toLocaleString('sv-SE')})`);

    const legacyIncludes = created.createdAt >= legacy.gte && created.createdAt <= legacy.lte;
    const fixedIncludes = created.createdAt >= fixed.gte! && created.createdAt <= fixed.lte!;
    console.log(`\n  คำร้องตี 2 อยู่ในช่วงของตรรกะเดิม : ${legacyIncludes ? 'ใช่' : 'ไม่ ← บั๊ก'}`);
    console.log(`  คำร้องตี 2 อยู่ในช่วงของตรรกะใหม่ : ${fixedIncludes ? 'ใช่ ← แก้แล้ว' : 'ไม่'}`);

    // ── 2. ยิงผ่านโค้ดจริงของแอป ──
    const { fetchRequestsList } = await import('../lib/requests-list');
    const admin = await prisma.user.findFirst({
      where: { role: { roleName: 'Admin' }, isActive: true },
      select: { id: true },
    });
    if (!admin) throw new Error('ไม่พบบัญชี Admin');

    const listed = await fetchRequestsList(
      { userId: admin.id, roleName: 'Admin' },
      { startDate: today, endDate: today, limit: 100, page: 1 }
    );
    const found = listed.requests.some((r: { id: number }) => r.id === created.id);
    console.log(`\n  fetchRequestsList(${today} → ${today}) พบคำร้องนี้ : ${found ? 'ใช่' : 'ไม่'}`);

    // ── 3. เทียบจำนวนจาก count จริงในฐานข้อมูล ──
    const [legacyCount, fixedCount] = await Promise.all([
      prisma.iTRequestF07.count({ where: { createdAt: { gte: legacy.gte, lte: legacy.lte } } }),
      prisma.iTRequestF07.count({ where: { createdAt: { gte: fixed.gte, lte: fixed.lte } } }),
    ]);
    console.log(`  จำนวนคำร้องของวันนี้ — ตรรกะเดิม ${legacyCount} รายการ, ตรรกะใหม่ ${fixedCount} รายการ`);

    const passed = !legacyIncludes && fixedIncludes && found && fixedCount > legacyCount;
    console.log(
      `\n${passed ? '✅ ผ่าน' : '❌ ไม่ผ่าน'}: ` +
        (passed
          ? 'ยืนยันว่าตรรกะเดิมทำคำร้องกะดึกหายจริง และตรรกะใหม่ดึงกลับมาได้'
          : 'ผลไม่ตรงกับที่คาด — ตรวจสอบเพิ่มเติม')
    );
    if (!passed) process.exitCode = 1;
  } finally {
    await prisma.iTRequestF07.delete({ where: { id: created.id } });
    const leftover = await prisma.iTRequestF07.count({ where: { systemType: TAG } });
    console.log(`ลบข้อมูลทดสอบแล้ว (เหลือ ${leftover} รายการ)`);
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error('ERR', e);
    process.exit(1);
  });
