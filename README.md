# REQUESTONLINE

ระบบคำร้องขอแก้ไขข้อมูลออนไลน์ (แบบฟอร์ม F07) พร้อมขั้นตอนอนุมัติหลายระดับ — ผู้ขอ → หัวหน้า → บัญชี → ผู้อนุมัติสูงสุด → IT → (บัญชีตรวจซ้ำ ตามที่ผู้ขอเลือก) → IT Reviewer ปิดงาน
ส่วนหน้าเว็บและข้อความเป็นภาษาไทย

**Stack:** Next.js 16 (App Router, webpack) · TypeScript · Prisma + **SQL Server** (`@prisma/adapter-mssql`) · NextAuth (Credentials) · Vitest · Playwright

> branch ที่พัฒนาอยู่คือ `mssql-migration` — `master` ยังเป็นเวอร์ชัน PostgreSQL และไม่มี commit ที่ branch นี้ไม่มี

## เริ่มใช้งานในเครื่อง

ต้องมี SQL Server ที่เข้าถึงได้ และ Node.js ≥ 20.9 (ข้อกำหนดของ Next.js; ที่ใช้พัฒนาและทดสอบคือ 22.15)

```powershell
npm install
copy .env.example .env        # แล้วแก้ MSSQL_*, NEXTAUTH_SECRET, อีเมล
```

สร้างฐานข้อมูลและข้อมูลตั้งต้นตาม [docs/DB-RESET-SEED.md](docs/DB-RESET-SEED.md) (ฐานใหม่ = baseline SQL + `npm run seed`)
จากนั้น:

```powershell
npm run dev                   # http://localhost:3000
```

ผู้ใช้ตัวอย่างจาก seed (รหัสผ่าน `1234` ทุกคน — เปลี่ยนก่อนใช้จริง): `req_cane` (ผู้ขอ), `head_cane` (หัวหน้า), `accountant`, `final`, `it_operator`, `it_reviewer`, `admin`

> ลองมือกับ `npm run dev` ใช้ฐานข้อมูลและ mail API จาก `.env` ตรงๆ — ถ้า `.env` ชี้ mail API จริง ทุกการอนุมัติจะส่งเมลจริง
> ดู [docs/e2e-testing.md](docs/e2e-testing.md)

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` / `build` / `start` | dev server / build / production server |
| `npm test` | unit test (Vitest เฉพาะ `lib/**`, ไม่แตะฐานข้อมูล) |
| `npx tsc --noEmit` | ตรวจ type (ไม่มีสคริปต์แยก) |
| `npm run lint` | ESLint |
| `npm run build && npm run test:e2e` | E2E ด้วย Playwright — **เขียนข้อมูลลงฐานที่ `.env` ชี้อยู่** อ่าน [docs/e2e-testing.md](docs/e2e-testing.md) ก่อน |
| `npm run create-admin` | สร้างบัญชี Admin |

`npm run db:reset` **ล้างฐานข้อมูลทั้งหมด** — อย่ารันกับฐานที่มีข้อมูลจริง

## ก่อนแก้ฐานข้อมูล / ก่อน deploy — อ่านนี่

การเปลี่ยนโครงสร้างฐานข้อมูลทำด้วย SQL (`prisma/migrations/add_*.sql`) ผ่าน SSMS **ไม่ใช่** `prisma migrate` และมี**ลำดับที่ต้องทำตาม**
โค้ดที่อ่านคอลัมน์ใหม่จะพังทุกหน้า (500 ที่ `/api/app/shell`) ถ้ายังไม่ได้รัน SQL บนฐานนั้น และ process ที่เปิดอยู่ก่อน `prisma generate` ต้องรีสตาร์ท
ขั้นตอน สำรอง/กู้คืน และลำดับสคริปต์: [docs/DB-MIGRATION-RUNBOOK.md](docs/DB-MIGRATION-RUNBOOK.md)

Production รันด้วย PM2 บน Windows server (`ecosystem.config.cjs`) ตั้ง `NEXT_PUBLIC_APP_URL` ให้เป็นที่อยู่จริงที่ผู้ใช้เปิด ไม่เช่นนั้นลิงก์ในอีเมลชี้ผิดเครื่อง
สำรองโฟลเดอร์ `uploads/` พร้อมฐานข้อมูลเสมอ (ไฟล์แนบไม่ได้อยู่ในฐานข้อมูล)

## เอกสาร

| เอกสาร | เนื้อหา |
|---|---|
| [CLAUDE.md](CLAUDE.md) | สถาปัตยกรรม, workflow engine (เวอร์ชัน/รอบพิจารณา/เงื่อนไข), การอนุมัติและ concurrency — ฉบับที่ตรงกับโค้ดปัจจุบันที่สุด |
| [docs/IMPROVEMENT-PLAN.md](docs/IMPROVEMENT-PLAN.md) | รายการงานที่ทำแล้ว/ยังค้าง และสิ่งที่ตรวจแล้วจริงกับ SQL Server |
| [docs/DB-MIGRATION-RUNBOOK.md](docs/DB-MIGRATION-RUNBOOK.md) | ลำดับ migration, สำรอง/กู้คืน, ค่าฐานข้อมูลที่ต้องตั้ง |
| [docs/DB-RESET-SEED.md](docs/DB-RESET-SEED.md) | สร้างฐานใหม่และ seed |
| [docs/e2e-testing.md](docs/e2e-testing.md) | วิธีรัน E2E และสิ่งที่ครอบคลุม |
| [docs/PDF-THAI.md](docs/PDF-THAI.md) | PDF และภาษาไทย (ข้อจำกัดของ PDF ฝั่งเซิร์ฟเวอร์) |
| `docs/คู่มือการใช้งาน-*.md` | คู่มือผู้ขอ / ผู้อนุมัติ |

เอกสารที่ลงวันที่ ก.พ. 2026 (`BACKEND_REFERENCE`, `REQUEST-APPROVAL-FLOW`, `FRONTEND_REFERENCE`, `CONTEXT_MAPPING`, `ROLE_MODULE_IMPLEMENTATION`, `WORKFLOW-ADMIN-VS-TRANSITIONS`, `WORKFLOW-SEED-COMPLIANCE`, `WORKFLOW-TRANSITIONS-VERIFICATION`)
เขียนก่อนระบบเวอร์ชัน workflow, เงื่อนไข `requiresAccountRecheck` และรอบพิจารณา (`approvalRound`) — ตรวจแล้วไม่มีฉบับไหนกล่าวถึงสามเรื่องนี้เลย
(บางฉบับพูดถึง SQL Server แต่ในฐานะระบบเก่าที่เอกสารเทียบเคียง ไม่ใช่ฐานข้อมูลปัจจุบันของโปรเจกต์นี้) ใช้เป็นบันทึกการออกแบบเดิม ไม่ใช่ข้อเท็จจริงปัจจุบัน
ให้ดู `prisma/schema.prisma`, `CLAUDE.md` และโค้ดใน `lib/` แทน
