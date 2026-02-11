-- อัปเดต schema สำหรับ Workflow (FilterByDepartment + SpecialApproverMapping)
-- ใช้เมื่อมี Drift และไม่อยาก reset DB — รันด้วย sqlite3 หรือใช้เป็น reference

-- 1. เพิ่มคอลัมน์ filterByDepartment ใน WorkflowStep (SQLite)
ALTER TABLE WorkflowStep ADD COLUMN filterByDepartment BOOLEAN NOT NULL DEFAULT 0;

-- 2. สร้างตาราง SpecialApproverMapping
CREATE TABLE SpecialApproverMapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    categoryId INTEGER NOT NULL,
    stepSequence INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    FOREIGN KEY (categoryId) REFERENCES Category(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE(categoryId, stepSequence)
);

CREATE INDEX SpecialApproverMapping_categoryId_idx ON SpecialApproverMapping(categoryId);
CREATE INDEX SpecialApproverMapping_userId_idx ON SpecialApproverMapping(userId);
