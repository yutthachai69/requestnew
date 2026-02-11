# การตรวจสอบ: ตั้งค่า Workflow ขั้นตอนอนุมัติ ใช้ได้จริง

## สรุปผลการตรวจสอบ

**ใช่ — ใช้ได้จริง** ขั้นตอนอนุมัติจริง (ปุ่มอนุมัติ/ปฏิเสธ/ดำเนินการ IT/ปิดงาน) อ่านจากตาราง **WorkflowTransition** ชุดเดียวกับที่ Admin แก้ในหน้า **ตั้งค่า Workflow ขั้นตอนอนุมัติ**

---

## 1. โฟลว์ข้อมูล (Data Flow)

| ขั้นตอน | ที่มา | ตาราง/ฟังก์ชัน |
|--------|--------|------------------|
| Admin เพิ่ม/แก้/ลบ ขั้นตอน | หน้า `/admin/workflow-transitions` | `POST/PUT/DELETE /api/admin/workflow-transitions` → `prisma.workflowTransition.create/update/delete` |
| ระบบคำนวณปุ่มที่ผู้ใช้กดได้ | `GET /api/requests/[id]` | `findPossibleTransitions(categoryId, currentStatusId, ...)` → `prisma.workflowTransition.findMany` → `getPossibleActionsFromTransitions(transitions, roleName)` |
| ระบบอัปเดตสถานะหลังกดปุ่ม | `POST /api/requests/[id]/action` | `findPossibleTransitions(...)` → หา transition ที่ตรง action + role → อัปเดต `request.status`, `request.currentStatusId` ตาม `transition.nextStatusId`, `transition.nextStatus.code` |
| รายการรอดำเนินการ | `GET /api/pending-tasks` | ใช้ `workflowTransition` ในการกรองคำร้องที่ user ต้องดำเนินการ |

ทุกจุดด้านบนใช้ตาราง **WorkflowTransition** ชุดเดียวกัน

---

## 2. การเชื่อมต่อ (Code Path)

### 2.1 เมื่อเปิดหน้ารายละเอียดคำร้อง

1. `app/api/requests/[id]/route.ts` (GET)  
   - อ่าน `request.currentStatusId`, `request.categoryId`  
   - เรียก `findPossibleTransitions({ categoryId, currentStatusId, correctionTypeIds })`  
2. `lib/workflow.ts` → `findPossibleTransitions`  
   - เรียก `findTransitionsByStatus(categoryId, currentStatusId, correctionTypeId)`  
   - ภายในใช้ `prisma.workflowTransition.findMany({ where: { categoryId, currentStatusId, correctionTypeId } })`  
3. คืนค่า `transitions` กลับไปที่ route  
4. เรียก `getPossibleActionsFromTransitions(transitions, roleName)`  
   - กรอง transition ที่ user มีสิทธิ์ (ตาม `requiredRole.roleName` + `getUserRoleNamesForWorkflowRole`)  
   - สร้างรายการ `possibleActions` (ปุ่มที่แสดง)  
5. ส่ง `possibleActions` กลับไปที่ frontend → หน้ารายละเอียดคำร้องแสดงปุ่มตามนี้  

**สรุป:** ปุ่มที่แสดง = ตาม WorkflowTransition ที่ Admin ตั้ง

### 2.2 เมื่อผู้ใช้กดปุ่มดำเนินการ (อนุมัติ/ปฏิเสธ/IT/ปิดงาน)

1. `app/api/requests/[id]/action/route.ts` (POST)  
   - รับ `actionName`, อ่าน `req.currentStatusId`, `req.categoryId`  
   - เรียก `findPossibleTransitions(...)` (ชุดเดียวกับ 2.1)  
2. หา `transition` ที่ตรง `actionName` และ role ของ user  
   - `transitions.find(t => t.action.actionName === actionName && getUserRoleNamesForWorkflowRole(t.requiredRole.roleName).includes(roleName))`  
3. อัปเดตคำร้อง  
   - `status = transition.nextStatus.code`  
   - `currentStatusId = transition.nextStatusId`  
4. บันทึก audit log / approval history  

**สรุป:** สถานะถัดไป = ตาม WorkflowTransition ที่ Admin ตั้ง

### 2.3 เมื่อ Admin เพิ่ม/แก้/ลบ ขั้นตอน

1. หน้า `app/admin/workflow-transitions/page.tsx`  
   - GET: `GET /api/admin/workflow-transitions?categoryId=...` → แสดงรายการ transition  
   - POST: สร้าง transition ใหม่  
   - PUT: แก้ transition ที่มีอยู่  
   - DELETE: ลบ transition  
2. API ฝั่ง backend  
   - `app/api/admin/workflow-transitions/route.ts` → `prisma.workflowTransition.create`  
   - `app/api/admin/workflow-transitions/[id]/route.ts` → `prisma.workflowTransition.update` / `delete`  

**สรุป:** ข้อมูลที่ Admin ตั้ง เก็บในตารางเดียวกับที่ข้อ 2.1 และ 2.2 อ่าน

---

## 3. สิ่งที่ต้องมีในระบบ

- **Status** — ต้องมีในตาราง `Status` (จาก seed หรือ Admin → จัดการสถานะ)  
- **Action** — ต้องมีในตาราง `Action` (จาก seed: APPROVE, REJECT, IT_PROCESS, CONFIRM_COMPLETE)  
- **Role** — ต้องมีในตาราง `Role` (จาก seed หรือ Admin → จัดการสิทธิ์)  
- **Category** — ต้องมีในตาราง `Category`  

ถ้ายังไม่มี WorkflowTransition ในหมวดใด รัน `npm run db:seed` ครั้งแรกเพื่อใส่ค่าตั้งต้น หลังจากนั้นให้ปรับใน Admin ได้เลย

---

## 4. ข้อควรระวัง

- **การรัน seed ซ้ำ:** ใน `prisma/seed.ts` มี `workflowTransition.deleteMany({ where: { categoryId: cat.id } })` แล้วค่อย `create` ใหม่ ดังนั้น **ถ้ารัน `npm run db:seed` (หรือ `db:reset`) อีกครั้ง ค่าที่ตั้งในหน้า "ตั้งค่า Workflow ขั้นตอนอนุมัติ" จะถูกล้างและถูกแทนที่ด้วยค่าจาก seed**  
- หลังปรับ workflow ใน Admin ไม่ต้องแก้โค้ด — ระบบจะใช้ค่าจาก DB ทันที

---

## 5. สรุปคำตอบ

| คำถาม | คำตอบ |
|--------|--------|
| ตั้งค่าใน Admin แล้ว ขั้นตอนอนุมัติจะเป็นตามนั้นจริงไหม? | **ใช่** — ระบบอ่าน WorkflowTransition จาก DB ชุดเดียวกับที่ Admin แก้ |
| หมวดหมู่ต่างกัน ใช้ workflow คนละชุดได้ไหม? | **ได้** — แต่ละหมวดหมู่มี `categoryId` แยกกัน กำหนด transition ต่อหมวดได้ |
| ต้องแก้โค้ดไหม? | **ไม่ต้อง** — แก้เฉพาะใน Admin หน้า "ตั้งค่า Workflow ขั้นตอนอนุมัติ" |
