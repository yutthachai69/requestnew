-- สร้างตาราง Status (รันเมื่อ db push ไม่ได้หรือต้องการอัปเดต DB เอง)
-- SQLite
CREATE TABLE IF NOT EXISTS "Status" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "code" TEXT NOT NULL UNIQUE,
  "displayName" TEXT NOT NULL,
  "colorCode" TEXT NOT NULL DEFAULT '#6b7280',
  "displayOrder" INTEGER NOT NULL DEFAULT 0
);
