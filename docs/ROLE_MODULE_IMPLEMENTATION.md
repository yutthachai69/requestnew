# การ implement Role และโมดูลตามสเปก

อ้างอิงจากไฟล์สเปก "รายละเอียด Role และโมดูลของระบบขอแก้ไขข้อมูลออนไลน์"

## 1. Roles ที่รองรับในระบบ (lib/auth-constants.ts)

| Role (ชื่อในระบบ) | หมายเหตุ |
|-------------------|----------|
| **Admin** | ผู้ดูแลระบบ |
| **Requester** | ผู้ขอแก้ไข (รองรับชื่อ **User** ใน DB ด้วย) |
| **Head of Department** | หน.แผนก (รองรับ **Manager** ด้วย) |
| **Accountant** | บัญชี/ผู้ใช้พิเศษ |
| **Final Approver** | ผู้อนุมัติขั้นสุดท้าย |
| **IT Reviewer** | ผู้ตรวจสอบฝ่าย IT (รองรับ **IT** ด้วย) |

## 2. เมนูตาม Role (ตารางสเปก)

| เมนู | Admin | Head of Department | Requester | Accountant | Final Approver | IT Reviewer |
|------|:-----:|:------------------:|:---------:|:----------:|:--------------:|:------------:|
| หน้าแรก | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| รายงาน | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| หมวดหมู่ (แต่ละหมวด) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ผู้ดูแลระบบ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| โปรไฟล์ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ออกจากระบบ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**เพิ่มจากสเปก (ใน sidebar):**
- **ภาพรวม** (/dashboard): Admin, Head of Department, Accountant, Final Approver, IT Reviewer (Requester ไม่เห็นและเข้าไม่ได้)
- **รายการที่ต้องอนุมัติ/ดำเนินการ** (/pending-tasks): Admin + ทุก approver role
- **ยื่นคำร้อง** (/request/new): Admin เท่านั้น (Requester สร้างคำร้องจากในหมวดหมู่)

## 3. สิทธิ์ที่ implement แล้ว

| การกระทำ | เงื่อนไข (implement) |
|----------|------------------------|
| **เข้าเมนู Admin** | เฉพาะ `roleName === 'Admin'` |
| **เข้า /report** | เฉพาะ Admin, Head of Department (middleware + reportRoles) |
| **เข้า /dashboard** | Admin, Head of Department, Accountant, Final Approver, IT Reviewer (Requester redirect ไป /welcome) |
| **แก้ไขคำร้อง (ปุ่มแก้ไข)** | Requester/User + เจ้าของคำร้อง + สถานะ PENDING (หน้า category) |
| **ลบคำร้อง** | Backend: Admin ลบได้ทุกสถานะ; Requester ลบได้เฉพาะของตัวเองและ PENDING |
| **Bulk Actions (เลือกหลายคำร้อง)** | แสดง checkbox เฉพาะ Admin, Head of Department (dashboard) |
| **รายการที่ต้องอนุมัติ** | แสดงเฉพาะ approver roles และกรองตาม Workflow step + Special Approver + FilterByDepartment |

## 4. โมดูล Admin ที่มีหน้าแล้ว

- จัดการผู้ใช้งาน (`/admin/users`)
- จัดการสิทธิ์ (Role) (`/admin/roles`)
- ตั้งค่า Workflow (`/admin/workflows`)
- จัดการ Email Templates (`/admin/email-templates`)
- จัดการประเภทการแก้ไข (`/admin/correction-types`)
- จัดการเหตุผลการแก้ไข (`/admin/correction-reasons`)
- จัดการสถานะ (`/admin/statuses`)
- จัดการแผนก (`/admin/departments`)
- จัดการหมวดหมู่ (`/admin/categories`)
- จัดการสถานที่ (`/admin/locations`)
- ตั้งค่าเลขที่เอกสาร (`/admin/doc-config`)
- ประวัติการใช้งาน (`/admin/audit-logs`)
- รายงานประวัติการแก้ไข (`/admin/audit-report`)

## 5. สิ่งที่ยังไม่ได้ทำจากสเปก (หรือใช้ค่าคงที่)

- **ViewScope** (OWN / ASSIGNED / ALL): ตอนนี้ใช้ logic แบบย่อ – ไม่ใช่ Admin จะเห็นเฉพาะคำร้องของตัวเอง (OWN); Admin เห็นทั้งหมด (ALL). ยังไม่ได้ implement ASSIGNED แยกตาม category + ขั้น workflow.
- **Tabs ใน Dashboard จาก DB**: ตอนนี้แท็บ (คำร้องของฉัน / รายการที่เสร็จแล้ว) กำหนดใน frontend ยังไม่ได้ดึงจากตาราง `Tabs`, `RoleTabs` ใน DB.
- **Special Roles (UserSpecialRoles)**: ยังไม่มีหลาย role ต่อ user ต่อหมวดหมู่.
- **สถานะ PENDING_HOD, REVISION_REQUIRED**: ใน schema ใช้แค่ PENDING; ถ้าเพิ่มสถานะเหล่านี้ใน DB ต้องผูกแก้ไข/ลบกับสถานะเหล่านี้ด้วย.

## 6. ไฟล์ที่แก้ในรอบนี้

- `lib/auth-constants.ts` – รายการ role, reportRoles, approverRoles, requesterRoles, getTabsForRole ตามสเปก
- `middleware.ts` – /report เฉพาะ Admin + Head of Department, /dashboard ไม่ให้ Requester/User เข้า
- `app/(main)/category/[id]/page.tsx` – ปุ่มแก้ไข/ลบเฉพาะ Requester + เจ้าของคำร้อง + PENDING
