# รีเซ็ตฐานข้อมูลและยัดกฎ Workflow (Seed)

เมื่อตาราง `WorkflowTransition` ว่างหรือโครงสร้างเก่า โค้ดจะ fallback ไปใช้ logic แบบ Step+1 แทนกฎจากตาราง ทำให้การเดินเอกสารผิดทาง

## ขั้นตอน (ต้องทำตามลำดับ)

### 1. หยุด Server ก่อน

หยุด `npm run dev` (หรือ Next.js / process ที่เปิดไฟล์ `prisma/dev.db`) เพื่อไม่ให้ไฟล์ฐานข้อมูลถูกล็อก  
ถ้าไม่หยุด คำสั่งด้านล่างอาจ error แบบ `database is locked` หรือ `SQLITE_BUSY`

### 2. รันคำสั่งรีเซ็ตและ Seed

จากโฟลเดอร์โปรเจกต์ (root):

```bash
npm run db:reset
```

หรือรันแยก:

```bash
npx prisma db push --force-reset
npx prisma db seed
```

- `db push --force-reset` = ล้าง DB แล้วสร้างตารางใหม่ตาม `schema.prisma` (รวมตาราง `WorkflowTransition`)
- `db seed` = รัน `prisma/seed.ts` ใส่ข้อมูลเริ่มต้น รวมกฎเดินเอกสาร: **ขอ → หัวหน้า → บัญชี → Final → IT → บัญชีปิด → IT ปิดงาน → จบ**

### 3. เปิด Server ใหม่

```bash
npm run dev
```

---

## ถ้าใช้ Prisma Migrate แทน db push

ถ้าโปรเจกต์มี migration history แล้ว และต้องการใช้ `migrate reset`:

1. หยุด Server
2. รัน:

   ```bash
   npx prisma migrate reset --force
   ```

3. ใน Prisma 7 การ seed อาจไม่รันอัตโนมัติหลัง reset — ถ้าไม่มีข้อมูล seed ให้รันเพิ่ม:

   ```bash
   npx prisma db seed
   ```

---

## สรุป

| สิ่งที่ทำ | ผลลัพธ์ |
|-----------|----------|
| หยุด Server | ปล่อยล็อกไฟล์ `prisma/dev.db` |
| `db push --force-reset` | สร้างตารางใหม่ตาม schema (รวม WorkflowTransition) |
| `db seed` | ใส่ Role, Status, Action, Category, **WorkflowTransition** (กฎเดินเอกสาร) |
| เปิด Server ใหม่ | ระบบอ่านกฎจากตารางได้ ไม่วิ่งเข้า Fallback แบบ Step+1 |
