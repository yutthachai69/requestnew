# อ้างอิง Backend ระบบเก่า → REQUESTONLINE (Prisma)

เอกสารเทียบโครงสร้างและฟังก์ชันจาก backend เก่า (Express + SQL Server) กับ REQUESTONLINE (Next.js + Prisma).

---

## 1. ตาราง/Model เทียบกับ Prisma

| ระบบเก่า (SQL Server) | REQUESTONLINE (Prisma) | หมายเหตุ |
|----------------------|------------------------|----------|
| **Users** (UserID, Username, Password, FullName, Email, DepartmentID, Position, PhoneNumber, RoleID, IsActive) | **User** | มีแล้ว (id, username, password, fullName, email, position, phoneNumber, roleId, departmentId, isActive) |
| **Roles** (RoleID, RoleName, Description, AllowBulkActions) | **Role** | มีแล้ว (ไม่มี Description; essentialRoleIds 1,2 ห้ามลบ – ทำใน logic) |
| **Departments** (DepartmentID, DepartmentName, IsActive) | **Department** | มีแล้ว |
| **Categories** (CategoryID, CategoryName, RequiresCCSClosing) | **Category** | มีแล้ว |
| **Locations** (LocationID, LocationName) | **Location** | มีแล้ว |
| **CategoryLocationMappings** | Category ↔ Location (many-to-many) | Prisma: Category.locations, Location.categories |
| **DocumentNumberConfig** (CategoryID, Year, Prefix, LastRunningNumber) | **DocConfig** | มีแล้ว (ผูก Category) |
| **Requests** (RequesterID, CategoryID, LocationID, RequestDate, ProblemDetail, CurrentStatusID, …) | **ITRequestF07** | โครงต่างกัน: F07 ใช้ workOrderNo, status PENDING/APPROVED/REJECTED, approvalToken |
| **ApprovalHistory** (RequestID, ApproverID, ApprovalLevel, ActionType, Comment, ApprovalTimestamp) | - | ยังไม่มีตารางแยก; AuditLog เก็บ action APPROVE/REJECT |
| **AuditLogs** (UserID, Action, Detail, IPAddress, Timestamp) | **AuditLog** | มีแล้ว |
| **UserCategoryPermissions** (UserID, CategoryID) | User.accessibleCategories (Category[]) | มีแล้วใน Prisma (many-to-many) |
| **WorkflowTransitions** (CategoryID, CorrectionTypeID, CurrentStatusID, ActionID, RequiredRoleID, NextStatusID, FilterByDepartment, StepSequence) | **WorkflowStep** (แบบย่อ) | มีแค่ stepSequence, approverRoleName, categoryId – ไม่มี Status/Action/RequiredRoleID |
| **Statuses** (StatusID, StatusName, StatusCode, ColorCode, IsInitialState) | - | F07 ใช้แค่ PENDING/APPROVED/REJECTED ในฟิลด์ status |
| **Actions** (ActionID, ActionName, DisplayName) | - | ยังไม่มี |
| **CorrectionTypes** (CorrectionTypeID, CorrectionTypeName, FieldsConfig, TemplateString, Priority, RequiredRoleLevel, IsActive) | - | ยังไม่มี |
| **CategoryCorrectionTypeMappings** | - | ยังไม่มี |
| **RequestCorrectionTypes** (RequestID, CorrectionTypeID) | - | ยังไม่มี |
| **CorrectionReasons** (ReasonID, ReasonText, IsActive) | - | ยังไม่มี (F07 ใช้ problemDetail) |
| **RoleTabs** (RoleID, TabID) | - | ใช้ getTabsForRole(roleName) จาก auth-constants |
| **Tabs** (TabID, Label, StatusFilter, IsHistory, DisplayOrder) | - | ใช้ TabItem ใน auth-constants |
| **SpecialRoles**, **UserSpecialRoles** | - | ยังไม่มี |
| **SpecialApproverMappings** (CategoryID, CorrectionTypeID, StepSequence, UserID) | - | ยังไม่มี |
| **EmailTemplates**, **EmailLog** | - | ยังไม่มี (ส่งเมลผ่าน lib/mail.ts) |
| **Notifications** (UserID, Message, RequestID, IsRead, CreatedAt) | - | ยังไม่มี |

---

## 2. ฟังก์ชันจาก Models เก่า → สถานะใน REQUESTONLINE

### adminModel.js
| ฟังก์ชัน | สถานะใน REQUESTONLINE |
|----------|------------------------|
| getActions, getRoles, createRole, updateRole, deleteRole | ยังไม่มี API; Role CRUD ผ่าน Prisma ได้ |
| getTabsForRole(roleId) | มี getTabsForRole(roleName) ใน lib/auth-constants.ts (ไม่ดึงจาก DB) |
| getCorrectionTypesAdmin, create/update/deleteCorrectionType | ยังไม่มี (ไม่มี CorrectionTypes) |
| getCorrectionReasons, create/updateCorrectionReason | ยังไม่มี |
| getSpecialRoles, getSpecialRolesForUser, updateSpecialRolesForUser | ยังไม่มี |
| getWorkflow, getAllWorkflows, updateWorkflow, copyWorkflow, deleteWorkflow | มี WorkflowStep แบบย่อ; ยังไม่มี CRUD WorkflowTransitions |
| getSpecialApproverMappings, updateSpecialApproverMappings | ยังไม่มี |
| getCategoryMappingsForCorrectionType, getOperationAuditReport | ยังไม่มี; รายงาน Audit ใช้ AuditLog ได้ |

### approvalHistoryModel.js
| ฟังก์ชัน | สถานะใน REQUESTONLINE |
|----------|------------------------|
| getForRequest(requestId), create({ requestId, approverId, … }) | ยังไม่มีตาราง ApprovalHistory; บันทึกแค่ใน AuditLog ตอน approve/reject |

### auditLogModel.js
| ฟังก์ชัน | สถานะใน REQUESTONLINE |
|----------|------------------------|
| create({ userId, action, detail, ipAddress }) | ใช้แล้วใน approve-action (action APPROVED/REJECTED) |
| getLogs({ page, limit, search, userId, action, startDate, endDate }) | ยังไม่มีหน้า/API รายการ AuditLog |
| getDistinctActions() | ยังไม่มี |

### departmentModel.js
| ฟังก์ชัน | สถานะใน REQUESTONLINE |
|----------|------------------------|
| getAll, getAllAdmin, findById, create, update, delete | มี Department ใน Prisma; ใช้ใน seed และฟอร์ม F07; ยังไม่มี Admin CRUD |

### emailModel.js
| ฟังก์ชัน | สถานะใน REQUESTONLINE |
|----------|------------------------|
| getTemplateByName, logEmail, getAllTemplates, updateTemplate | ส่งเมลผ่าน lib/mail.ts + email-helper; ยังไม่มี EmailTemplates/EmailLog ใน DB |

### masterDataModel.js
| ฟังก์ชัน | สถานะใน REQUESTONLINE |
|----------|------------------------|
| getCategories, getLocations, getStatuses | Categories, Locations มีใน Prisma; ใช้ในฟอร์ม F07; Statuses ยังไม่มี (F07 ใช้ status string) |
| getPermittedCategories(userId) | User.accessibleCategories ใน Prisma |
| create/update/delete Category, Location, updateStatus | ยังไม่มี Admin CRUD |
| getDocConfigs, upsertDocConfig | DocConfig ใน Prisma; ใช้ใน f07-action สำหรับรันเลขที่ |
| getCorrectionTypes, getCorrectionReasons, getWorkflowPreview | ยังไม่มี |

### notificationModel.js
| ฟังก์ชัน | สถานะใน REQUESTONLINE |
|----------|------------------------|
| create, getForUser, markAsRead, markAllAsReadForUser | ยังไม่มีตาราง Notifications |

### permissionModel.js
| ฟังก์ชัน | สถานะใน REQUESTONLINE |
|----------|------------------------|
| check(userId, categoryId), getForUser, updateForUser | Prisma: User.accessibleCategories (many-to-many กับ Category) |
| findUsersByRoleAndCategory, findUsersBySpecialRole, checkUserHasRole | ยังไม่มี (workflow หาผู้อนุมัติใช้ getDeptManagerEmail ใน lib/workflow.ts) |

### requestModel.js
| ฟังก์ชัน | สถานะใน REQUESTONLINE |
|----------|------------------------|
| findTransitions, findPossibleTransitions, findTransitionsByCurrentStatus | ยังไม่มี (อนุมัติทางลิงก์แบบง่าย) |
| create (Requests + RequestCorrectionTypes, initial status) | มี submitF07 → ITRequestF07 (ไม่ใช้ CorrectionTypes) |
| getRequestsByRole (ViewScope OWN/ASSIGNED/ALL) | Dashboard ดึง ITRequestF07 ล่าสุด; ยังไม่มี filter ตาม role/department แบบเก่า |
| findById, update, getHistoryByApprover, deleteById | findById/รายการมีใน dashboard; update/delete/l history ยังไม่มี |
| getRequestCorrectionTypes | ยังไม่มี |
| getAverageApprovalTime, getRequestCountByCategory, getPendingRequestsCount | สถิติ Dashboard ใช้ groupBy status ได้ |
| getStatsByPermittedCategories, getAggregatedReportData | ยังไม่มี |
| checkParallelApprovalsCompleted | ยังไม่มี |

### userModel.js
| ฟังก์ชัน | สถานะใน REQUESTONLINE |
|----------|------------------------|
| findByUsername (with Department, Role, AllowBulkActions) | ใช้ใน lib/auth.ts authorize (Credentials) |
| create, findById, getAll (paginated, search), update, updatePassword | ยังไม่มี Admin จัดการ User (มีแค่ seed) |
| getUserStats (requestsCreated, actionsTaken) | ยังไม่มี |
| deleteById (ตรวจ ApprovalHistory, Requests, แล้วลบ UserCategoryPermissions, AuditLogs) | ยังไม่มี |

---

## 3. สรุปสิ่งที่ REQUESTONLINE มีแล้ว

- **Auth:** NextAuth Credentials, session มี roleName, middleware ป้องกัน /dashboard ตาม role
- **Role/Tabs:** allowedDashboardRoles, ROLE_HIERARCHY, getTabsForRole(roleName) ใน auth-constants
- **Master Data:** User, Role, Department, Location, Category, DocConfig, WorkflowStep (แบบย่อ)
- **คำร้อง F07:** ITRequestF07, รันเลขที่จาก DocConfig, ส่งเมลอนุมัติ, อนุมัติทางลิงก์ (approvalToken), AuditLog ตอน approve/reject
- **Workflow อย่างง่าย:** getDeptManagerEmail(departmentId) สำหรับหาผู้อนุมัติ

---

## 4. สิ่งที่ยังไม่มี (ถ้าจะให้เทียบระบบเก่า)

- ตาราง Statuses, Actions, WorkflowTransitions แบบเต็ม (CurrentStatusID, ActionID, RequiredRoleID, NextStatusID, FilterByDepartment, StepSequence)
- CorrectionTypes, CategoryCorrectionTypeMappings, RequestCorrectionTypes, CorrectionReasons
- ApprovalHistory แยกจาก AuditLog
- RoleTabs + Tabs ใน DB (ตอนนี้ใช้ hardcode ใน auth-constants)
- SpecialRoles, UserSpecialRoles, SpecialApproverMappings
- Notifications, EmailTemplates, EmailLog
- Admin UI: จัดการ User, Role, Department, Category, Location, DocConfig, Workflow, AuditLog report
- ViewScope (OWN / ASSIGNED / ALL) และการ filter รายการคำร้องตาม role/department
- Parallel approval, Bulk actions (allowBulk)

---

## 5. API Routes ระบบเก่า → REQUESTONLINE

ระบบเก่าใช้ Express (`/api/admin`, `/api/auth`, `/api/dashboard`, `/api/master-data`, `/api/notifications`, `/api/requests`). REQUESTONLINE ใช้ Next.js App Router: หน้า Server Component, Server Actions, และ API routes ภายใต้ `app/api/` (ถ้ามี).

### adminRoutes.js (prefix เช่น `/api/admin`) — ต้อง protect + authorize('Admin')

| Route เก่า | Method | สถานะใน REQUESTONLINE |
|------------|--------|------------------------|
| `/roles/mytabs` | GET | แท็บตาม role: ใช้ getTabsForRole(roleName) ใน client (DashboardHeader) |
| `/audit-logs` | GET | ยังไม่มี |
| `/audit-logs/actions` | GET | ยังไม่มี |
| `/operation-audit-report` | GET | ยังไม่มี |
| `/actions` | GET | ยังไม่มี (ไม่มีตาราง Actions) |
| `/roles` | GET, POST | ยังไม่มี (Role มีใน Prisma/seed) |
| `/roles/:id` | PUT, DELETE | ยังไม่มี |
| `/users` | GET | ยังไม่มี |
| `/users/:id` | GET | ยังไม่มี |
| `/users/:id/permissions` | GET | ยังไม่มี (มี User.accessibleCategories ใน Prisma) |
| `/users/:id/approver-mappings` | GET | ยังไม่มี |
| `/users/:id/special-roles` | GET | ยังไม่มี |
| `/users/:id` | PUT, DELETE | ยังไม่มี |
| `/users/:id/reset-password` | POST | ยังไม่มี |
| `/doc-configs` | GET, POST | DocConfig ใช้ใน f07-action; ยังไม่มี Admin CRUD |
| `/correction-types` | GET, POST | ยังไม่มี |
| `/correction-types/:id/categories` | GET | ยังไม่มี |
| `/correction-types/:id` | PUT, DELETE | ยังไม่มี |
| `/correction-reasons` | GET, POST | ยังไม่มี |
| `/correction-reasons/:id` | PUT | ยังไม่มี |
| `/workflows/all` | GET | ยังไม่มี |
| `/workflows` | GET, POST | ยังไม่มี |
| `/workflows/copy` | POST | ยังไม่มี |
| `/workflows` (delete) | DELETE | ยังไม่มี |
| `/special-roles` | GET | ยังไม่มี |
| `/email-templates` | GET | ยังไม่มี |
| `/email-templates/:id` | PUT | ยังไม่มี |
| `/special-approvers` | GET, POST | ยังไม่มี |

### authRoutes.js (prefix เช่น `/api/auth`)

| Route เก่า | Method | สถานะใน REQUESTONLINE |
|------------|--------|------------------------|
| `/register` | POST | ยังไม่มี (มีแค่ seed User) |
| `/login` | POST | มี: NextAuth Credentials ที่ `app/api/auth/[...nextauth]` |
| `/change-password` | PUT | ยังไม่มี |
| `/my-stats` | GET | ยังไม่มี |
| `/profile` | GET | session จาก NextAuth ใช้ได้ใน client/server |
| `/admin-check` | GET | เช็ค role ใน middleware / dashboard ได้ |

### dashboardRoutes.js (prefix เช่น `/api/dashboard`)

| Route เก่า | Method | สถานะใน REQUESTONLINE |
|------------|--------|------------------------|
| `/statistics` | GET | ข้อมูลสถิติดึงใน `app/dashboard/page.tsx` (groupBy status) |
| `/category-stats` | GET | ยังไม่มี (กราฟตาม category) |
| `/report-data` | GET | ยังไม่มี (Admin/Head of Dept report) |

### masterDataRoutes.js (prefix เช่น `/api/master-data`)

| Route เก่า | Method | สถานะใน REQUESTONLINE |
|------------|--------|------------------------|
| `/statuses` | GET | ยังไม่มี (F07 ใช้ status string) |
| `/locations` | GET | ดึงใน `app/request/new/page.tsx` จาก Prisma |
| `/my-categories` | GET | User.accessibleCategories; ยังไม่มี API แยก |
| `/correction-types` | GET | ยังไม่มี |
| `/correction-reasons` | GET | ยังไม่มี |
| `/workflow-preview` | GET | ยังไม่มี |
| `/categories` | GET, POST | GET ใช้ในฟอร์ม F07; POST ยังไม่มี |
| `/categories/:id` | PUT, DELETE | ยังไม่มี |
| `/locations` | POST | ยังไม่มี |
| `/locations/:id` | PUT, DELETE | ยังไม่มี |
| `/locations/:id/categories` | GET | ยังไม่มี |
| `/departments` | GET, POST | GET ใช้ในฟอร์ม F07; POST ยังไม่มี |
| `/departments/:id` | PUT, DELETE | ยังไม่มี |
| `/statuses/:id` | PUT | ยังไม่มี |

### notificationRoutes.js (prefix เช่น `/api/notifications`)

| Route เก่า | Method | สถานะใน REQUESTONLINE |
|------------|--------|------------------------|
| `/` | GET | ยังไม่มี (ไม่มีตาราง Notifications) |
| `/mark-all-read` | PUT | ยังไม่มี |
| `/:id/read` | PUT | ยังไม่มี |

### requestRoutes.js (prefix เช่น `/api/requests`)

| Route เก่า | Method | สถานะใน REQUESTONLINE |
|------------|--------|------------------------|
| `/` | GET | รายการล่าสุดดึงใน `app/dashboard/page.tsx` (findMany ITRequestF07) |
| `/` | POST | มี: submitF07 (Server Action) ใน `app/actions/f07-action.ts` |
| `/bulk-action` | POST | ยังไม่มี |
| `/export` | GET | ยังไม่มี (export Excel) |
| `/history` | GET | ยังไม่มี (ประวัติที่ผู้อนุมัติทำ) |
| `/:id/correction-types` | GET | ยังไม่มี |
| `/:id/action` | POST | อนุมัติทางลิงก์: handleApprovalAction ใน `app/actions/approve-action.ts` (ไม่ใช่ REST ตาม id) |
| `/:id` | GET, PUT, DELETE | GET ใช้ใน approve/[token]/page; PUT/DELETE ยังไม่มี |

---

## 6. Utils ระบบเก่า → REQUESTONLINE

### asyncHandler.js
| หน้าที่ | สถานะใน REQUESTONLINE |
|--------|------------------------|
| ห่อ async route handler ให้ catch(next) | ไม่ใช้: Next.js Server Actions / API routes จัดการ async เอง; ใช้ try/catch ใน action |

### cache.js (NodeCache, TTL 1 ชม.)
| หน้าที่ | สถานะใน REQUESTONLINE |
|--------|------------------------|
| cache ข้อมูล categories, locations, statuses, roles, correction_types, correction_reasons | ยังไม่มี: ดึงจาก Prisma โดยตรง; ถ้าต้องการ cache ใช้ React cache() หรือ in-memory ใน Server Action |

### crashHandler.js
| หน้าที่ | สถานะใน REQUESTONLINE |
|--------|------------------------|
| uncaughtException, unhandledRejection → log แล้ว process.exit(1) | ยังไม่มี: ถ้าต้องการให้เพิ่มใน `instrumentation.ts` (Next.js) หรือจุดเริ่มต้นแอป |
| gracefulShutdown(server) → ปิด HTTP + DB pool | Next.js ไม่ได้ยิง server เองใน dev; production ใช้ process manager (PM2 etc.) จัดการ |

### dateHelper.js (moment-timezone)
| หน้าที่ | สถานะใน REQUESTONLINE |
|--------|------------------------|
| getCurrentBangkokTime() → Date ใน Asia/Bangkok | ยังไม่มี: AuditLog ใช้ `@default(now())` (server time); ถ้าต้องการ Bangkok ใช้ `Intl` หรือเพิ่ม lib date ในโพรเจกต์ |

### emailService.js (frontend) / lib/mail.ts (backend)
| ระบบเก่า | REQUESTONLINE |
|-----------|----------------|
| frontend: axios.post(VITE_INTERNAL_EMAIL_API_URL, payload) | **lib/mail.ts**: ใช้ `fetch` ส่งไป INTERNAL_EMAIL_API_URL (หรือ VITE_*) ไม่ใช้ axios |
| payload: businessUnit, appName, subject, body, to, cc, bcc, attachments | โครง payload เดียวกันใน sendApprovalEmail |

### emailTemplates.js (backend) / lib/email-helper.ts
| ระบบเก่า | REQUESTONLINE |
|-----------|----------------|
| mainTemplate(title, content) | **lib/email-helper.ts**: mainTemplate(title, content) มีแล้ว |
| getRequestLink(requestId) → FRONTEND_URL/request/:id | เราใช้ `/approve/[token]` ไม่ใช้ request/:id |
| getApprovalEmail(request) | **getApprovalTemplate(request, approverName)** มีแล้ว – subject + body สำหรับลิงก์อนุมัติ |
| getRevisionEmail(request), getCompletionEmail(request) | ยังไม่มี (ไม่มี flow ส่งกลับ/เสร็จสิ้นแบบหลายขั้น) |

### errors.js
| ระบบเก่า | สถานะใน REQUESTONLINE |
|-----------|------------------------|
| AppError, BadRequestError (400), UnauthorizedError (401), ForbiddenError (403), NotFoundError (404) | ยังไม่มีคลาสแยก: Server Actions return `{ error: '...' }` หรือ throw; หน้าใช้ notFound() จาก next/navigation ได้ |

### logger.js (winston)
| หน้าที่ | สถานะใน REQUESTONLINE |
|--------|------------------------|
| log ลงไฟล์/console พร้อม timestamp, level, stack | ยังไม่มี: ใช้ console.log/console.error; ถ้าต้องการให้เพิ่ม pino หรือ winston ในโพรเจกต์ |

### workflowHelper.js
| ฟังก์ชันเก่า | REQUESTONLINE |
|--------------|----------------|
| findNextApprovers(request) | ยังไม่มี: ใช้ WorkflowTransitions + Permission + SpecialApproverMappings |
| notifyNextApprovers(request, nextStatusId) | **lib/workflow.ts**: มีแค่ **getDeptManagerEmail(departmentId)** – หาเมลหัวหน้าแผนกสำหรับส่งเมลอนุมัติ F07 (แบบขั้นเดียว) |
| notifyRequester(requesterId, requestId, message) | ยังไม่มี (ไม่มีตาราง Notifications) |

สรุป: REQUESTONLINE มี **lib/mail.ts** (ส่งเมล), **lib/email-helper.ts** (เทมเพลตอนุมัติ), **lib/workflow.ts** (getDeptManagerEmail). ส่วน cache, crash handler, date Bangkok, error classes, logger, workflow แบบหลายขั้น (findNextApprovers, notifyNextApprovers, notifyRequester) ยังไม่มี – เพิ่มได้เมื่อต้องการเทียบระบบเก่าเต็มรูปแบบ.

---

## 7. Validators ระบบเก่า → REQUESTONLINE

ระบบเก่าใช้ **express-validator** (body, validationResult) ใน middleware; REQUESTONLINE ใช้ Server Actions – ตรวจใน action ด้วย if/throw หรือ Zod (หรือ validator อื่น).

### backend/src/validators/userValidator.js

| ชุด validation เก่า | กฎ | สถานะใน REQUESTONLINE |
|---------------------|-----|------------------------|
| **userUpdateValidation** | FullName ต้องไม่ว่าง, Email optional ต้องเป็น email, RoleID ต้องเป็น int ≥ 1 | ยังไม่มี: หน้า/API อัปเดต User ยังไม่มี; เมื่อมีให้ตรวจใน Server Action (หรือ Zod schema) |
| **passwordResetValidation** | password ความยาวอย่างน้อย 6 ตัวอักษร | ยังไม่มี: ฟังก์ชันรีเซ็ตรหัสผ่านยังไม่มี; เมื่อมีให้ตรวจใน Server Action |

### backend/src/middleware/validators.js (อ้างอิงจากที่ส่งมาก่อนหน้า)

| ชุด validation เก่า | กฎ | สถานะใน REQUESTONLINE |
|---------------------|-----|------------------------|
| validateRegisterUser | username, password (min 6), fullName ต้องมี | ยังไม่มี (ไม่มี register) |
| validateCreateRequest | categoryId int ≥ 1, requestDate ISO8601, problemDetail ไม่ว่าง | ควรเพิ่มใน **f07-action**: ตรวจ categoryId, problemDetail; requestDate ถ้ามี |
| validateApproveRequest | comment optional string | ใช้ใน approve-action ได้ (comment optional) |
| validateCloseRequest | operatorName ไม่ว่าง, completedAt ISO8601 | ยังไม่มี (ไม่มี flow ปิดงาน IT) |
| validateRejectRequest | rejectionReason ไม่ว่าง | approve-action ใช้ status REJECTED; ถ้าต้องการเหตุผลเพิ่มฟิลด์ + validation |
| validateChangePassword | oldPassword ไม่ว่าง, newPassword min 6 | ยังไม่มี (ไม่มีหน้าเปลี่ยนรหัส); เมื่อมีให้ใช้กฎนี้ใน Server Action |

**แนวทางใน REQUESTONLINE:** ใน Server Action ใช้ `if (!x) return { error: '...' }` หรือ `z.object({...}).parse(formData)` (Zod) แล้ว return errors ให้ฟอร์มแสดง; ไม่ใช้ express-validator โดยตรง.

---

## 8. Config / Database ระบบเก่า → REQUESTONLINE

### backend/src/config/db.js

| ระบบเก่า | สถานะใน REQUESTONLINE |
|----------|------------------------|
| **mssql** (ConnectionPool) | ไม่ใช้: ใช้ **Prisma** + driver adapter |
| **initializeDatabase()** | ไม่ใช้: Prisma เชื่อมต่อเมื่อเรียก query ครั้งแรก (หรือเมื่อสร้าง PrismaClient) |
| **getPool()** | ไม่ใช้: ใช้ **prisma** จาก `lib/prisma.ts` (singleton PrismaClient) |
| **sql** (สำหรับ parameterized query) | ไม่ใช้: ใช้ Prisma API (prisma.user.findMany, prisma.iTRequestF07.create ฯลฯ) |
| **Env:** DB_USER, DB_PASSWORD, DB_SERVER, DB_DATABASE | **Env:** `DATABASE_URL` (หรือไม่ตั้ง – ใช้ SQLite ฝังไฟล์ `file:./prisma/dev.db`) |
| **Pool config:** max 10, min 0, idleTimeoutMillis 30000 | Prisma + adapter จัดการ connection เอง |
| **options:** encrypt, trustServerCertificate | ใช้ใน connection string เมื่อใช้ SQL Server (encrypt=true;trustServerCertificate=true) |
| **pool.on('error')**, logger เมื่อ connect ล้มเหลว | ยังไม่มี: ถ้าต้องการ log เมื่อ Prisma connect ล้มเหลว ให้ลอง query ครั้งแรกใน startup หรือใช้ instrumentation |

**REQUESTONLINE ปัจจุบัน:** `lib/prisma.ts` สร้าง PrismaClient ด้วย `PrismaBetterSqlite3` (SQLite); URL จาก `DATABASE_URL` (ถ้าขึ้นต้นด้วย `file:`) หรือ default `file:./prisma/dev.db`. ไม่มี initializeDatabase แยก – เรียกใช้ prisma ใน Server Components / Server Actions โดยตรง.

---

เมื่อต้องการเพิ่มฟีเจอร์ใด ให้อ้างอิงจากไฟล์ config/controllers/models/routes/utils/validators ที่ส่งมา และเทียบกับตารางนี้แล้วค่อยออกแบบ Prisma + Server Actions / API ต่อครับ.
