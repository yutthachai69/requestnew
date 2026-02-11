# Workflow: การตั้งค่าใน Admin vs ขั้นตอนอนุมัติจริง

## สรุปสั้นๆ

**ขั้นตอนอนุมัติจริง** ใช้ข้อมูลจากตาราง **WorkflowTransition** เสมอ

- **ตั้งค่า Workflow ขั้นตอนอนุมัติ** (Admin → ตั้งค่า Workflow ขั้นตอนอนุมัติ) = แก้ไข **WorkflowTransition** โดยตรง → **ใช้ควบคุมขั้นตอนอนุมัติจริง**
- **ตั้งค่า Workflow** (Admin → ตั้งค่า Workflow) = แก้ไข **WorkflowStep** (แบบเก่า) → ใช้เฉพาะกรณี fallback เมื่อไม่มี WorkflowTransition

---

## โครงสร้างในระบบ

### 1. WorkflowStep (ที่ Admin ตั้งค่า)

- **ตาราง:** `WorkflowStep`
- **หน้า Admin:** ตั้งค่า Workflow → เลือกหมวดหมู่ → กำหนดลำดับขั้น (ขั้น 1 = role นี้, ขั้น 2 = role นี้, …)
- **ข้อมูล:** `categoryId`, `stepSequence`, `approverRoleName`, `filterByDepartment`
- **ใช้เมื่อไหร่:** ใช้เป็น **fallback** เฉพาะเมื่อคำร้องอยู่ที่ **PENDING** และหมวดนั้น **ไม่มี** WorkflowTransition ที่ตรงกับสถานะปัจจุบัน (หรือไม่มี transition เลย)

### 2. WorkflowTransition (ที่ใช้จริงในการอนุมัติ)

- **ตาราง:** `WorkflowTransition`
- **ที่มา:** ใส่จาก **seed** (`npm run db:seed`) หรือ **แก้ไขจาก Admin → ตั้งค่า Workflow ขั้นตอนอนุมัติ**
- **ข้อมูล:** `categoryId`, `currentStatusId`, `actionId`, `requiredRoleId`, `nextStatusId`, `stepSequence`, `filterByDepartment`
  - หมายถึง: เมื่อคำร้องอยู่ที่สถานะ A (`currentStatusId`) คนที่มี role นี้ (`requiredRoleId`) ทำ action นี้ (`actionId`) ได้ → สถานะเปลี่ยนเป็น B (`nextStatusId`)
- **ใช้เมื่อไหร่:** ใช้เป็นหลักเสมอสำหรับ
  - การคำนวณปุ่ม "อนุมัติ / ปฏิเสธ / ดำเนินการเสร็จสิ้น (IT) / ยืนยันปิดงาน" (possibleActions)
  - การอัปเดตสถานะและขั้นตอนเมื่อกดดำเนินการ

**Admin สามารถปรับ workflow ได้ที่:** เมนู Admin → **ตั้งค่า Workflow ขั้นตอนอนุมัติ** — เลือกหมวดหมู่ แล้วเพิ่ม/แก้ไข/ลบ Transition ได้ หมวดหมู่ต่างกันมี workflow คนละชุดได้

---

## ถ้าต้องการให้การตั้งค่าใน Admin ควบคุมขั้นตอนอนุมัติ

มีทางเลือกหลักๆ:

1. **เพิ่มหน้า Admin จัดการ WorkflowTransition**
   - ให้ Admin กำหนดได้ว่า: สถานะปัจจุบัน → action + role → สถานะถัดไป (ต่อหมวดหมู่)
   - ระบบจะอ่านจากตาราง WorkflowTransition ตามเดิม แค่เปลี่ยนจาก “ใส่จาก seed” เป็น “ใส่/แก้จาก Admin”

2. **ให้ seed อ่านจาก WorkflowStep**
   - ออกแบบ mapping จาก WorkflowStep (ขั้น 1, 2, 3…) เป็นชุด WorkflowTransition (รวม Status, Action) ให้ตรงกับที่ต้องการ
   - ข้อเสีย: โครงสร้าง Step ไม่มี Status / Action ชัดเจน จึงต้องออกแบบกฎให้ตรงกับ flow จริง

3. **คงใช้ seed เป็นหลัก + อธิบายในเอกสาร**
   - ใช้ seed กำหนด flow ตามที่ต้องการ
   - แก้ flow โดยแก้ `prisma/seed.ts` แล้วรัน `npm run db:seed` (หรือ `db:reset` ถ้าต้องการล้างแล้ว seed ใหม่)
   - หน้า Admin Workflow เหลือไว้สำหรับกรณี fallback หรือใช้กับฟีเจอร์อื่นในอนาคต

---

## สรุป

| หัวข้อ | คำตอบ |
|--------|--------|
| ตั้งค่า Workflow ใน Admin แล้ว ขั้นตอนอนุมัติจะเป็นตามนั้นไหม? | **ใช่** ถ้าไปตั้งที่ **ตั้งค่า Workflow ขั้นตอนอนุมัติ** — ขั้นตอนอนุมัติเป็นไปตาม **WorkflowTransition** ที่ Admin แก้ในหน้านั้น |
| ตั้งค่า Workflow (แบบเก่า) กับ ตั้งค่า Workflow ขั้นตอนอนุมัติ ต่างกันอย่างไร? | แบบเก่า (WorkflowStep) ใช้เฉพาะ fallback; **ขั้นตอนอนุมัติ** (WorkflowTransition) คือที่ใช้จริง — ควรใช้หน้านี้ปรับ workflow |
| อยากเปลี่ยนขั้นตอนอนุมัติทำยังไง? | ไปที่ Admin → **ตั้งค่า Workflow ขั้นตอนอนุมัติ** → เลือกหมวดหมู่ → เพิ่ม/แก้ไข/ลบ ขั้นตอน (หรือรัน `npm run db:seed` ครั้งแรกเพื่อใส่ค่าตั้งต้น) |
