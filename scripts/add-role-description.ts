/**
 * เพิ่มคอลัมน์ description ในตาราง Role (ใช้เมื่อ npx prisma db push error)
 * รัน: npx tsx scripts/add-role-description.ts
 */
import { prisma } from '../lib/prisma';

async function main() {
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE Role ADD COLUMN description TEXT');
    console.log('✅ เพิ่มคอลัมน์ Role.description เรียบร้อย');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate column name')) {
      console.log('ℹ️ คอลัมน์ description มีอยู่แล้ว');
    } else {
      throw e;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
