-- สร้างตาราง CorrectionType และ join table สำหรับ many-to-many กับ Category
-- ใช้เมื่อ npx prisma db push error (SQLite ไม่ให้ drop index ของ UNIQUE/PK)
-- รันผ่าน: npx tsx scripts/add-correction-type-tables.ts

-- ตารางประเภทการแก้ไข
CREATE TABLE IF NOT EXISTS "CorrectionType" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "name" TEXT NOT NULL UNIQUE,
  "displayOrder" INTEGER NOT NULL DEFAULT 10,
  "isActive" INTEGER NOT NULL DEFAULT 1
);

-- ตาราง join (Prisma implicit many-to-many: Category <-> CorrectionType)
-- ชื่อตารางเรียงตามตัวอักษร: _CategoryToCorrectionType, คอลัมน์ A = Category, B = CorrectionType
CREATE TABLE IF NOT EXISTS "_CategoryToCorrectionType" (
  "A" INTEGER NOT NULL,
  "B" INTEGER NOT NULL,
  FOREIGN KEY ("A") REFERENCES "Category"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY ("B") REFERENCES "CorrectionType"("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "_CategoryToCorrectionType_AB_unique" ON "_CategoryToCorrectionType"("A", "B");
CREATE INDEX IF NOT EXISTS "_CategoryToCorrectionType_B_index" ON "_CategoryToCorrectionType"("B");
