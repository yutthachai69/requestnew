/**
 * สร้างตาราง CorrectionReason (ใช้เมื่อ db push error)
 * รัน: npx tsx scripts/add-correction-reason-table.ts
 */
import { prisma } from '../lib/prisma';

const SQL = `
CREATE TABLE IF NOT EXISTS "CorrectionReason" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "text" TEXT NOT NULL,
  "isActive" INTEGER NOT NULL DEFAULT 1
)
`;

async function main() {
  try {
    await prisma.$executeRawUnsafe(SQL);
    console.log('✅ ตาราง CorrectionReason พร้อมใช้งาน');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('already exists')) {
      console.log('ℹ️ ตาราง CorrectionReason มีอยู่แล้ว');
    } else {
      throw e;
    }
  }
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
