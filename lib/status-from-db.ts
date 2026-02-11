/**
 * ดึงสถานะจาก DB (ใช้ฝั่ง server) — fallback ใช้ status-constants
 */
import { prisma } from '@/lib/prisma';
import { getStatusByCode, type StatusItem } from '@/lib/status-constants';

export async function getStatusFromDb(code: string): Promise<StatusItem | undefined> {
  const row = await prisma.status.findUnique({
    where: { code },
  });
  if (row)
    return {
      StatusCode: row.code,
      StatusName: row.displayName,
      ColorCode: row.colorCode,
    };
  return getStatusByCode(code);
}

export async function getAllStatusesFromDb(): Promise<StatusItem[]> {
  const rows = await prisma.status.findMany({
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
  });
  return rows.map((s) => ({
    StatusCode: s.code,
    StatusName: s.displayName,
    ColorCode: s.colorCode,
  }));
}
