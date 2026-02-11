/**
 * สถานะคำร้อง (เทียบ Statuses ในระบบเก่า)
 * ใช้ก่อนมีตาราง Status ใน DB – หลังเพิ่มตารางแล้วให้ดึงจาก API แทน
 */
export type StatusItem = {
  StatusCode: string;
  StatusName: string;
  ColorCode: string;
  StatusLevel?: number;
};

export const STATUS_LIST: StatusItem[] = [
  { StatusCode: 'PENDING', StatusName: 'รอดำเนินการ', ColorCode: '#ff9800', StatusLevel: 1 },
  { StatusCode: 'APPROVED', StatusName: 'อนุมัติแล้ว', ColorCode: '#4caf50', StatusLevel: 2 },
  { StatusCode: 'REJECTED', StatusName: 'ปฏิเสธ', ColorCode: '#f44336', StatusLevel: 3 },
  { StatusCode: 'CLOSED', StatusName: 'ปิดงานแล้ว', ColorCode: '#22c55e', StatusLevel: 4 },
];

export function getStatusByCode(code: string): StatusItem | undefined {
  return STATUS_LIST.find((s) => s.StatusCode === code);
}

export function getStatusNameByCode(code: string): string {
  return getStatusByCode(code)?.StatusName ?? code;
}
