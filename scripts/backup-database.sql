/*
  Backup ฐานข้อมูล requestonline
  ------------------------------------------------------------------
  ฐานข้อมูลตั้ง recovery model = FULL อยู่แล้ว ซึ่งแปลว่า:
    - ต้อง backup log เป็นระยะ ไม่งั้น transaction log จะโตจนดิสก์เต็ม
    - แลกกับการที่กู้ย้อนไปยัง "จุดเวลา" ที่ต้องการได้ (point-in-time)

  ตั้งเป็น SQL Server Agent Job (ต้องสิทธิ์ Administrator):
    Job "RequestOnline - Full Backup"  ทุกวัน 01:00   → รัน STEP 1
    Job "RequestOnline - Log Backup"   ทุก 15 นาที    → รัน STEP 2

  ความถี่ของ log backup = ปริมาณข้อมูลที่ยอมเสียได้เมื่อระบบล่ม (RPO)
  ทุก 15 นาที หมายถึงเสียได้มากสุด 15 นาที

  ตรวจว่างานเดินจริงด้วย STEP 3 — ควรทำเป็น alert ด้วย เพราะ backup ที่
  เงียบ ๆ ไม่ทำงานคือความเสี่ยงที่มองไม่เห็นจนกว่าจะสาย
*/

-- ─── STEP 1: Full backup (รายวัน) ────────────────────────────────────────
DECLARE @fullPath nvarchar(500) =
    CONVERT(nvarchar(400), SERVERPROPERTY('InstanceDefaultBackupPath'))
    + N'requestonline_full_'
    + FORMAT(GETDATE(), 'yyyyMMdd_HHmmss') + N'.bak';

BACKUP DATABASE [requestonline]
TO DISK = @fullPath
WITH
    INIT,           -- เขียนทับไฟล์เดิมของวันนั้น
    CHECKSUM,       -- ตรวจ page checksum ระหว่าง backup — จับ corruption ตั้งแต่ต้นทาง
    COMPRESSION,    -- ไฟล์เล็กลงมาก และมักเร็วขึ้นด้วย
    STATS = 10;
GO

-- ─── STEP 2: Log backup (ทุก 15 นาที) ────────────────────────────────────
DECLARE @logPath nvarchar(500) =
    CONVERT(nvarchar(400), SERVERPROPERTY('InstanceDefaultBackupPath'))
    + N'requestonline_log_'
    + FORMAT(GETDATE(), 'yyyyMMdd_HHmmss') + N'.trn';

BACKUP LOG [requestonline]
TO DISK = @logPath
WITH CHECKSUM, COMPRESSION;
GO

-- ─── STEP 3: ตรวจสุขภาพ backup (ใช้ทำ alert) ─────────────────────────────
-- คืนแถวเมื่อ "มีปัญหา" เท่านั้น — ถ้าได้แถวออกมาแปลว่าต้องเข้าไปดู
SELECT
    d.name                                   AS database_name,
    MAX(CASE WHEN b.type = 'D' THEN b.backup_finish_date END) AS last_full_backup,
    MAX(CASE WHEN b.type = 'L' THEN b.backup_finish_date END) AS last_log_backup,
    DATEDIFF(HOUR, MAX(CASE WHEN b.type = 'D' THEN b.backup_finish_date END), GETDATE())   AS full_backup_age_hours,
    DATEDIFF(MINUTE, MAX(CASE WHEN b.type = 'L' THEN b.backup_finish_date END), GETDATE()) AS log_backup_age_minutes
FROM sys.databases d
LEFT JOIN msdb.dbo.backupset b ON b.database_name = d.name
WHERE d.name = N'requestonline'
GROUP BY d.name
HAVING
    -- ไม่เคย backup เลย หรือ full backup เก่ากว่า 26 ชั่วโมง
    MAX(CASE WHEN b.type = 'D' THEN b.backup_finish_date END) IS NULL
    OR DATEDIFF(HOUR, MAX(CASE WHEN b.type = 'D' THEN b.backup_finish_date END), GETDATE()) > 26
    -- หรือ log backup เก่ากว่า 60 นาที (ตั้งไว้ทุก 15 นาที)
    OR MAX(CASE WHEN b.type = 'L' THEN b.backup_finish_date END) IS NULL
    OR DATEDIFF(MINUTE, MAX(CASE WHEN b.type = 'L' THEN b.backup_finish_date END), GETDATE()) > 60;
GO

-- ─── STEP 4: ลบไฟล์ backup เก่ากว่า 14 วัน ───────────────────────────────
-- ต้องเปิด xp_cmdshell หรือใช้ Maintenance Plan / PowerShell แทน
-- ถ้าไม่ลบ ดิสก์จะเต็มในที่สุด ซึ่งทำให้ backup ล้มเงียบ ๆ
-- ทางเลือกที่ปลอดภัยกว่า: Task Scheduler รัน
--   Get-ChildItem 'C:\...\Backup' -Include *.bak,*.trn -Recurse |
--     Where-Object LastWriteTime -lt (Get-Date).AddDays(-14) | Remove-Item
