
import { Prisma } from '@prisma/client';

export async function generateRequestNumber(
    tx: any,
    categoryId: number,
    requestDate: Date = new Date()
): Promise<string> {
    const currentYearBE = requestDate.getFullYear() + 543;
    const shortYear = currentYearBE.toString().slice(-2);

    // 1. หา Config ของปีปัจจุบัน
    let config = await tx.docConfig.findFirst({
        where: { categoryId, year: currentYearBE }
    });

    // 2. ถ้าไม่มี ให้สร้างใหม่ (เริ่มที่ 0)
    if (!config) {
        // หา Prefix จาก Category หรือใช้ default 'IT-F07' (ควรแก้ให้ดึงจาก Category จริงๆ ถ้ามี field prefix)
        // แต่ใน schema DocConfig มี prefix field อยู่แล้ว ซึ่งน่าจะ copy มาจากปีเก่าได้
        // ลองหาปีล่าสุดก่อนหน้า
        const lastConfig = await tx.docConfig.findFirst({
            where: { categoryId },
            orderBy: { year: 'desc' }
        });

        const prefix = lastConfig?.prefix || 'IT-F07';

        config = await tx.docConfig.create({
            data: { categoryId, year: currentYearBE, prefix, lastRunningNumber: 0 }
        });
    }

    // 3. Increment number
    const nextNumber = config.lastRunningNumber + 1;
    await tx.docConfig.update({
        where: { id: config.id },
        data: { lastRunningNumber: nextNumber }
    });

    // 4. Return formatted string
    return `${config.prefix}-${shortYear}-${nextNumber.toString().padStart(3, '0')}`;
}
