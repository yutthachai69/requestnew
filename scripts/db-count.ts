/**
 * ตรวจ/ลบข้อมูลที่ตกค้างจากการทดสอบ
 *
 *   npx tsx scripts/db-count.ts            # รายงานอย่างเดียว
 *   npx tsx scripts/db-count.ts --clean    # ลบคำร้องและ master data ที่ตกค้าง
 *
 * ระบุข้อมูลทดสอบจาก prefix เท่านั้น จึงไม่แตะข้อมูลจริง
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';

const REQUEST_PREFIXES = ['SMOKE TEST', 'EDGE TEST', 'MOBILE TEST', 'LOADTEST', 'TZVERIFY'];
const MASTER_PREFIX = 'E2E ';

(async () => {
  const requestWhere = { OR: REQUEST_PREFIXES.map((p) => ({ problemDetail: { startsWith: p } })) };
  const clean = process.argv.includes('--clean');

  if (clean) {
    const stale = await prisma.iTRequestF07.findMany({ where: requestWhere, select: { id: true, workOrderNo: true } });
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
  }

  const [requests, testRequests, probeAudit, depts, cats, roles, locs] = await Promise.all([
    prisma.iTRequestF07.count(),
    prisma.iTRequestF07.count({ where: requestWhere }),
    prisma.auditLog.count({ where: { action: 'PERF_PROBE' } }),
    prisma.department.count({ where: { name: { startsWith: MASTER_PREFIX } } }),
    prisma.category.count({ where: { name: { startsWith: MASTER_PREFIX } } }),
    prisma.role.count({ where: { roleName: { startsWith: MASTER_PREFIX } } }),
    prisma.location.count({ where: { name: { startsWith: MASTER_PREFIX } } }),
  ]);
  console.log(
    `requests=${requests} leftoverTestRequests=${testRequests} perfProbeAuditRows=${probeAudit} ` +
      `leftoverMaster(dept/cat/role/loc)=${depts}/${cats}/${roles}/${locs}`
  );
  process.exit(0);
})();
