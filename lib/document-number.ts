
import { Prisma } from '@prisma/client';

/** Category code mapping (fallback) */
const CATEGORY_CODES: Record<number, string> = {
    1: 'IT-F07-GN', 2: 'IT-F07-MA', 3: 'IT-F07-WB', 4: 'IT-F07-TC', 5: 'IT-F07-WH',
};

/**
 * ออกเลขที่เอกสารถัดไปของหมวดหมู่/ปี พ.ศ. ที่ระบุ
 *
 * ต้องเรียกภายใน transaction ของผู้เรียก เลขที่ได้จึงผูกกับคำร้องที่กำลังสร้าง
 *
 * เรื่องการชนกันเมื่อมีคนยื่นพร้อมกัน:
 * เดิมทำ SELECT ก่อนแล้วค่อย UPDATE ซึ่งภายใต้ SERIALIZABLE ทำให้แต่ละ transaction
 * ถือ shared lock บนแถวเดียวกันแล้วต่างฝ่ายต่างขอ exclusive lock → deadlock แบบ
 * lock upgrade วัดได้จริงตอนสร้าง 5 ใบพร้อมกัน (สูงสุด 13.7 วินาที และล้มเหลว)
 *
 * ตอนนี้เพิ่มค่าด้วย UPDATE ... OUTPUT คำสั่งเดียว ซึ่งจับ exclusive lock ตั้งแต่แรก
 * ไม่มีการอัปเกรด lock จึงไม่เกิด deadlock รูปแบบนั้น และยังได้ค่าใหม่กลับมาในคำสั่ง
 * เดียวโดยไม่ต้อง SELECT ซ้ำ
 */
export async function generateRequestNumber(
    tx: Prisma.TransactionClient,
    categoryId: number,
    requestDate: Date = new Date()
): Promise<string> {
    const currentYearBE = requestDate.getFullYear() + 543;
    const shortYear = currentYearBE.toString().slice(-2);

    const bumped = await incrementRunningNumber(tx, categoryId, currentYearBE);
    if (bumped) {
        return format(bumped.prefix, shortYear, bumped.lastRunningNumber);
    }

    // ยังไม่มี config ของปีนี้ — สืบ prefix จากปีก่อนหน้าแล้วสร้างเริ่มที่ 1
    const lastConfig = await tx.docConfig.findFirst({
        where: { categoryId },
        orderBy: { year: 'desc' },
        select: { prefix: true },
    });
    const prefix = lastConfig?.prefix || CATEGORY_CODES[categoryId] || 'IT-F07';

    try {
        const created = await tx.docConfig.create({
            data: { categoryId, year: currentYearBE, prefix, lastRunningNumber: 1 },
            select: { prefix: true, lastRunningNumber: true },
        });
        return format(created.prefix, shortYear, created.lastRunningNumber);
    } catch (e) {
        // อีก transaction สร้าง config ของปีนี้ไปก่อนแล้ว (unique categoryId+year)
        // — เพิ่มค่าจากของที่มีอยู่แทน
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            const retry = await incrementRunningNumber(tx, categoryId, currentYearBE);
            if (retry) return format(retry.prefix, shortYear, retry.lastRunningNumber);
        }
        throw e;
    }
}

/**
 * เพิ่ม lastRunningNumber ทีละ 1 แล้วคืนค่าใหม่ ด้วย UPDATE คำสั่งเดียว
 * คืน null เมื่อยังไม่มี config ของหมวดหมู่/ปีนั้น
 */
async function incrementRunningNumber(
    tx: Prisma.TransactionClient,
    categoryId: number,
    year: number
): Promise<{ prefix: string; lastRunningNumber: number } | null> {
    const rows = await tx.$queryRaw<{ prefix: string; lastRunningNumber: number }[]>`
        UPDATE [DocConfig]
        SET [lastRunningNumber] = [lastRunningNumber] + 1
        OUTPUT inserted.[prefix] AS [prefix], inserted.[lastRunningNumber] AS [lastRunningNumber]
        WHERE [categoryId] = ${categoryId} AND [year] = ${year}
    `;
    return rows[0] ?? null;
}

function format(prefix: string, shortYear: string, runningNumber: number): string {
    return `${prefix}-${shortYear}-${runningNumber.toString().padStart(3, '0')}`;
}
