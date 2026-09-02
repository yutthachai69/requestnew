/**
 * ตรวจ/ลบข้อมูลที่ตกค้างจากการทดสอบ
 *
 *   npx tsx scripts/db-count.ts            # รายงานอย่างเดียว
 *   npx tsx scripts/db-count.ts --clean    # ลบคำร้อง/master data และกู้ค่าที่ถูกแก้
 *
 * ระบุข้อมูลทดสอบจาก prefix/marker เท่านั้น จึงไม่แตะข้อมูลจริง
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';

const REQUEST_PREFIXES = ['SMOKE TEST', 'EDGE TEST', 'MOBILE TEST', 'LOADTEST', 'TZVERIFY'];
const MASTER_PREFIX = 'E2E ';

/** ตัด ' E2E' ที่เทสต่อท้ายไว้ (ต่อได้หลายครั้งถ้าเทสล้มซ้ำ) */
const stripSuffix = (value: string) => value.replace(/(\s+E2E)+$/g, '');

(async () => {
  const requestWhere = { OR: REQUEST_PREFIXES.map((p) => ({ problemDetail: { startsWith: p } })) };
  const clean = process.argv.includes('--clean');

  if (clean) {
    const stale = await prisma.iTRequestF07.findMany({
      where: requestWhere,
      select: { id: true, workOrderNo: true },
    });
    for (const r of stale) {
      await prisma.notification.deleteMany({ where: { requestId: r.id } });
      await prisma.auditLog.deleteMany({ where: { requestId: r.id } });
      await prisma.approvalHistory.deleteMany({ where: { requestId: r.id } });
      await prisma.requestCorrectionType.deleteMany({ where: { requestId: r.id } });
      await prisma.iTRequestF07.delete({ where: { id: r.id } });
      console.log(`  ลบคำร้อง ${r.id} ${r.workOrderNo}`);
    }

    // master data ที่เทสสร้าง — ลบได้เมื่อไม่มีอะไรอ้างอิงแล้ว
    for (const dept of await prisma.department.findMany({
      where: { name: { startsWith: MASTER_PREFIX } },
      select: { id: true, name: true },
    })) {
      const [users, requests] = await Promise.all([
        prisma.user.count({ where: { departmentId: dept.id } }),
        prisma.iTRequestF07.count({ where: { departmentId: dept.id } }),
      ]);
      if (users > 0 || requests > 0) {
        console.log(`  ข้ามแผนก ${dept.id} "${dept.name}" (ยังมี user ${users} / คำร้อง ${requests})`);
        continue;
      }
      await prisma.department.delete({ where: { id: dept.id } });
      console.log(`  ลบแผนก ${dept.id} "${dept.name}"`);
    }

    // เทส 'admin settings changes are restored' ต่อท้าย ' E2E' ลงใน Status/EmailTemplate
    // แล้วกู้คืนใน finally — แต่ถ้า Playwright ฆ่าโปรเซสตอน timeout, finally ไม่ทัน
    // ทำงาน ค่าจึงค้างใน master data ที่ผู้ใช้จริงเห็น (เคยเจอ "รอหัวหน้าแผนกอนุมัติ E2E E2E")
    for (const s of await prisma.status.findMany({ where: { displayName: { contains: 'E2E' } } })) {
      const cleaned = stripSuffix(s.displayName);
      await prisma.status.update({ where: { id: s.id }, data: { displayName: cleaned } });
      console.log(`  กู้ Status ${s.code}: "${s.displayName}" -> "${cleaned}"`);
    }
    for (const t of await prisma.emailTemplate.findMany({
      where: { OR: [{ subject: { contains: 'E2E' } }, { body: { contains: '<!-- E2E -->' } }] },
    })) {
      await prisma.emailTemplate.update({
        where: { id: t.id },
        data: {
          subject: stripSuffix(t.subject),
          body: t.body.split('<!-- E2E -->').join('').trimEnd(),
        },
      });
      console.log(`  กู้ EmailTemplate ${t.templateName}`);
    }
  }

  const [requests, testRequests, probeAudit, depts, cats, roles, locs, dirtyStatus, dirtyTemplate] =
    await Promise.all([
      prisma.iTRequestF07.count(),
      prisma.iTRequestF07.count({ where: requestWhere }),
      prisma.auditLog.count({ where: { action: 'PERF_PROBE' } }),
      prisma.department.count({ where: { name: { startsWith: MASTER_PREFIX } } }),
      prisma.category.count({ where: { name: { startsWith: MASTER_PREFIX } } }),
      prisma.role.count({ where: { roleName: { startsWith: MASTER_PREFIX } } }),
      prisma.location.count({ where: { name: { startsWith: MASTER_PREFIX } } }),
      prisma.status.count({ where: { displayName: { contains: 'E2E' } } }),
      prisma.emailTemplate.count({
        where: { OR: [{ subject: { contains: 'E2E' } }, { body: { contains: '<!-- E2E -->' } }] },
      }),
    ]);
  console.log(
    `requests=${requests} leftoverTestRequests=${testRequests} perfProbeAuditRows=${probeAudit} ` +
      `leftoverMaster(dept/cat/role/loc)=${depts}/${cats}/${roles}/${locs} ` +
      `dirtyMasterData(status/template)=${dirtyStatus}/${dirtyTemplate}`
  );
  process.exit(0);
})();
