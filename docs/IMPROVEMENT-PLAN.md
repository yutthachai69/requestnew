# แผนปรับปรุง RequestOnline

## เป้าหมาย

ทำให้ระบบปลอดภัยและพร้อมใช้งานจริงมากขึ้น โดยรักษา workflow เดิม ลดความเสี่ยงข้อมูลผิดสถานะ ลดปัญหาการอนุมัติซ้ำ และทำให้การ deploy/ดูแลระบบตรวจสอบได้

## สถานะปัจจุบัน

### ผลตรวจล่าสุด — 5 กันยายน 2569

ตรวจจากโค้ดใน working tree ปัจจุบัน: Unit test ผ่าน 70 ข้อ ข้าม DB test 2 ข้อ, TypeScript ผ่าน และ lint มี 112 warnings ไม่มี errors ยังไม่ได้ยืนยันผ่าน browser, integration test หรือฐานข้อมูลจริงในรอบนี้

รายการด้านล่างเป็นแผนงาน ยังไม่ได้แก้โค้ดหรือเปลี่ยนฐานข้อมูล ลำดับเร่งด่วนรอบนี้ให้ใช้ระยะ 1–5 แทนลำดับ P2/P3 เดิมท้ายเอกสาร

### งานจากรอบก่อน

เอกสารเดิมบันทึกว่างาน P0 และ P1 ต่อไปนี้ดำเนินการแล้ว ไม่ถือเป็นผลรับรองการทดสอบซ้ำในรอบล่าสุด:

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

## แผนดำเนินการรอบล่าสุด

### ระยะ 1 — รักษาคำร้องและไฟล์แนบ (เร่งด่วนที่สุด)

ไฟล์หลัก: `app/actions/f07-action.ts`, `app/api/requests/[id]/route.ts`, `lib/services/approvalService.ts`

- [x] แยกขอบเขต transaction บันทึกคำร้องออกจากงานแจ้งเตือน ลบไฟล์ที่เพิ่งอัปโหลดเฉพาะเมื่อการบันทึกไม่สำเร็จ
- [x] เมื่อบันทึกหรืออนุมัติสำเร็จแล้ว แต่แจ้งเตือนล้มเหลว ให้ตอบผลสำเร็จของคำร้อง พร้อมบันทึกข้อผิดพลาดการแจ้งเตือนแยกต่างหาก
- [x] ตรวจไฟล์ทั้งหมดก่อนสร้างคำร้อง ไม่กลืนข้อผิดพลาดอัปโหลดจนผู้ใช้เข้าใจว่าแนบครบแล้ว
- [x] เมื่อแก้ข้อมูลผ่าน JSON โดยไม่ระบุการเปลี่ยนไฟล์ ให้เก็บ attachmentPath เดิม
- [x] บันทึกการเปลี่ยนรายการไฟล์ให้สำเร็จก่อนลบไฟล์เดิม หากบันทึกล้มเหลวให้เก็บไฟล์เดิมและเก็บกวาดเฉพาะไฟล์ใหม่ที่ไม่ถูกอ้างอิง

เกณฑ์ตรวจรับ:

- จำลอง notification ล้มเหลวหลัง commit: คำร้องยังอยู่ ไฟล์เปิดได้ และ response ไม่ชวนให้ผู้ใช้ส่งซ้ำ
- จำลอง DB ล้มเหลวก่อน commit: ไม่มีคำร้องค้างและไม่มีไฟล์ใหม่กำพร้า
- แก้เฉพาะรายละเอียดด้วย JSON: ไฟล์เดิมครบ
- อัปโหลดไฟล์ไม่ผ่าน validation หรือบันทึกการแก้ไขล้มเหลว: ไฟล์เดิมไม่ถูกลบ

### ระยะ 2 — ป้องกันแก้ไขชนกับอนุมัติ

ขึ้นกับระยะ 1; ไฟล์หลัก: API แก้คำร้องและ approval service

- [x] ใช้ optimistic concurrency ที่ตรวจ timestamp ของข้อมูลตอนเขียนจริงสำหรับการแก้ไข และ conditional status update สำหรับการอนุมัติ เพื่อไม่ให้เขียนทับข้อมูลที่เปลี่ยนไปแล้ว
- [x] รวมการส่งใหม่ การปรับสถานะ และ Audit log ใน transaction เดียว
- [x] เมื่อข้อมูลเปลี่ยนไปแล้ว ให้ตอบ HTTP 409 พร้อมข้อความให้โหลดข้อมูลล่าสุด
- [x] ตรวจการส่งซ้ำและ retry ไม่ให้สร้างผลการอนุมัติหรือประวัติซ้ำ

เกณฑ์ตรวจรับ: ทดสอบกับ SQL Server โดยให้แก้ไขและอนุมัติพร้อมกัน รวมถึงส่งใหม่พร้อมกันสองหน้าจอ ต้องมีเพียงผลที่สอดคล้องกัน ไม่มีสถานะย้อนกลับ ไม่มีการเขียนทับข้อมูลที่อนุมัติแล้ว และไม่มีประวัติหายจาก transaction ที่ทำได้บางส่วน

ผลตรวจ 5 กันยายน 2569 (SQL Server จริง, คำร้อง IT-F07-GN-69-002): ยิงอนุมัติพร้อมกัน 3 request ด้วย version เดียวกัน ได้ 200 หนึ่งครั้งและ 409 สองครั้ง ใน DB เหลือ ApprovalHistory 1 แถวและ AuditLog 1 แถว สถานะเดินหน้าครั้งเดียว ส่วน version เก่าถูกปฏิเสธด้วย 409 ก่อนเขียนใดๆ

### ระยะ 3 — เก็บประวัติรายรอบและแจ้งผู้รับให้ตรง Workflow

ขึ้นกับระยะ 2; ต้องมี schema migration และปรับทุกจุดที่อ่าน ApprovalHistory

- [x] เพิ่มตัวระบุรอบพิจารณาให้คำร้องและประวัติ แทนการลบประวัติเดิมเมื่อส่งใหม่
- [x] กำหนดค่าเริ่มต้น `approvalRound = 1` ให้ข้อมูลเดิมอย่างชัดเจน พร้อม migration SQL Server
- [x] การตรวจอนุมัติซ้ำและอนุมัติครบให้นับเฉพาะรอบปัจจุบัน ส่วนหน้าประวัติและรายงานที่อ่าน Audit log ยังเห็นเหตุการณ์เดิมได้
- [x] ส่ง workflowVersionId, correctionTypeIds และ requiresAccountRecheck ของคำร้องให้ตัวหาผู้อนุมัติ ทั้งตอนสร้าง ส่งใหม่ และเปลี่ยนสถานะ
- [~] ใช้กฎเดียวกันสำหรับสิทธิ์ ปุ่มดำเนินการ รายการงานรอ และรายชื่อผู้รับแจ้งเตือน — สิทธิ์กับปุ่มดำเนินการใช้ `filterTransitionsForActor` ตัวเดียวกันแล้ว ส่วนรายการงานรอ (`lib/pending-tasks-shared.ts`) และผู้รับแจ้งเตือน (`getNextApproversForStatus`) ยังเป็นคนละ query ที่ให้กฎตรงกันแต่ยังไม่ได้รวมเป็นตัวเดียว
- [x] สร้างแจ้งเตือนในระบบได้แม้ผู้รับไม่มีอีเมล และแจ้ง Admin หากไม่มีผู้รับที่ทำงานขั้นนั้นได้

เกณฑ์ตรวจรับ:

- ส่งกลับ → แก้ไข → ส่งใหม่ → อนุมัติครบ: ประวัติทั้งสองรอบยังอยู่ และผลรอบเก่าไม่ถูกนับในรอบใหม่
- เผยแพร่ Workflow ใหม่ระหว่างคำร้องเก่าค้างอยู่: คำร้องเก่ายังใช้เวอร์ชันเดิม รวมถึงผู้รับแจ้งเตือน
- ทดสอบประเภทการแก้ไขเฉพาะ แผนก ผู้อนุมัติพิเศษ และผู้รับไม่มีอีเมล

### ระยะ 4 — ทำ Workflow และการแจ้งเตือนให้ตรวจสอบได้

- [ ] ตรวจเส้นทางที่เผยแพร่ในฐานข้อมูลจริงแบบอ่านอย่างเดียวก่อนแก้กฎ เทียบหน้าแบบฟอร์ม seed และเอกสาร โดยเฉพาะตัวเลือกบัญชีรอบสอง
- [x] Validator ตรวจทั้ง requiresAccountRecheck=true/false ว่าไปถึงปลายทางได้ และรายงานทางตัน/ลูปแยกตาม branch
- [ ] ทดสอบ Workflow template, override ตามหมวด/ประเภท และคำร้องที่ผูกเวอร์ชันเดิม
- [ ] เพิ่มคิวแจ้งเตือนแบบถาวร (outbox) บันทึกพร้อม transaction มีสถานะส่ง จำนวนครั้งที่ลอง ข้อผิดพลาดล่าสุด และการส่งใหม่ที่ป้องกันซ้ำ
- [ ] แสดงคำร้องค้างไม่มีผู้รับและงานแจ้งเตือนล้มเหลวให้ Admin ติดตาม

เกณฑ์ตรวจรับ: ทั้งสองเส้นทางบัญชีจบได้จริง; หยุดตัวส่งแจ้งเตือนแล้วเปิดใหม่ งานที่ค้างต้องถูกส่งต่อได้โดยไม่เปลี่ยนสถานะคำร้องซ้ำ

### ระยะ 5 — ตรวจครบโฟลและเตรียมส่งมอบ

- [ ] ทดสอบบนฐานข้อมูลและพื้นที่ไฟล์ทดสอบแยก ใช้ email sink ไม่ส่งอีเมลถึงผู้ใช้งานจริง
- [x] E2E: ผู้ขอ → หัวหน้า → บัญชี → ผู้อนุมัติสูงสุด → IT → บัญชีรอบสองตามเงื่อนไข → IT Reviewer → ปิดงาน — ทดสอบจริงบน SQL Server เมื่อ 8 ก.ย. 2569 ทั้งสอง branch (ตรวจบัญชีรอบสอง/ข้าม) จนปิดงานสำเร็จ history/audit/notification ครบ
- [x] E2E: ส่งกลับจากแต่ละขั้น ส่งใหม่ — reject→แก้ไข→resubmit→อนุมัติรอบใหม่ ทดสอบแล้ว round เพิ่มถูกต้อง ประวัติรอบเก่าไม่หาย
- [x] E2E: อนุมัติผ่านอีเมลและ bulk action รวมถึงผู้ใช้ผิดสิทธิ์ — ทดสอบจริงเมื่อ 1 ต.ค. 2569:
  - ลิงก์อีเมล (`/approve/[token]`) อนุมัติสำเร็จ, token ถูกยกเลิกหลังใช้; พบจุดอ่อน UX เล็กน้อย (ไม่ใช่ช่องโหว่) — หน้าไม่กรองปุ่มตามสิทธิ์ผู้ดู ผู้ใช้ผิด role เห็นปุ่มอนุมัติได้แต่กดแล้วเซิร์ฟเวอร์ปฏิเสธถูกต้อง
  - bulk-action: อนุมัติ 2/3 สำเร็จ ตัวที่ version ไม่ตรงถูกข้ามเป็น CONFLICT โดยไม่กระทบ 2 ตัวที่เหลือ, role ไม่มีสิทธิ์ถูกบล็อกทั้งคำขอ (403), reject ไม่มี comment ถูกบล็อก (400)
  - ผู้ใช้ผิดสิทธิ์: GET/PUT/action บนคำร้องคนอื่นถูกปฏิเสธครบ (403/403/403) ไม่มีการรั่วข้อมูลหรือแก้ไขได้
- [x] ตรวจหน้าจอมือถือ รายการงานรอ ประวัติ และ PDF หลังผ่านหลายรอบ — ตรวจเมื่อ 1 ต.ค. 2569 (viewport 375×667, คำร้องที่ผ่าน 2 รอบจนปิดงาน):
  - **พบและแก้บั๊กจริง:** เมนูแฮมเบอร์เกอร์บนมือถือกดแล้วไม่เปิด — `useEffect` ใน `AppSidebar` เรียก `closeMobile()` ทุกครั้งที่ mount และ drawer สร้าง `AppSidebar` ตัวใหม่ทุกครั้งที่เปิด จึงปิดตัวเองทันที ผู้ใช้มือถือเข้าเมนูใดไม่ได้เลย (พิสูจน์ด้วย MutationObserver: `<aside>` 2→1 ในเสี้ยววินาที) แก้ให้ปิดเฉพาะเมื่อ pathname เปลี่ยนจริง ตรวจซ้ำแล้วเปิดค้างได้และปิดเองเมื่อกดลิงก์
  - ประวัติ/หลักฐานรอบปัจจุบันถูกต้อง: `currentRoundHistory` 6 แถว, ประวัติรวม 8 แถว; หน้า print แสดงผู้ตรวจสอบ/บัญชี/ผู้อนุมัติตรงกับรอบ 2
  - PDF ฝั่ง client (html2canvas+jsPDF, ปุ่ม "ดาวน์โหลด PDF") ดาวน์โหลดได้ ไม่มี error; PDF ฝั่งเซิร์ฟเวอร์ (`/api/requests/[id]/pdf`, pdf-lib) สร้างได้และ layout ครบ แต่ยังมีปัญหา Thai shaping ตามที่บันทึกใน `docs/PDF-THAI.md` (วรรณยุกต์/สระซ้อน ข้อความที่ดึงออกมาเพี้ยน) — ข้อจำกัดเดิม ยังไม่แก้
  - รายการงานรอ: ตาราง 7 คอลัมน์เลื่อนแนวนอนได้และปุ่ม "อนุมัติ/ดำเนินการ" เอื้อมถึง แต่อยู่ไกลสุดขอบขวาไม่มีสัญญาณว่าปัดได้ (เลขที่เอกสารยังตัดบรรทัดทุกขีด) — แก้แล้ว: จอต่ำกว่า md แสดงเป็น card (ปุ่ม "อนุมัติ/ดำเนินการ" เต็มความกว้างอยู่ในการ์ด, เลือกแบบกลุ่มได้) จอ md ขึ้นไปยังเป็นตารางเดิม ตรวจจริงที่ 375px และ 1280px
- [ ] รัน lint, typecheck, unit, integration, build และ E2E ที่สัมพันธ์กับงาน แก้ warnings ที่กระทบพฤติกรรมก่อนงานจัดรูปแบบ
- [ ] ปรับ README, CLAUDE.md และเอกสาร Flow ให้ตรง SQL Server และ Workflow versioning
- [ ] ทดสอบ migration และ backup/restore ทั้ง DB และ uploads ในสภาพแวดล้อมทดสอบ พร้อมบันทึกวิธีย้อนกลับและข้อจำกัดของ schema ใหม่

เกณฑ์ส่งมอบ: ระยะ 1–4 ผ่านเกณฑ์ตรวจรับ มีผลทดสอบโฟลหลัก/กรณีล้มเหลว และคู่มือ deploy/กู้คืนที่ตรวจสอบแล้ว จึงเตรียมการนำขึ้นระบบจริงเป็นงานแยก

## ชุดงานแรกที่เริ่มได้ทันที

1. ทำระยะ 1 เป็นชุดแก้ไขขนาดเล็ก พร้อม regression test จำลองบันทึกสำเร็จแต่แจ้งเตือนพัง และแก้ JSON โดยคงไฟล์เดิม
2. ทำระยะ 2 พร้อม SQL Server concurrency test
3. ~~ตรวจสอบผลกระทบกับฐานข้อมูลจริง แล้ว apply `add_approval_round.sql`~~ — รันกับ DB dev (`localhost/requestonline`) แล้วเมื่อ 5 กันยายน 2569 คำร้องเดิมได้ `approvalRound = 1` ทั้งหมด **ยังไม่ได้รันบน staging/production** ต้องรันแยกตอน deploy

> หมายเหตุ deploy: ก่อน migration นี้ถูกรัน โค้ดจะพังทั้งระบบ ไม่ใช่แค่ feature ใหม่ — `/api/app/shell` (badge งานรอ + แจ้งเตือนบน header) คืน 500 ทุกหน้า เพราะ `lib/pending-tasks-shared.ts` select `approvalRound` ตรงๆ ดังนั้นต้องรัน SQL ก่อนปล่อยโค้ด และหลัง migration ต้องรีสตาร์ท process ที่ถือ Prisma Client เก่าไว้ด้วย

ไม่จำเป็นต้องรอเก็บ lint warnings ทั้งหมดหรือเพิ่มระบบหลาย instance ก่อนแก้ความเสี่ยงข้อมูลเหล่านี้

## งานโครงสร้างพื้นฐานจากแผนเดิม

เก็บเป็น backlog ต่อเนื่อง ตรวจสถานะจริงก่อนเริ่มเพื่อไม่ทำซ้ำ โดย shared storage ให้พิจารณาเมื่อมีแผนรันหลาย instance

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

## ลำดับงานโครงสร้างพื้นฐานหลังแก้ความเสี่ยงข้อมูล

1. ทำ SQL Server migration/baseline และตรวจ duplicate `DocConfig`
2. ทดสอบ backup/restore
3. เปลี่ยน rate limit/cache เป็น shared storage
4. เพิ่ม integration/load/security regression tests
5. แก้ CI/lint และทำ production checklist
