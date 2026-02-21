'use client';

/**
 * ฟอร์ม F07 ตรงตามต้นฉบับ IT01-IT-F07 Rev.3
 * - กรอบดำล้อมทั้งฟอร์ม
 * - กล่องปัญหา มีเส้นประแนวนอนหลายเส้น
 * - กล่องฟ้า IT อยู่ขวาของ ผู้อนุมัติ/ผู้แก้ไข
 */
type RequestData = {
  workOrderNo: string | null;
  thaiName: string;
  phone: string | null;
  position?: string | null;
  problemDetail: string;
  systemType: string;
  createdAt: string;
  department: { name: string };
  location: { name: string };
  category?: { name: string };
  reasonForCorrection?: string | null;
};

/** ผู้แก้ไขและวันที่/เวลาจาก IT_PROCESS (IT Operator ดำเนินการเสร็จ) */
export type ResolvedInfo = {
  resolvedBy?: string | null;
  resolvedAt?: string | null; // ISO string
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function DottedLine({ value, className = '' }: { value?: string; className?: string }) {
  return (
    <span className={`inline-block border-b border-dotted border-black pb-1 align-baseline ${className}`}>
      {value ?? '\u00A0'}
    </span>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function F07FormPrint({
  request,
  signatures,
  resolvedBy,
  resolvedAt,
  approvedByITViewer,
  itObstacles,
}: {
  request: RequestData;
  signatures?: { reviewer?: string; accountant?: string; approver?: string };
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  /** ผู้อนุมัติในส่วนเทคโนโลยีสารสนเทศ = role IT Viewer (IT Reviewer) */
  approvedByITViewer?: string | null;
  /** ปัญหาอุปสรรค (ถ้ามี) ที่ IT Operator กรอกตอนดำเนินการเสร็จสิ้น (IT) */
  itObstacles?: string | null;
}) {
  const isERP = /^ERP\s*Softpro$/i.test(request.systemType ?? '');

  // แบ่งข้อความยาวเป็นหลายแถว โดยตัดที่ช่องว่างก่อน ~55 ตัว เพื่อไม่ให้คำขาดกลาง
  const MAX_CHARS = 55;
  const rawLines = (request.problemDetail || '').split('\n');
  const lines: string[] = [];
  for (const raw of rawLines) {
    if (!raw.trim()) { continue; }
    let remaining = raw;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHARS) {
        lines.push(remaining);
        break;
      }
      // หาช่องว่างสุดท้ายก่อนถึง MAX_CHARS
      const lastSpace = remaining.lastIndexOf(' ', MAX_CHARS);
      const splitAt = lastSpace > MAX_CHARS * 0.4 ? lastSpace : MAX_CHARS;
      lines.push(remaining.slice(0, splitAt).trimEnd());
      remaining = remaining.slice(splitAt).trimStart();
    }
  }
  const hasITClosed = Boolean(resolvedAt);
  const resolvedDate = resolvedAt ? formatDate(resolvedAt) : undefined;
  const resolvedTime = resolvedAt ? formatTime(resolvedAt) : undefined;
  // ผู้อนุมัติ Final App (ส่วน IT) = ชื่อ role IT Viewer
  const displayITViewer = approvedByITViewer ?? undefined;
  // ผู้แก้ไข = ชื่อ role IT Operator (จาก IT_PROCESS) — แสดงเมื่อปิดงานแล้ว
  const displayResolvedBy = hasITClosed ? (resolvedBy ?? undefined) : undefined;

  return (
    <div
      className="bg-white text-black p-6 max-w-[210mm] mx-auto text-sm print:p-4 border-2 border-black"
      style={{ fontFamily: 'TH Sarabun New, Sarabun, sans-serif' }}
    >
      {/* ========== หัวกระดาษ ========== */}
      <div className="flex justify-between items-start gap-4 mb-4 pb-3 border-b-2 border-black">
        <div className="flex items-center gap-3">
          <img
            src="/tsmlogo.png"
            alt="TSM"
            className="h-12 w-auto object-contain"
            width={80}
            height={48}
          />
          <div>
            <p className="text-lg font-bold text-black leading-tight">TSM GROUP</p>
            <p className="text-[11px] text-[#1f2937] leading-tight mt-0.5">กลุ่มเอสเอ็ม</p>
            <p className="text-[11px] text-[#1f2937] leading-tight">เปลี่ยนก่อนการเคลื่อนที่ชีวิตที่สร้างสรรค์</p>
          </div>
        </div>
        <div className="text-right flex-1 min-w-0">
          <p className="text-lg font-bold text-black mb-2">แบบฟอร์มขอแก้ไขข้อมูลระบบ</p>
          <div className="flex flex-wrap gap-x-6 justify-end text-sm">
            <span>สถานที่ตั้ง <DottedLine value={request.location?.name ?? ''} className="min-w-[140px] ml-1" /></span>
            <span>วันที่แจ้ง <DottedLine value={formatDate(request.createdAt)} className="min-w-[120px] ml-1" /></span>
          </div>
        </div>
      </div>

      {/* ========== ข้อมูลผู้ขอ (กล่องกรอบดำ) ========== */}
      <div className="border border-black p-3 mb-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 text-sm leading-snug">
          <span>ชื่อภาษาไทย <DottedLine value={request.thaiName} className="min-w-[200px] ml-1" /></span>
          <span>แผนก <DottedLine value={request.department?.name ?? ''} className="min-w-[120px] ml-1" /></span>
          <span>ตำแหน่ง <DottedLine value={request.position ?? undefined} className="min-w-[100px] ml-1" /></span>
          <span>โทรศัพท์ <DottedLine value={request.phone ?? ''} className="min-w-[100px] ml-1" /></span>
        </div>
      </div>

      {/* ========== รายละเอียดในการแก้ไขข้อมูลระบบ ========== */}
      <div className="border border-black mb-4">
        <p className="border-b border-black px-3 py-2 font-bold bg-white">รายละเอียดในการแก้ไขข้อมูลระบบ</p>
        <div className="p-3">
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2">
              <span className={`w-4 h-4 flex-shrink-0 border-2 border-black flex items-center justify-center leading-none ${isERP ? 'bg-[#e5e7eb]' : ''}`}>
                {isERP ? <span className="text-[10px] font-bold -mt-2">✓</span> : null}
              </span>
              <span>ระบบ ERP Softpro</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-4 h-4 flex-shrink-0 border-2 border-black flex items-center justify-center leading-none ${!isERP ? 'bg-[#e5e7eb]' : ''}`}>
                {!isERP ? <span className="text-[10px] font-bold -mt-2">✓</span> : null}
              </span>
              <span className="break-all">อื่นๆ (ระบุ) <DottedLine value={!isERP ? request.systemType : undefined} className="min-w-[180px] ml-1 break-all" /></span>
            </div>
          </div>

          {/* กล่องปัญหา + คอลัมน์ลายเซ็นขวา */}
          <div className="flex border border-black min-h-[200px]">
            <div className="flex-1 border-r border-black flex flex-col">
              <p className="px-2 py-1.5 font-bold text-sm border-b border-black bg-[#f9fafb]">ระบุรายละเอียดของปัญหา</p>
              <div className="flex-1 flex flex-col">
                {Array.from({ length: Math.max(7, lines.length) }, (_, i) => (
                  <div key={i} className="min-h-[24px] border-b border-dotted border-[#9ca3af] px-2 py-0.5">
                    {lines[i] ?? '\u00A0'}
                  </div>
                ))}
              </div>
            </div>
            <div className="w-[260px] p-3 flex flex-col justify-end text-sm bg-white">
              <div className="flex items-end gap-1 mb-2">
                <span className="whitespace-nowrap flex-shrink-0">ผู้ขอ</span>
                <DottedLine value={request.thaiName} className="flex-1 text-center" />
              </div>
              <div className="flex items-end gap-1 mb-2">
                <span className="whitespace-nowrap flex-shrink-0">ผู้ตรวจสอบ</span>
                <DottedLine value={signatures?.reviewer} className="flex-1 text-center" />
              </div>
              <div className="flex items-end gap-1 mb-2">
                <span className="whitespace-nowrap flex-shrink-0">ผู้ตรวจสอบ (บัญชี)</span>
                <DottedLine value={signatures?.accountant} className="flex-1 text-center" />
              </div>
              <div className="flex items-end gap-1 mb-3">
                <span className="whitespace-nowrap flex-shrink-0">ผู้อนุมัติ</span>
                <DottedLine value={signatures?.approver} className="flex-1 text-center" />
              </div>
            </div>
          </div>

          <p className="text-[11px] mt-3 text-[#1f2937] leading-tight">
            หมายเหตุ : สำนักงานกรุงเทพ ผู้ตรวจสอบ = ผู้จัดการฝ่าย // โรงงาน ผู้ตรวจสอบ = หน.แผนก/หน.ส่วน/ผู้จัดการฝ่าย, ผู้อนุมัติ = ผู้จัดการฝ่ายสำนักงาน/รองผู้อำนวยการโรงงาน/ผู้จัดการโรงงาน
          </p>
        </div>
      </div>

      {/* ========== ส่วนเทคโนโลยีสารสนเทศ ========== */}
      <div className="border border-black mb-4">
        <p className="border-b border-black px-3 py-2 font-bold bg-white">ส่วนเทคโนโลยีสารสนเทศ</p>
        <div className="p-3">
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <div className="flex-1 min-w-0">
              {/* ส่วนเทคโนโลยีสารสนเทศ: ผู้อนุมัติ = role IT Viewer, ผู้แก้ไข = role IT Operator */}
              <div className="flex items-baseline gap-2 mb-2">
                <span>ผู้อนุมัติ</span>
                <DottedLine value={approvedByITViewer ?? undefined} className="min-w-[160px] flex-1" />
              </div>
              <div className="flex items-baseline gap-2 mb-3">
                <span>ผู้แก้ไข</span>
                <DottedLine value={displayResolvedBy} className="min-w-[160px] flex-1" />
              </div>
              <p className="text-sm mb-1 mt-2">ปัญหาอุปสรรค (ถ้ามี) <DottedLine value={itObstacles ?? undefined} className="min-w-[200px] ml-1 inline-block" /></p>
            </div>
            <div className="bg-[#e0f2fe] border-2 border-[#60a5fa] p-4 min-w-[240px]">
              <p className="text-sm mb-2">หมายเลขที่งาน <DottedLine value={request.workOrderNo ?? undefined} className="min-w-[120px] ml-1" /></p>
              <div className="flex items-baseline gap-4 text-sm">
                <span>วันที่แก้ไข <DottedLine value={hasITClosed ? resolvedDate : undefined} className="min-w-[80px] ml-1" /></span>
                <span>เวลา <DottedLine value={hasITClosed ? resolvedTime : undefined} className="min-w-[60px] ml-1" /></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========== ท้ายกระดาษ ========== */}
      <div className="text-right text-xs font-bold text-black pt-2 pb-2">
        IT01-IT-F07 Rev.3
      </div>
    </div>
  );
}
