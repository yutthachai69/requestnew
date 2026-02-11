# Workflow Seed — Compliance กับแผน (Request > หัวหน้าแผนก > บัญชี > Final App > IT แก้ไข > บัญชี > IT ปิดงาน)

## ทำตามแล้วหรือยัง — สรุป

**ทำตามแล้วครับ** โดยใช้ **Prisma seed** (`prisma/seed.ts`) ไม่ได้รัน SQL โดยตรง

โปรเจกต์นี้ใช้ชื่อตารางต่างจาก SQL ที่ส่งมา:

| ใน SQL ที่ส่งมา | ในโปรเจกต์ (Prisma) |
|------------------|----------------------|
| WorkflowStatus   | **Status**           |
| WorkflowAction   | **Action**           |
| WorkflowTransition | **WorkflowTransition** (เหมือนกัน) |

คอลัมน์เพิ่ม: `Status` มี `colorCode`, `displayOrder`, `isInitialState`; `WorkflowTransition` มี `correctionTypeId`, `filterByDepartment`.

---

## 1. สถานะ (Status) ในระบบ

| Code              | displayName              |
|-------------------|--------------------------|
| PENDING           | รอหัวหน้าแผนกอนุมัติ     |
| WAITING_ACCOUNT_1 | รอนำส่งบัญชีตรวจสอบ      |
| WAITING_FINAL_APP | รอผู้อนุมัติสูงสุด        |
| IT_WORKING        | IT กำลังดำเนินการ        |
| WAITING_ACCOUNT_2 | รอตรวจสอบหลังแก้ไข      |
| WAITING_IT_CLOSE  | รอ IT ปิดงาน            |
| CLOSED            | ปิดงานเรียบร้อย          |
| REJECTED          | ถูกปฏิเสธ                |

---

## 2. WorkflowTransitions (6 ขั้น + REJECT)

| ลำดับ | Current Status    | Action           | Next Status      | Required Role   |
|-------|-------------------|------------------|------------------|-----------------|
| 1     | PENDING           | APPROVE          | WAITING_ACCOUNT_1 | หัวหน้าแผนก (HOD) |
| 2     | WAITING_ACCOUNT_1 | APPROVE         | WAITING_FINAL_APP | บัญชี           |
| 3     | WAITING_FINAL_APP | APPROVE         | IT_WORKING       | Final App       |
| 4     | IT_WORKING        | **IT_PROCESS**   | WAITING_ACCOUNT_2 | IT Support     |
| 5     | WAITING_ACCOUNT_2 | APPROVE         | WAITING_IT_CLOSE | บัญชี           |
| 6     | WAITING_IT_CLOSE  | CONFIRM_COMPLETE | CLOSED           | IT Support / Admin |

+ REJECT จากทุกขั้นไป REJECTED

---

## 3. Compliance Check

### Action Mapping (Frontend)
- หน้ารายละเอียดคำร้อง (`app/(main)/request/[id]/page.tsx`) ดึง **possibleActions** จาก API
- API ดึงจาก **findPossibleTransitions** ตาม `currentStatusId` + category
- ปุ่มกดส่ง **actionName: action.ActionName** ไปที่ `POST /api/requests/[id]/action`
- ดังนั้นขั้นที่ 4 (IT แก้ไขเสร็จ) ปุ่มจะได้ **ActionName: 'IT_PROCESS'** และส่ง `IT_PROCESS` ถูกต้อง

### Required Roles
- **getUserRoleNamesForWorkflowRole** ใน `lib/auth-constants.ts` ใช้เช็คว่าใครมีสิทธิ์กดปุ่ม
- Role ใน DB (Admin, Head of Department, Accountant, Final Approver, IT ฯลฯ) ต้องตรงกับที่ User ถืออยู่

### Audit Log
- ใน `POST /api/requests/[id]/action` มีการสร้าง **AuditLog** และ **ApprovalHistory** ทุกครั้งที่ขยับสถานะ
- บันทึก action, userId, detail (รวมชื่อสถานะใหม่)

---

## 4. การอัปเดตข้อมูลใน DB

ไม่ต้องรัน SQL เอง — ใช้คำสั่ง:

```bash
# หยุด dev server ก่อน
npx prisma db seed
```

หรือรีเซ็ตทั้ง DB แล้ว seed ใหม่:

```bash
npm run db:reset
```

(ดูรายละเอียดใน `docs/DB-RESET-SEED.md`)
