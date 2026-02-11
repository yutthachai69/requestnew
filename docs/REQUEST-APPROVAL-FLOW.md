# สรุป Flow การส่งและรับอนุมัติ (Request Approval Flow)

เอกสารนี้อ้างอิงจาก **Flow ระบบเดิม** (backend Express + SQL Server + frontend MUI) และ **map กับโปรเจกต์ requestonline** (Next.js + Prisma) ว่าแต่ละส่วนอยู่ที่ไหน และอะไรที่ทำแล้ว / ทำแบบย่อ / ยังไม่มี

---

## 1. เปรียบเทียบภาพรวม

| Flow ระบบเดิม | requestonline (Next.js) | หมายเหตุ |
|----------------|-------------------------|----------|
| **ส่งคำร้อง** POST /requests → Request.create → notifyNextApprovers | **สร้างคำร้อง** Server Action `f07-action` → สร้าง ITRequestF07 + workOrderNo (DocConfig) → ส่งเมลผู้อนุมัติขั้นที่ 1 (`getFirstApproverForCategory`) | มีแล้ว (ขั้นแรกเท่านั้น) |
| **รับคำร้อง** GET /requests (ตาม role + status) → getRequestsByRole | **GET /api/requests** (filter: categoryId, status, search, page) — เฉพาะ Admin เห็นทุกคำร้อง; คนอื่นเห็นเฉพาะของตัวเอง | มีแล้ว (ViewScope แบบย่อ) |
| **รายละเอียด + possibleActions** getRequestById → findPossibleTransitions + ApprovalHistory | **GET /api/requests/[id]** → `getPossibleActions(status, roleName)` (ถ้า PENDING และ Admin/HoD/User → อนุมัติ/ปฏิเสธ) | มีแล้ว (possibleActions แบบขั้นเดียว) |
| **ดำเนินการ** POST /requests/:id/action → performAction (parallel, IT_PROCESS, เลขที่เอกสาร, notify) | **ทาง API:** **POST /api/requests/[id]/action** (APPROVE/REJECT เท่านั้น, อัปเดต status + AuditLog) | ทำแบบย่อ (ไม่มีหลายขั้น/IT_PROCESS จาก API) |
| **ดำเนินการหลายขั้น (Workflow)** เปลี่ยนสถานะตาม WorkflowTransitions, บันทึก ApprovalHistory, notifyNextApprovers | **ทางลิงก์อีเมล:** **app/actions/approve-action.ts** — อนุมัติด้วย token, มีหลายขั้น (WorkflowStep), ส่งเมลขั้นถัดไป (`getApproverForStep`) | มีแล้ว (เฉพาะการอนุมัติผ่านลิงก์) |
| **Bulk action** POST /requests/bulk-action | **POST /api/requests/bulk-action** (APPROVE/REJECT หลายรายการ) | มีแล้ว |

---

## 2. ไฟล์ที่เกี่ยวข้องใน requestonline

### Backend (API Routes + Server Actions)

| หน้าที่ (ตาม Flow เดิม) | ไฟล์ใน requestonline |
|-------------------------|------------------------|
| สร้างคำร้อง + แจ้งผู้อนุมัติขั้นแรก | `app/actions/f07-action.ts` (submit F07, workOrderNo, ส่งเมล), `lib/workflow.ts` (getFirstApproverForCategory, getApproverForStep) |
| ดึงรายการคำร้อง | `app/api/requests/route.ts` (GET/POST) |
| ดึงรายละเอียด + possibleActions | `app/api/requests/[id]/route.ts` (GET), ฟังก์ชัน `getPossibleActions(status, roleName)` ในไฟล์เดียวกัน |
| ดำเนินการอนุมัติ/ปฏิเสธ (จาก Dashboard) | `app/api/requests/[id]/action/route.ts` (POST — APPROVE/REJECT เท่านั้น) |
| ดำเนินการหลายขั้น (จากลิงก์อีเมล) | `app/actions/approve-action.ts` (handleApprovalAction โดย token), `lib/workflow.ts` (getWorkflowStepCount, getApproverForStep) |
| Bulk อนุมัติ/ปฏิเสธ | `app/api/requests/bulk-action/route.ts` |
| ส่งเมล / เทมเพลต | `lib/mail.ts`, `lib/email-helper.ts` (getApprovalTemplate) |

### Frontend

| หน้าที่ (ตาม Flow เดิม) | ไฟล์ใน requestonline |
|-------------------------|------------------------|
| ฟอร์มสร้างคำร้อง | `app/(main)/request/new/page.tsx` → เรียก Server Action สร้าง F07 |
| หน้ารายละเอียดคำร้อง + ปุ่มดำเนินการ | `app/(main)/request/[id]/page.tsx` — โหลด possibleActions จาก GET /api/requests/[id], เรียก performAction |
| แดชบอร์ดรายการคำร้อง | `app/(main)/dashboard/page.tsx`, `app/(main)/category/[id]/page.tsx` — เรียก GET /api/requests |
| หน้ารายการที่ต้องอนุมัติ | `app/(main)/pending-tasks/page.tsx` |
| อนุมัติผ่านลิงก์ (token) | `app/approve/[token]/page.tsx` → เรียก handleApprovalAction |

### Client / Services

| หน้าที่ | ไฟล์ใน requestonline |
|--------|----------------------|
| API client สร้าง/ดึง/ดำเนินการ | `lib/services/requestService.ts` (createRequest, getRequests, getRequestById, performAction, performBulkAction) |

---

## 3. Flow การส่งคำร้อง (สร้างคำร้อง → ส่งเข้าสู่การอนุมัติ)

### ระบบเดิม

1. NewRequestPage → POST /requests (FormData)
2. requestController.createRequest → Permission.check, Request.create (สถานะเริ่มต้น), notifyNextApprovers(request, CurrentStatusID)
3. Frontend: แสดงสำเร็จ, (ถ้ามี) ส่งอีเมล nextApprovers

### requestonline

1. หน้า `app/(main)/request/new/page.tsx` → Server Action ใน `app/actions/f07-action.ts` (หรือ it-requst.ts ฯลฯ) สร้าง **ITRequestF07** (status PENDING), ออก **workOrderNo** จาก DocConfig
2. หลังสร้าง: หาผู้อนุมัติขั้นที่ 1 ด้วย **getFirstApproverForCategory(categoryId, departmentId)** ใน `lib/workflow.ts` แล้วส่งเมล (lib/mail.ts + email-helper)
3. **ไม่มี** notifyNextApprovers แบบหลายคนในระบบ; มีแค่ส่งเมลไปผู้อนุมัติขั้นที่ 1 และใช้ **approvalToken** สำหรับลิงก์อนุมัติหลายขั้นใน `app/actions/approve-action.ts`

**สรุป:** การส่งคำร้อง = สร้าง ITRequestF07 + workOrderNo → ส่งเมลผู้อนุมัติขั้นที่ 1 (และใช้ token สำหรับ flow หลายขั้นทางอีเมล)

---

## 4. Flow การรับคำร้อง (ผู้อนุมัติเห็นรายการและรายละเอียด)

### ระบบเดิม

- Dashboard: GET /requests (status, categoryId, approvedByMe, …) → getRequestsByRole (ViewScope OWN/ASSIGNED/ALL)
- รายละเอียด: GET /requests/:id → getRequestData → possibleActions จาก findPossibleTransitions + UserSpecialRoles, history จาก ApprovalHistory

### requestonline

- **รายการ:** GET /api/requests (categoryId, status, search, page, limit) — ถ้าไม่ใช่ Admin จะ where.requesterId = userId
- **รายละเอียด:** GET /api/requests/[id] → คืน request + **possibleActions** จาก `getPossibleActions(status, roleName)` (ถ้า PENDING และ role เป็น Admin / Head of Department / User → [อนุมัติ, ส่งกลับ/ปฏิเสธ]); **history** ตอนนี้คืนเป็น [] (ยังไม่มีตาราง ApprovalHistory)

**สรุป:** การรับคำร้อง = Dashboard/ category เรียก GET /api/requests → กดเข้า detail → GET /api/requests/[id] ได้ possibleActions (แบบขั้นเดียว) และประวัติยังไม่ใช้ ApprovalHistory

---

## 5. Flow การดำเนินการอนุมัติ/ปฏิเสธ (performAction)

### ระบบเดิม

- POST /requests/:id/action (actionName, comment, itData)
- ตรวจ validAction จาก possibleActions
- สร้างเลขที่เอกสาร (ถ้าต้อง), จัดการ Parallel Approval, IT_PROCESS
- อัปเดต CurrentStatusID, บันทึก ApprovalHistory
- notifyRequester หรือ notifyNextApprovers

### requestonline

**ทาง API (จาก Dashboard):**

- **POST /api/requests/[id]/action** — body: `{ actionName: 'APPROVE' | 'REJECT', comment?: string }`
- ตรวจว่า request เป็น PENDING; อนุมัติ/ปฏิเสธแล้วอัปเดต status เป็น APPROVED/REJECTED, บันทึก **AuditLog**
- **ไม่มี** หลายขั้น, Parallel Approval, IT_PROCESS, ApprovalHistory, notifyNextApprovers จาก API นี้

**ทางลิงก์อีเมล (หลายขั้น):**

- **app/actions/approve-action.ts** — `handleApprovalAction(token, 'APPROVED' | 'REJECTED')`
- ถ้า REJECTED → อัปเดต status เป็น REJECTED, บันทึก AuditLog
- ถ้า APPROVED และเป็นขั้นสุดท้าย (currentStep >= totalSteps) → status = CLOSED
- ถ้า APPROVED และยังมีขั้นถัดไป → อัปเดต currentApprovalStep, สร้าง approvalToken ใหม่, ส่งเมลผู้อนุมัติขั้นถัดไป (**getApproverForStep(categoryId, nextStep, departmentId)**)

**สรุป:**  
- **Dashboard:** ดำเนินการได้แค่ขั้นเดียว (อนุมัติ/ปฏิเสธ) ผ่าน API, ไม่มี Workflow หลายขั้นจาก API  
- **อีเมล:** มี flow หลายขั้นผ่าน token + WorkflowStep + getApproverForStep

---

## 6. Workflow Helper: หาผู้อนุมัติขั้นถัดไป

### ระบบเดิม

- notifyNextApprovers(request, nextStatusId) — จาก WorkflowTransitions, Special Approver Mappings, findUsersByRoleAndCategory → สร้าง Notification, return รายชื่อสำหรับอีเมล
- findNextApprovers(request) — เหมือนกันแต่ไม่สร้าง Notification, return array of fullName

### requestonline

- **lib/workflow.ts**
  - **getApproverForStep(categoryId, stepSequence, departmentId)** — หาผู้อนุมัติหนึ่งคนของขั้นนั้น (SpecialApproverMapping ถ้ามี, ไม่ก็ตาม role จาก WorkflowStep + แผนก)
  - **getFirstApproverForCategory(categoryId, departmentId)** — เรียก getApproverForStep(..., 1, ...)
  - **getWorkflowStepCount(categoryId)** — นับจำนวนขั้นจาก WorkflowStep
- **ไม่มี** ตาราง Notification; การแจ้งเตือน = ส่งเมล (lib/mail.ts, email-helper) ตอนสร้างคำร้องและตอนอนุมัติผ่านลิงก์ (approve-action)

---

## 7. โครงสร้างข้อมูลที่ใช้ใน Flow (requestonline)

| ระบบเดิม | requestonline |
|----------|----------------|
| Statuses (IsInitialState, PENDING_HOD, …) | **ITRequestF07.status** (PENDING, APPROVED, REJECTED, CLOSED) |
| WorkflowTransitions (CurrentStatusID, NextStatusID, StepSequence, RequiredRoleID, …) | **WorkflowStep** (categoryId, stepSequence, approverRoleName, filterByDepartment) — แบบย่อ |
| ApprovalHistory (RequestID, ApproverID, ApprovalLevel, ActionType, Comment) | ยังไม่มีตารางแยก; บันทึกแค่ **AuditLog** (action, detail) |
| DocumentNumberConfig | **DocConfig** (categoryId, year, prefix, lastNumber) — ใช้ใน f07-action ออก workOrderNo |
| เลขที่เอกสารตอนอนุมัติครั้งแรก | workOrderNo สร้างตอน **สร้างคำร้อง** (f07-action) ไม่ใช่ตอนกดอนุมัติ |

---

## 8. สรุป Flow แบบสั้น (requestonline)

1. **ส่งคำร้อง:** หน้า request/new → Server Action สร้าง ITRequestF07 + workOrderNo → ส่งเมลผู้อนุมัติขั้นที่ 1 (getFirstApproverForCategory).
2. **รับคำร้อง:** Dashboard/category เรียก GET /api/requests → กดเข้า detail → GET /api/requests/[id] ได้ possibleActions (อนุมัติ/ปฏิเสธ สำหรับ Admin/HoD/User เมื่อ PENDING).
3. **ดำเนินการจาก Dashboard:** กดปุ่ม → POST /api/requests/[id]/action (APPROVE/REJECT) → อัปเดต status, บันทึก AuditLog — **ขั้นเดียว**.
4. **ดำเนินการหลายขั้น (อีเมล):** ผู้อนุมัติกดลิงก์ในเมล → approve/[token] → handleApprovalAction(token, APPROVED|REJECTED) → อัปเดตขั้น/สถานะ, ส่งเมลขั้นถัดไป (getApproverForStep) หรือปิดงาน (CLOSED).

ถ้าต้องการให้ flow ทาง **API** (Dashboard) ตรงกับระบบเดิมมากขึ้น (หลายขั้น, ApprovalHistory, IT_PROCESS, notifyNextApprovers จาก API) ต้องขยาย `app/api/requests/[id]/action/route.ts` และอาจเพิ่มตาราง ApprovalHistory — อ้างอิงได้จากเอกสาร Flow ระบบเดิมและ `docs/BACKEND_REFERENCE.md`.
