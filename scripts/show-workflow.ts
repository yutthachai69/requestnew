/**
 * แสดง Workflow ที่ตั้งไว้จริงในฐานข้อมูล แยกตามหมวดหมู่
 *
 *   npx tsx scripts/show-workflow.ts
 *
 * ใช้ตรวจว่าเส้นทางอนุมัติที่เขียนในคู่มือตรงกับที่ตั้งไว้จริงหรือไม่
 * อ่านอย่างเดียว ไม่แก้ข้อมูล
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';

(async () => {
  const [categories, statuses, transitions] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } }),
    prisma.status.findMany({ select: { id: true, code: true, displayName: true, isInitialState: true } }),
    prisma.workflowTransition.findMany({
      include: {
        currentStatus: { select: { code: true, displayName: true } },
        nextStatus: { select: { code: true, displayName: true } },
        action: { select: { actionName: true, displayName: true } },
        requiredRole: { select: { roleName: true } },
      },
      orderBy: [{ categoryId: 'asc' }, { stepSequence: 'asc' }],
    }),
  ]);

  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const initial = statuses.find((s) => s.isInitialState);
  console.log(`สถานะเริ่มต้น: ${initial?.displayName ?? '(ไม่ได้ตั้ง)'} [${initial?.code ?? '-'}]`);
  console.log(`WorkflowTransition ทั้งหมด ${transitions.length} รายการ\n`);

  for (const category of categories) {
    const rows = transitions.filter((t) => t.categoryId === category.id);
    console.log('═'.repeat(78));
    console.log(`หมวด: ${category.name}  (transition ${rows.length} รายการ)`);
    console.log('═'.repeat(78));
    if (rows.length === 0) {
      console.log('  ⚠ ไม่มี transition — คำร้องหมวดนี้จะค้างทันทีที่ยื่น\n');
      continue;
    }

    // เดินตามเส้นทางอนุมัติ (เฉพาะ action ที่ไม่ใช่ REJECT) ทีละขั้น
    let cursor = initial?.id;
    const seen = new Set<number>();
    let step = 0;
    while (cursor != null && !seen.has(cursor)) {
      seen.add(cursor);
      const forward = rows.filter(
        (t) => t.currentStatusId === cursor && t.action.actionName !== 'REJECT'
      );
      if (forward.length === 0) break;
      step += 1;
      for (const t of forward) {
        const dept = t.filterByDepartment ? ' (เฉพาะแผนกเดียวกัน)' : '';
        console.log(
          `  ${String(step).padStart(2)}. ${t.currentStatus.displayName}` +
            `\n      → ${t.requiredRole.roleName}${dept} กด "${t.action.displayName}"` +
            `\n      → ${t.nextStatus.displayName} [${t.nextStatus.code}]`
        );
      }
      cursor = forward[0].nextStatusId;
    }

    const last = cursor != null ? statusById.get(cursor) : undefined;
    console.log(`  ปลายทาง: ${last?.displayName ?? '(ไม่ทราบ)'} [${last?.code ?? '-'}]`);

    // ขั้นที่กดปฏิเสธได้
    const rejectable = rows
      .filter((t) => t.action.actionName === 'REJECT')
      .map((t) => t.currentStatus.displayName);
    console.log(`  กดปฏิเสธ/ส่งกลับได้ที่: ${rejectable.length ? [...new Set(rejectable)].join(', ') : '— ไม่มี —'}`);

    // transition ที่ผูกกับประเภทการแก้ไขโดยเฉพาะ
    const scoped = rows.filter((t) => t.correctionTypeId != null);
    if (scoped.length > 0) {
      console.log(`  มี transition เฉพาะประเภทการแก้ไข ${scoped.length} รายการ`);
    }
    console.log('');
  }

  const scopedTotal = transitions.filter((t) => t.correctionTypeId != null).length;
  console.log('─'.repeat(78));
  console.log(`transition ที่ผูกกับประเภทการแก้ไขโดยเฉพาะ ทั้งระบบ: ${scopedTotal} รายการ`);
  process.exit(0);
})();
