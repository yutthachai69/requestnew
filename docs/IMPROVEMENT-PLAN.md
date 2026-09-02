# แผนปรับปรุง RequestOnline

## เป้าหมาย

ทำให้ระบบปลอดภัยและพร้อมใช้งานจริงมากขึ้น โดยรักษา workflow เดิม ลดความเสี่ยงข้อมูลผิดสถานะ ลดปัญหาการอนุมัติซ้ำ และทำให้การ deploy/ดูแลระบบตรวจสอบได้

## สถานะปัจจุบัน

งาน P0 และ P1 ดำเนินการแล้ว:

- ตรวจสิทธิ์ session จากฐานข้อมูลทุก request และป้องกันบัญชีที่ถูกปิดใช้งาน
- ผูกการอนุมัติกับ role, workflow, แผนก และ special approver
- รวม bulk approve/reject เข้ากับ approval service เดียวกับรายการเดี่ยว
- จำกัดการเข้าถึงคำร้อง ไฟล์แนบ และ PDF ตามเจ้าของ/ผู้อนุมัติ
- ป้องกันการแนบหรือลบ path ไฟล์ของคำร้องอื่น
- ใช้ atomic document-number increment, serializable transaction และ retry เมื่อเกิด SQL Server write conflict
- เพิ่ม unique index `DocConfig(categoryId, year)` ใน dev และสร้าง SQL Server baseline/runbook
- global rate limit ไม่ใช้ `x-forwarded-for` ที่ผู้ใช้ปลอมได้เป็น identity แล้ว
- เพิ่ม negative และ concurrent E2E tests
- นำ Power Automate integration ที่ไม่ได้ใช้ออกแล้ว

## แผนงานตามลำดับความสำคัญ

### P2 — Database และความพร้อมใช้งานร่วมกัน

1. แก้ migration ให้เป็น SQL Server ทั้งหมด
   - ตรวจ migration เดิมที่ยังใช้ syntax ของ PostgreSQL
   - สร้าง baseline/migration ใหม่สำหรับ SQL Server
   - เพิ่ม unique constraint ของ `DocConfig(categoryId, year)` และตรวจ duplicate data ก่อน apply
   - ทดสอบ `migrate deploy`, `db push` ใน dev และ rollback procedure

2. ทดสอบ backup/restore
   - กำหนดรอบ backup และ retention
   - restore ลงฐานข้อมูลทดสอบ
   - ตรวจจำนวนคำร้อง, audit log, approval history และไฟล์แนบหลัง restore
   - บันทึกเวลาที่ใช้และจุดกู้คืนที่ยอมรับได้

3. ย้าย state ที่ไม่ควรอยู่ใน memory
   - rate limit ไป Redis หรือ shared store
   - session/cache ให้ใช้ shared storage เมื่อรันหลาย instance
   - ไม่เชื่อ `x-forwarded-for` โดยตรงจนกว่าจะกำหนด trusted proxy

### P2 — Monitoring และความทนทาน

4. เพิ่ม observability
   - request/correlation ID
   - structured log สำหรับ auth, workflow, database และ notification
   - metric: latency, 4xx/5xx, deadlock, failed email, failed upload
   - alert สำหรับ error rate และ transaction conflict

5. ปรับ error handling
   - ไม่เปิดเผยรายละเอียดฐานข้อมูลใน response
   - แยก error ที่ retry ได้กับ retry ไม่ได้
   - กำหนด timeout ของ email, PDF และ file operation
   - cleanup ไฟล์ที่ upload สำเร็จแต่ transaction ไม่สำเร็จ

6. เพิ่ม test coverage
   - integration test ของ approval service กับ SQL Server
   - concurrent create/action test
   - authorization regression test ทุก protected API
   - upload type, size, magic-byte และ traversal test
   - load test สำหรับ dashboard, pending tasks และ bulk action

### P3 — CI และ Production readiness

7. แก้ lint และ CI
   - แก้ ESLint plugin/rule mismatch
   - pipeline: lint → typecheck → unit → build → E2E
   - แยก test database และห้ามใช้ข้อมูล production ใน E2E

8. จัดทำ production deployment checklist
   - secrets จาก secret manager ไม่เก็บใน repository
   - ตั้ง `NEXTAUTH_SECRET`, database credentials และ email credentials จริง
   - ปิดหรือจำกัด dev accounts และ default passwords
   - ตั้ง trusted proxy, HTTPS, security headers และ upload storage
   - ตรวจ email/webhook endpoint และ retry policy

9. จัดทำ rollback และ runbook
   - rollback application version
   - rollback database migration ที่ทดสอบแล้ว
   - restore backup
   - ปิด notification ชั่วคราวเมื่อ provider มีปัญหา
   - ช่องทางแจ้ง incident และผู้รับผิดชอบ

## เกณฑ์รับงานก่อน production

- TypeScript, lint, unit, integration และ E2E ผ่านใน CI
- ไม่มี high/critical authorization หรือ data exposure finding
- concurrent create ได้เลขคำขอไม่ซ้ำ
- concurrent action ไม่ทำให้สถานะข้ามขั้นหรือเกิด 500
- requester อ่านได้เฉพาะคำร้องและไฟล์ของตนเอง
- backup restore ทดสอบสำเร็จและมีผลลัพธ์บันทึกไว้
- มี monitoring, alert, rollback และ owner ที่ชัดเจน
- ไม่มี default password หรือ secret ใน repository

## ลำดับการทำงานถัดไป

1. ทำ SQL Server migration/baseline และตรวจ duplicate `DocConfig`
2. ทดสอบ backup/restore
3. เปลี่ยน rate limit/cache เป็น shared storage
4. เพิ่ม integration/load/security regression tests
5. แก้ CI/lint และทำ production checklist
