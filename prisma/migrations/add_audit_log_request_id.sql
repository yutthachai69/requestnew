-- เพิ่ม requestId ใน AuditLog เพื่อเชื่อมประวัติการอนุมัติกับคำร้อง
ALTER TABLE AuditLog ADD COLUMN requestId INTEGER REFERENCES ITRequestF07(id) ON DELETE SET NULL;
