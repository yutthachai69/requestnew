/**
 * สร้างตาราง CorrectionType และ _CategoryToCorrectionType (ใช้เมื่อ db push error)
 * รัน: npx tsx scripts/add-correction-type-tables.ts
 */
import { prisma } from '../lib/prisma';

const SQL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "CorrectionType" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "name" TEXT NOT NULL UNIQUE,
    "displayOrder" INTEGER NOT NULL DEFAULT 10,
    "isActive" INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS "_CategoryToCorrectionType" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    FOREIGN KEY ("A") REFERENCES "Category"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY ("B") REFERENCES "CorrectionType"("id") ON UPDATE CASCADE ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "_CategoryToCorrectionType_AB_unique" ON "_CategoryToCorrectionType"("A", "B")`,
  `CREATE INDEX IF NOT EXISTS "_CategoryToCorrectionType_B_index" ON "_CategoryToCorrectionType"("B")`,
];

async function main() {
  for (const sql of SQL_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('✅ รันสำเร็จ:', sql.slice(0, 50) + '...');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('already exists')) {
        console.log('ℹ️ มีอยู่แล้ว:', sql.slice(0, 50) + '...');
      } else {
        throw e;
      }
    }
  }
  console.log('✅ ตาราง CorrectionType และ _CategoryToCorrectionType พร้อมใช้งาน');
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
