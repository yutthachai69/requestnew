# การ map Context เก่า (React) → REQUESTONLINE (Next.js)

เอกสารอ้างอิงการย้าย Context จาก frontend เก่า (AuthContext, CategoryContext, AppNotificationContext, NotificationContext, SocketContext, StatusContext) มาใช้ใน Next.js

---

## สรุปการใช้งาน

| Context เก่า | Hook เก่า | ใน REQUESTONLINE | หมายเหตุ |
|--------------|-----------|------------------|----------|
| AuthContext | useAuth() | **useSession()** จาก next-auth/react | ไม่มี AuthProvider; ใช้ NextAuth |
| CategoryContext | useCategories() | **useCategories()** จาก app/context/CategoryContext | ดึงจาก /api/master/categories |
| AppNotificationContext | useAppNotification() | **useAppNotification()** จาก app/context/AppNotificationContext | Stub จนมี Notification API |
| NotificationContext | useNotification() | **useNotification()** จาก app/context/NotificationContext | ด้านหลังใช้ react-hot-toast |
| StatusContext | useStatuses() | **useStatuses()** จาก app/context/StatusContext | ใช้ lib/status-constants จนมีตาราง Status |
| SocketContext | useSocket() | **useSocket()** จาก app/context/SocketContext | คืน null จน backend มี Socket.IO |

---

## โครงสร้างไฟล์

```
app/
  context/
    AppNotificationContext.tsx   # notifications, unreadCount, markAsRead, markAllAsRead, refresh
    CategoryContext.tsx          # categories, loading, refresh
    NotificationContext.tsx      # showNotification(message, severity)
    SocketContext.tsx            # socket (null)
    StatusContext.tsx             # statuses, getStatusByCode, getStatusNameByCode, getStatusByLevel
  components/
    Providers.tsx                # รวมทุก Provider + Toaster
  api/
    master/
      categories/
        route.ts                 # GET คืนรายการหมวดหมู่ตาม role
lib/
  status-constants.ts            # STATUS_LIST, getStatusByCode, getStatusNameByCode
```

---

## ขั้นตอนถัดไป (เมื่อมี Backend เพิ่ม)

1. **AppNotificationContext**  
   เพิ่ม model Notification ใน Prisma, API GET /api/notifications, PATCH markAsRead, POST mark-all-read แล้วให้ `fetchNotifications` ใน AppNotificationContext เรียก API เหล่านั้น

2. **StatusContext**  
   เพิ่ม model Status ใน Prisma + API /api/master/statuses แล้วให้ StatusProvider ดึงจาก API แทน status-constants

3. **SocketContext**  
   เมื่อ backend รองรับ Socket.IO ให้ติดตั้ง socket.io-client และใน SocketProvider เชื่อมต่อเมื่อ session มีค่า แล้ว listen events (new_request, request_updated, …) แล้วเรียก refresh ของ AppNotification + useNotification สำหรับ snackbar
