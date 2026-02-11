/**
 * เพิ่มคอลัมน์ templateString และ fieldsConfig ใน CorrectionType (ใช้เมื่อ db push error)
 * รัน: npx tsx scripts/add-correction-type-fields.ts
 */
import { prisma } from '../lib/prisma';

async function main() {
  const stmts = [
    'ALTER TABLE CorrectionType ADD COLUMN templateString TEXT',
    'ALTER TABLE CorrectionType ADD COLUMN fieldsConfig TEXT',
  ];
  for (const sql of stmts) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('✅ รันสำเร็จ:', sql.slice(0, 60) + '...');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('duplicate column name')) {
        console.log('ℹ️ คอลัมน์มีอยู่แล้ว:', sql.slice(0, 60) + '...');
      } else {
        throw e;
      }
    }
  }
  console.log('✅ CorrectionType.templateString และ fieldsConfig พร้อมใช้งาน');
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
