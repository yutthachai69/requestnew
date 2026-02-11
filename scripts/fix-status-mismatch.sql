-- Fix script: อัปเดต currentStatusId ของ requests ที่มี status ค้างอยู่ให้ตรงกับ Status table

-- 1. แสดงข้อมูลก่อนแก้
SELECT r.id, r."workOrderNo", r.status, r."currentStatusId", s.code as "statusCode", s."displayName"
FROM "ITRequestF07" r
LEFT JOIN "Status" s ON r."currentStatusId" = s.id
ORDER BY r.id;

-- 2. อัปเดต requests ที่ status = 'PENDING' แต่ currentStatusId ไม่ตรง
UPDATE "ITRequestF07" r
SET "currentStatusId" = (SELECT id FROM "Status" WHERE code = 'PENDING')
WHERE r.status = 'PENDING' 
  AND r."currentStatusId" != (SELECT id FROM "Status" WHERE code = 'PENDING');

-- 3. อัปเดต requests ที่ status = 'CLOSED' แต่ currentStatusId ไม่ตรง
UPDATE "ITRequestF07" r
SET "currentStatusId" = (SELECT id FROM "Status" WHERE code = 'CLOSED')
WHERE r.status = 'CLOSED' 
  AND r."currentStatusId" != (SELECT id FROM "Status" WHERE code = 'CLOSED');

-- 4. อัปเดต requests ที่ status = 'REJECTED' แต่ currentStatusId ไม่ตรง
UPDATE "ITRequestF07" r
SET "currentStatusId" = (SELECT id FROM "Status" WHERE code = 'REJECTED')
WHERE r.status = 'REJECTED' 
  AND r."currentStatusId" != (SELECT id FROM "Status" WHERE code = 'REJECTED');

-- 5. แสดงผลหลังแก้
SELECT r.id, r."workOrderNo", r.status, r."currentStatusId", s.code as "statusCode", s."displayName"
FROM "ITRequestF07" r
LEFT JOIN "Status" s ON r."currentStatusId" = s.id
ORDER BY r.id;
