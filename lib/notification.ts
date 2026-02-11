
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
