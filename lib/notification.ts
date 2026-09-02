
import { prisma } from './prisma';

/**
 * สร้างการแจ้งเตือนให้กับผู้ใช้
 * @param userId ID ของผู้รับการแจ้งเตือน
 * @param message ข้อความแจ้งเตือน
 * @param requestId (Optional) ID ของคำร้องที่เกี่ยวข้อง
 */
export async function createNotification(userId: number, message: string, requestId?: number) {
    try {
        await prisma.notification.create({
            data: {
                userId,
                message,
                requestId: requestId ?? null,
            },
        });
    } catch (error) {
        console.error(`[Notification] Failed to create notification for User ${userId}:`, error);
        // Suppress error to avoid blocking main transaction
    }
}

/**
 * สร้างการแจ้งเตือนให้กับกลุ่มผู้ใช้ตาม Role (เช่น IT หรือ Acc)
 * Note: ถ้ามี user เยอะ อาจต้องทำ background job หรือ batch insert
 */
export async function createNotificationForRole(roleName: string, message: string, requestId?: number, excludeUserId?: number) {
    // TODO: implement lookup users by role and batch insert
    // For now, keep it simple or implement later if needed.
    // Usually notifications target specific next approvers.
}

/**
 * แจ้งเตือน Admin เมื่อคำร้องไม่มีผู้อนุมัติขั้นถัดไป
 *
 * ถ้าไม่มีใครรับช่วงต่อ คำร้องจะค้างอยู่เงียบ ๆ โดยไม่มีใครรู้ (ก่อนหน้านี้
 * ระบบเขียนแค่ console.warn) จึงต้องดันเรื่องขึ้นไปหา Admin ให้เข้าไปแก้
 * Workflow / ผู้อนุมัติ แทนที่จะปล่อยให้เงียบ
 *
 * ทำงานแบบ best effort — ไม่โยน error กลับไปขัดขั้นตอนหลักที่สำเร็จไปแล้ว
 */
export async function notifyAdminsOfStalledRequest(params: {
    requestId: number;
    workOrderNo?: string | null;
    reason: string;
}) {
    const { requestId, reason } = params;
    const workOrderNo = params.workOrderNo || `#${requestId}`;
    const message = `⚠️ คำร้อง ${workOrderNo} ค้างในระบบ: ${reason} กรุณาตรวจสอบการตั้งค่า Workflow หรือผู้อนุมัติ`;

    try {
        const admins = await prisma.user.findMany({
            where: { isActive: true, role: { roleName: 'Admin' } },
            select: { id: true, email: true },
        });

        if (admins.length === 0) {
            console.error(`[stalled] ${message} — ไม่พบบัญชี Admin ที่ใช้งานอยู่เพื่อแจ้งเตือน`);
            return;
        }

        console.warn(`[stalled] ${message} — แจ้ง Admin ${admins.length} คน`);
        for (const admin of admins) {
            await createNotification(admin.id, message, requestId);
        }

        const emails = admins.map((a) => a.email).filter((email): email is string => Boolean(email));
        if (emails.length === 0) return;

        const { sendApprovalEmail } = await import('./mail');
        const sent = await sendApprovalEmail({
            to: emails,
            subject: `[ต้องตรวจสอบ] คำร้อง ${workOrderNo} ไม่มีผู้อนุมัติขั้นถัดไป`,
            body: `<p>${message}</p><p>รหัสคำร้อง: ${requestId}</p>`,
        });
        if (!sent.ok) console.error('[stalled] ส่งเมลแจ้ง Admin ล้มเหลว:', sent);
    } catch (error) {
        console.error('[stalled] แจ้งเตือน Admin ล้มเหลว:', error);
    }
}

/**
 * ทำเครื่องหมายอ่านแล้วสำหรับแจ้งเตือนของ user คนนี้ที่ผูกกับคำร้องที่เพิ่งดำเนินการ
 * (เช่น "มีใบงานรออนุมัติ" — เมื่ออนุมัติ/ปฏิเสธไปแล้วถือว่าอ่านแล้วโดยปริยาย ไม่ว่าจะทำผ่านช่องทางไหน)
 */
export async function markNotificationsReadForRequests(userId: number, requestIds: number[]) {
    if (requestIds.length === 0) return;
    try {
        await prisma.notification.updateMany({
            where: { userId, requestId: { in: requestIds }, isRead: false },
            data: { isRead: true },
        });
    } catch (error) {
        console.error(`[Notification] Failed to mark read for User ${userId}:`, error);
    }
}
