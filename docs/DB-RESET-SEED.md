# รีเซ็ตฐานข้อมูลและ Seed (SQL Server)

> **อันตราย:** `npm run db:reset` = `prisma db push --force-reset` + seed จะ**ล้างทุกตารางในฐานข้อมูลที่ `.env` ชี้อยู่**
> ตรวจ `MSSQL_DATABASE` ก่อนทุกครั้ง และห้ามรันกับฐานที่มีข้อมูลจริง

เอกสารฉบับก่อนเขียนไว้สมัยใช้ SQLite (`prisma/dev.db`) และบอกว่าเมื่อตาราง `WorkflowTransition` ว่างระบบจะ fallback ไปเดินแบบ Step+1 —
ทั้งสองข้อใช้ไม่ได้แล้ว: ฐานเป็น SQL Server และตอนนี้ถ้าหา transition ไม่เจอ ระบบจะตอบ `NO_TRANSITION` (ไม่เดาให้)

## สร้างฐานใหม่ที่ใช้งานได้ (แนะนำ)

ที่เครื่อง Windows นี้ Prisma schema engine ต่อ SQL Server ไม่ผ่าน (`P1011` ตอน TLS handshake — ดู `docs/DB-MIGRATION-RUNBOOK.md`)
จึงไม่ควรพึ่ง `db push` / `migrate` ให้ใช้ SQL ตรง:

1. สร้างฐานเปล่า แล้วรัน baseline:
   ```powershell
   sqlcmd -E -S localhost -Q "CREATE DATABASE requestonline_new"
   sqlcmd -E -S localhost -d requestonline_new -b -i prisma/sqlserver-baseline.sql
   ```
   (warning เรื่อง "maximum key length for a nonclustered index is 1700 bytes" ที่ขึ้นมีอยู่เดิม ไม่ใช่ความผิดพลาด)
2. ให้ผู้ใช้ที่แอปใช้ (`MSSQL_USER`) เป็นสมาชิกของฐานนั้น
3. ชี้ `MSSQL_DATABASE` ไปฐานใหม่ แล้ว seed:
   ```powershell
   $env:MSSQL_DATABASE = 'requestonline_new'
   npm run seed              # = tsx prisma/seed.ts (ตัวที่ตรวจแล้วว่าใช้ได้กับฐานนี้)
   ```
   (`npx prisma db seed` เรียก seed ตัวเดียวกันตาม `prisma.config.ts` แต่ยังไม่ได้ลองบนเครื่องนี้)

   หมายเหตุ: ถ้าต้องรัน `DELETE`/`UPDATE` ด้วย sqlcmd บนฐานนี้ให้ใส่ `-I` (เปิด `QUOTED_IDENTIFIER`) ไม่เช่นนั้นจะ error 1934 เพราะมี filtered index

baseline มีคอลัมน์ครบแล้ว **ไม่ต้องรัน `add_*.sql`** สำหรับฐานใหม่

## สิ่งที่ seed สร้าง

Role, Department, ผู้ใช้ตัวอย่าง (รหัสผ่านตั้งต้น `1234` — เปลี่ยนก่อนใช้จริง), Status, Action, Category 5 หมวด (หมวด "ทั่วไป" เป็น template),
และ workflow ของแต่ละหมวด: `WorkflowVersion` v1 สถานะ `PUBLISHED` ป้ายชื่อ `Baseline v1` พร้อม transition 13 แถวที่ผูกกับเวอร์ชันนั้น

เส้นทางที่ seed ให้ (ผู้ขอเลือกเองตอนสร้างคำร้องว่าให้บัญชีตรวจซ้ำหรือไม่):

```
ขอ → หัวหน้า → บัญชี → ผู้อนุมัติสูงสุด → IT ดำเนินการ ─┬─ [ตรวจบัญชีซ้ำ]  → บัญชีตรวจ → IT Reviewer ปิดงาน → จบ
                                                          └─ [ข้าม]          ────────────→ IT Reviewer ปิดงาน → จบ
```
ทุกขั้นกด "ส่งกลับ" ได้ (ไป `REVISION`)

## ข้อควรระวังเมื่อ seed ซ้ำ

seed ใช้ซ้ำได้ แต่ **สร้าง transition ของทุกหมวดใหม่จากศูนย์** ทุกครั้ง การแก้ workflow ผ่านหน้า admin จะหาย
และจะตั้ง `v1` เป็นเวอร์ชันทั่วไปที่ใช้งานอยู่ตัวเดียว (เวอร์ชันอื่นที่ publish ไว้ถูก archive) อย่ารันกับฐานที่ปรับแต่ง workflow ไว้แล้ว

`scripts/seed-general-2.ts` (workflow ของประเภทการแก้ไข "ทั่วไป 2") ยังสร้าง transition โดยไม่ผูกเวอร์ชัน และยังไม่ได้ตรวจว่าใช้งานได้หลังมีระบบเวอร์ชัน
