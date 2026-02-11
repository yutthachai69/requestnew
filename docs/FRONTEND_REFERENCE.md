# อ้างอิง Frontend ระบบเก่า → REQUESTONLINE (Next.js)

เอกสารเทียบโครงสร้างและ component จาก frontend เก่า (React + Vite + MUI + React Router) กับ REQUESTONLINE (Next.js App Router) เพื่อทำ **frontend ใหม่** ให้ flow เดิม

---

## 1. โครงสร้าง Frontend เก่า

```
frontend/src/
├── assets/           # รูป, logo (tsmlogo.png)
├── components/       # component ใช้ร่วม
│   ├── skeletons/    # RequestTableSkeleton
│   ├── AdminRoute.jsx
│   ├── AnimatedPage.jsx
│   ├── AttachmentsManager.jsx
│   ├── CategoryChart.jsx
│   ├── LocationBreakdownChart.jsx
│   ├── MainLayout.jsx
│   ├── NotificationBell.jsx
│   ├── ProtectedRoute.jsx
│   ├── RequestStatusChart.jsx
│   ├── RequestTable.jsx
│   └── StatusBreakdownChart.jsx
├── context/          # AuthContext, CategoryContext, AppNotificationContext, StatusContext, NotificationContext
├── helpers/          # emailTemplateHelper, NotoSansThai base64
├── hooks/            # useFetchData
├── pages/            # หน้าจอ (Login, Dashboard, Request detail, Admin ฯลฯ)
├── services/         # API client (auth, request, masterData ฯลฯ)
├── App.jsx, main.jsx, theme.js
```

---

## 2. สรุป Component เก่า → ใช้ทำอะไรใน Frontend ใหม่

| Component เก่า | หน้าที่ | ใน REQUESTONLINE (Frontend ใหม่) |
|----------------|--------|----------------------------------|
| **MainLayout.jsx** | Drawer + AppBar, เมนูตาม role (หน้าแรก, รายงาน, หมวดหมู่ตาม category, Admin เท่านั้น: ผู้ดูแลระบบ → users, roles, workflows, email-templates, correction-types/reasons, statuses, departments, categories, locations, doc-config, audit-logs, audit-report), ปุ่มกลับ, NotificationBell, เมนู user (โปรไฟล์, ออกจากระบบ) | ใช้เป็นแม่แบบ: **layout มี sidebar + header + notification + เมนูตาม role**; ทำใหม่ใน Next.js (layout.tsx หรือ layout ใต้ (dashboard)) |
| **ProtectedRoute.jsx** | เช็ค user + allowedRoles → ไม่ผ่านไป login หรือ "/" | เทียบ **middleware + session** ใน Next.js (เรามีแล้ว); หน้าใช้ getServerSession หรือ redirect ใน layout |
| **AdminRoute.jsx** | เช็ค user + roleName === 'Admin' → ใช้ MainLayout | เทียบ **middleware เช็ค role Admin** สำหรับ path /admin/* |
| **RequestTable.jsx** | ตารางคำร้อง: เลขที่, รายละเอียด, ผู้ขอ, วันที่, สถานะ (Chip สีจาก Statuses), NextApprovers, LatestComment, ปุ่ม ดู/แก้ไข/ลบ (ตามสิทธิ์), Bulk checkbox (allowBulkActions) | ใช้เป็นแม่แบบ: **ตารางรายการคำร้อง + สถานะ + ผู้อนุมัติถัดไป + comment + bulk**; ทำใหม่ใน Next.js (Server Component ตาราง + Client ปุ่ม/checkbox) |
| **RequestTableSkeleton.jsx** | Loading skeleton สำหรับตาราง | ใช้เมื่อโหลดรายการคำร้อง (Suspense fallback หรือ skeleton component) |
| **RequestStatusChart.jsx** | Doughnut สถานะคำร้อง (labels = Object.keys(data)) | เรามี StatusChart (Doughnut) อยู่แล้ว; ปรับให้รับ data รูปแบบเดียวกันได้ |
| **CategoryChart.jsx** | Bar แนวนอน จำนวนคำร้องต่อ CategoryName | เพิ่มใน Dashboard เมื่อมี API category-stats |
| **LocationBreakdownChart.jsx** | Bar แนวนอน จำนวนต่อ LocationName | เพิ่มเมื่อมีข้อมูล location breakdown |
| **StatusBreakdownChart.jsx** | Doughnut จำนวนต่อ StatusName | เทียบ StatusChart ที่มีอยู่ |
| **AttachmentsManager.jsx** | ลากวาง/เลือกไฟล์, แสดงรายการไฟล์แนบ, ลบ; accept image, pdf, doc, xls, zip, rar | ใช้เมื่อเพิ่มฟีเจอร์แนบไฟล์ในฟอร์มยื่นคำร้อง |
| **NotificationBell.jsx** | Badge unread, เมนูรายการแจ้งเตือน, markAsRead, markAllAsRead, คลิกไป /request/:id | ใช้เมื่อมีตาราง Notifications + API; ทำใหม่ใน Next.js (Client Component) |
| **AnimatedPage.jsx** | Framer Motion หน้าเข้า/ออก | เลือกใช้ได้ใน frontend ใหม่ (motion.div ครอบเนื้อหา) |

---

## 3. Flow หลักจาก Frontend เก่า

1. **ล็อกอิน** → เก็บ token + user (fullName, roleName, …) ใน AuthContext
2. **หลังล็อกอิน** → เข้า MainLayout: Drawer มี หน้าแรก, รายงาน (Admin/Head of Dept), หมวดหมู่ (รายการ category → /category/:id)
3. **Admin เท่านั้น** → เมนู "ผู้ดูแลระบบ" ขยายได้: users, roles, workflows, email-templates, correction-types, correction-reasons, statuses, departments, categories, locations, doc-config, audit-logs, audit-report
4. **หน้ารายการคำร้อง** (ต่อ category หรือรวม) → RequestTable + filter สถานะ + bulk action (ถ้า allowBulkActions)
5. **หน้ารายละเอียดคำร้อง** → /request/:id แสดงข้อมูล + ประวัติอนุมัติ + ปุ่มดำเนินการ (อนุมัติ/ส่งกลับ/IT ฯลฯ) ตาม possibleActions
6. **แจ้งเตือน** → NotificationBell ดึงจาก API, คลิกไป /request/:id, อ่านทั้งหมด

---

## 4. Context / Services ที่ Frontend เก่าใช้ (เทียบ Next.js)

| เก่า (React) | ใน Next.js (สถานะปัจจุบัน) |
|--------------|---------------------------|
| **AuthContext** (user, token, login, logout) | **NextAuth** session + signIn/signOut; ใช้ `useSession()` ใน Client |
| **CategoryContext** (categories จาก API) | **CategoryProvider** + `useCategories()`; ดึงจาก GET `/api/master/categories` (Admin ได้ทั้งหมด, role อื่นได้ตาม accessibleCategories) |
| **AppNotificationContext** (notifications, unreadCount, markAsRead, markAllAsRead) | **AppNotificationProvider** + `useAppNotification()`; ตอนนี้เป็น stub (คืน [] จนกว่าจะมีตาราง Notification + API) |
| **StatusContext** (statuses จาก API) | **StatusProvider** + `useStatuses()`; ใช้ `lib/status-constants.ts` (PENDING/APPROVED/REJECTED) จนกว่าจะมีตาราง Status ใน DB |
| **NotificationContext** (showNotification แจ้ง success/error) | **NotificationProvider** + `useNotification()`; ใช้ react-hot-toast ด้านหลัง |
| **SocketContext** (Socket.IO real-time) | **SocketProvider** + `useSocket()`; ตอนนี้เป็น placeholder (socket === null จนกว่า backend จะมี Socket.IO) |
| **services (axios)** เรียก backend API | ใช้ **fetch** ไป API routes หรือเรียก **Server Actions** ใน Next.js |

Provider ทั้งหมดรวมอยู่ใน `app/components/Providers.tsx` และ wrap ใน `app/layout.tsx` (ลำดับ: Session → Notification → Category → AppNotification → Status → Socket)

---

## 4.1 Helpers (emailTemplateHelper, NotoSansThai)

| เก่า (frontend/src/helpers) | ใน REQUESTONLINE |
|-----------------------------|------------------|
| **emailTemplateHelper.js** (FRONTEND_URL, mainTemplate, getRequestLink, getApprovalEmail, getRevisionEmail, getCompletionEmail) | **lib/email-helper.ts**: ใช้ `NEXT_PUBLIC_APP_URL` เป็น base; `getRequestLink(requestId)`, `getApprovalEmail`, `getApprovalTemplate` (ลิงก์ token), `getRevisionEmail`, `getCompletionEmail` |
| **NotoSansThai-Thin-normal.js** (notoSansThaiThinBase64 สำหรับ embed ฟอนต์) | **lib/noto-sans-thai-base64.ts**: export `notoSansThaiThinBase64` (อ่านจาก env `NOTO_SANS_THAI_THIN_BASE64` หรือ copy base64 จากไฟล์เดิม); ตัวอักษรไทยบนเว็บใช้ `next/font/google` with 'Noto Sans Thai' ได้ |

---

## 4.2 Hooks

| เก่า (frontend/src/hooks) | ใน REQUESTONLINE |
|---------------------------|------------------|
| **useFetchData.js** (apiFunc, initialData) → { data, loading, error, refresh, setData }; ใช้ useNotification แสดง error | **app/hooks/useFetchData.ts**: `useFetchData<T>(apiFunc, initialData)` รองรับทั้ง Promise\<T\> และ Promise\<{ data: T }\>; ใช้ `useNotification()` แสดง error; return { data, loading, error, refresh, setData } |

---

## 5. เมนู Admin (จาก MainLayout) → หน้าใน REQUESTONLINE

เมื่อทำ frontend ใหม่ ให้มีหน้าเทียบเท่าดังนี้:

| เมนูเก่า | Path เก่า | หน้า Next.js ที่ควรมี |
|----------|-----------|------------------------|
| จัดการผู้ใช้งาน | /admin/users | /admin/users (list + edit/delete user) |
| จัดการสิทธิ์ (Role) | /admin/roles | /admin/roles |
| ตั้งค่า Workflow | /admin/workflows | /admin/workflows |
| จัดการ Email Templates | /admin/email-templates | /admin/email-templates |
| จัดการประเภทการแก้ไข | /admin/correction-types | /admin/correction-types |
| จัดการเหตุผลการแก้ไข | /admin/correction-reasons | /admin/correction-reasons |
| จัดการสถานะ | /admin/statuses | /admin/statuses |
| จัดการแผนก | /admin/departments | /admin/departments |
| จัดการหมวดหมู่ | /admin/categories | /admin/categories |
| จัดการสถานที่ | /admin/locations | /admin/locations |
| ตั้งค่าเลขที่เอกสาร | /admin/doc-config | /admin/doc-config |
| ประวัติการใช้งาน (Log) | /admin/audit-logs | /admin/audit-logs |
| รายงานประวัติการแก้ไข | /admin/audit-report | /admin/audit-report |

---

## 6. สรุปสำหรับทำ Frontend ใหม่

- **Layout:** Drawer + AppBar + เมนูตาม role (หน้าแรก, รายงาน, หมวดหมู่, Admin ขยายได้) + NotificationBell + User menu (โปรไฟล์, ออกจากระบบ) + ปุ่มกลับ
- **รายการคำร้อง:** ตารางมี เลขที่, รายละเอียด, ผู้ขอ, วันที่, สถานะ (Chip สี), ผู้อนุมัติถัดไป, comment ล่าสุด, ปุ่ม ดู/แก้ไข/ลบ ตามสิทธิ์, Bulk checkbox ถ้า allowBulk
- **กราฟ:** Doughnut สถานะ, Bar ต่อ category, Bar ต่อ location (เมื่อมี API)
- **ฟอร์มคำร้อง:** แนบไฟล์ (AttachmentsManager) เมื่อรองรับ
- **แจ้งเตือน:** Badge + dropdown อ่านทั้งหมด + คลิกไปหน้ารายละเอียดคำร้อง
- **Admin:** ครบ 13 เมนูตามตารางด้านบน

ใช้เอกสารนี้ร่วมกับ **BACKEND_REFERENCE.md** จะได้ภาพ flow เต็มทั้ง backend + frontend สำหรับทำระบบทั้งหมดของคนก่อน + frontend ใหม่ใน REQUESTONLINE ครับ
