'use client';

/**
 * ฟอร์ม F07 ตรงตามต้นฉบับ IT01-IT-F07 Rev.3
 * A5 landscape layout — ตรงตามฟอร์มกระดาษจริง
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

/** ผู้แก้ไขและวันที่/เวลาจาก IT_PROCESS */
export type ResolvedInfo = {
  resolvedBy?: string | null;
  resolvedAt?: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** เส้นประ — pb-[3px] เพิ่มช่องว่างใต้ข้อความ ป้องกัน html2canvas render ข้อความทับเส้น */
function Dotted({ value, w = 'flex-1' }: { value?: string; w?: string }) {
  return (
    <span
      className={`inline-block border-b border-dotted border-black align-baseline ${w}`}
      style={{
        minHeight: '1.2em',
        lineHeight: '1.6',
        paddingBottom: '3px',
        marginLeft: '4px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {value ? <span className="px-1">{value}</span> : '\u00A0'}
    </span>
  );
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
  signatures?: {
    requester?: { name: string; url?: string | null };
    reviewer?: { name: string; url?: string | null };
    accountant?: { name: string; url?: string | null };
    approver?: { name: string; url?: string | null };
  };
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  approvedByITViewer?: string | null;
  itObstacles?: string | null;
}) {
  const isERP = /^ERP\s*Softpro$/i.test(request.systemType ?? '');
  const hasITClosed = Boolean(resolvedAt);
  const resolvedDate = resolvedAt ? formatDate(resolvedAt) : undefined;
  const resolvedTime = resolvedAt ? formatTime(resolvedAt) : undefined;
  const displayResolvedBy = hasITClosed ? (resolvedBy ?? undefined) : undefined;

  // แบ่งข้อความปัญหาเป็นหลายบรรทัด
  const MAX_CHARS = 70;
  const rawLines = (request.problemDetail || '').split('\n');
  const lines: string[] = [];
  for (const raw of rawLines) {
    if (!raw.trim()) { continue; }
    let remaining = raw;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHARS) { lines.push(remaining); break; }
      const lastSpace = remaining.lastIndexOf(' ', MAX_CHARS);
      const splitAt = lastSpace > MAX_CHARS * 0.4 ? lastSpace : MAX_CHARS;
      lines.push(remaining.slice(0, splitAt).trimEnd());
      remaining = remaining.slice(splitAt).trimStart();
    }
  }

  const PROBLEM_LINES = Math.max(7, lines.length); // เท่าฟอร์มจริง (เดิม 10 ทำให้กล่องสูงเกิน ดันช่องเซ็นห่าง)

  // Helper สำหรับ render ลายเซ็นแบบฟอร์มจริง (เส้นประ....... ตามด้วยชื่อตำแหน่ง)
  const renderSig = (label: string, sigData?: { name: string; url?: string | null } | string) => {
    const name = typeof sigData === 'string' ? sigData : sigData?.name;
    const url = typeof sigData === 'string' ? null : sigData?.url;

    return (
      <div className="flex items-end mb-4 relative" style={{ minHeight: '42px' }}>
        {url && (
          <div className="absolute bottom-4 right-12 flex justify-center pointer-events-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="signature" className="max-h-[35px] max-w-[100px] object-contain mix-blend-multiply" />
          </div>
        )}
        {/* \u0E40\u0E2A\u0E49\u0E19\u0E1B\u0E23\u0E30\u0E22\u0E37\u0E14\u0E40\u0E15\u0E47\u0E21\u0E04\u0E27\u0E32\u0E21\u0E01\u0E27\u0E49\u0E32\u0E07 (flex-1) \u2014 \u0E17\u0E38\u0E01\u0E0A\u0E48\u0E2D\u0E07\u0E22\u0E32\u0E27\u0E40\u0E17\u0E48\u0E32\u0E01\u0E31\u0E19; \u0E1B\u0E49\u0E32\u0E22\u0E01\u0E33\u0E01\u0E31\u0E1A\u0E01\u0E27\u0E49\u0E32\u0E07\u0E04\u0E07\u0E17\u0E35\u0E48 */}
        <span
          className="border-b border-dotted border-black text-center"
          style={{ flex: 1, paddingBottom: '3px' }}
        >
          {url ? '\u00A0' : (name || '\u00A0')}
        </span>
        <span className="ml-1 whitespace-nowrap" style={{ width: '100px' }}>{label}</span>
      </div>
    );
  };

  return (
    <div
      className="bg-white text-black mx-auto print:m-0"
      style={{
        fontFamily: "'TH Sarabun New', 'Sarabun', sans-serif",
        width: '210mm',
        minHeight: '148.5mm',
        padding: '8mm',
        boxSizing: 'border-box',
        fontSize: '13px',
        lineHeight: '1.5',
      }}
    >
      {/* ════════════ HEADER ════════════ */}
      <div className="flex items-start mb-2">
        {/* Logo + Company name */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <img
            src="/tsmlogo.png"
            alt="TSM"
            className="object-contain"
            style={{ width: '160px', height: '80px' }}
          />
        </div>

        {/* Title + location/date */}
        <div className="flex-1 text-center pt-1">
          <p className="font-bold mb-2" style={{ fontSize: '15px' }}>แบบฟอร์มขอแก้ไขข้อมูลระบบ</p>
          <div className="flex justify-center gap-6" style={{ fontSize: '12px' }}>
            <div className="flex items-baseline">
              <span className="whitespace-nowrap">สถานที่ตั้ง</span>
              <Dotted value={request.location?.name ?? ''} w="min-w-[160px]" />
            </div>
            <div className="flex items-baseline">
              <span className="whitespace-nowrap">วันที่แจ้ง</span>
              <Dotted value={formatDate(request.createdAt)} w="min-w-[100px]" />
            </div>
          </div>
        </div>

        {/* spacer กว้างเท่าโลโก้ทางขวา — ให้หัวข้ออยู่กึ่งกลางหน้าจริง (ไม่ถูกโลโก้ดันเยื้องขวา) */}
        <div className="flex-shrink-0" style={{ width: '160px' }} aria-hidden="true" />
      </div>

      {/* ════════════ MAIN BORDERED SECTION ════════════ */}
      <div style={{ border: '1.5px solid black', padding: '6px 8px', flexGrow: 1 }}>

        {/* ── ข้อมูลผู้ขอ (แถวเดียว) ── */}
        <div className="flex gap-3 mb-1" style={{ fontSize: '12px' }}>
          <div className="flex items-baseline" style={{ flex: '2' }}>
            <span className="whitespace-nowrap">ชื่อภาษาไทย</span>
            <Dotted value={request.thaiName} />
          </div>
          <div className="flex items-baseline" style={{ flex: '1' }}>
            <span className="whitespace-nowrap">แผนก</span>
            <Dotted value={request.department?.name ?? ''} />
          </div>
          <div className="flex items-baseline" style={{ flex: '1' }}>
            <span className="whitespace-nowrap">ตำแหน่ง</span>
            <Dotted value={request.position ?? ''} />
          </div>
          <div className="flex items-baseline" style={{ flex: '1' }}>
            <span className="whitespace-nowrap">โทรศัพท์</span>
            <Dotted value={request.phone ?? ''} />
          </div>
        </div>

        {/* ── รายละเอียดในการแก้ไขข้อมูลระบบ ── */}
        <p className="font-bold mt-1" style={{ fontSize: '12px' }}>รายละเอียดในการแก้ไขข้อมูลระบบ</p>

        {/* Checkboxes */}
        <div className="ml-4 space-y-0.5 mb-2" style={{ fontSize: '12px' }}>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center border border-black flex-shrink-0"
              style={{ width: '14px', height: '14px' }}
            >
              {isERP && <span style={{ fontSize: '11px', fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
            </span>
            <span>ระบบ ERP Softpro</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center border border-black flex-shrink-0"
              style={{ width: '14px', height: '14px' }}
            >
              {!isERP && <span style={{ fontSize: '11px', fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
            </span>
            <span className="flex items-baseline gap-1">
              อื่นๆ (ระบุ)
              <Dotted value={!isERP ? request.systemType : undefined} w="min-w-[200px]" />
            </span>
          </div>
        </div>

        {/* ── กล่องปัญหา + ลายเซ็น ── */}
        <div className="flex gap-3 mt-2">
          {/* กล่องปัญหา (ซ้าย) */}
          <div className="border border-black p-2" style={{ flex: '2' }}>
            <p className="font-bold underline mb-1" style={{ fontSize: '11px' }}>ระบุรายละเอียดของปัญหา</p>
            <div>
              {Array.from({ length: PROBLEM_LINES }, (_, i) => (
                <div
                  key={i}
                  className="border-b border-dotted border-gray-400"
                  style={{ minHeight: '20px', fontSize: '11px', paddingLeft: '2px', paddingBottom: '3px' }}
                >
                  {lines[i] ?? '\u00A0'}
                </div>
              ))}
            </div>
          </div>

          {/* ลายเซ็น (ขวา) */}
          <div className="flex flex-col justify-between py-1" style={{ flex: '1', fontSize: '11px' }}>
            {renderSig('ผู้ขอ', signatures?.requester ?? request.thaiName)}
            {renderSig('ผู้ตรวจสอบ', signatures?.reviewer)}
            {renderSig('ผู้ตรวจสอบ (บัญชี)', signatures?.accountant)}
            {renderSig('ผู้อนุมัติ', signatures?.approver)}
          </div>
        </div>

        {/* ── หมายเหตุ ── */}
        <p className="mt-1 text-gray-700" style={{ fontSize: '9px', lineHeight: '1.3' }}>
          หมายเหตุ : สำนักงานกรุงเทพ ผู้ตรวจสอบ = ผู้จัดการฝ่าย // โรงงาน ผู้ตรวจสอบ = หน.แผนก/หน.ส่วน/ผู้จัดการฝ่าย, ผู้อนุมัติ = ผู้จัดการฝ่ายสำนักงาน/รองผู้อำนวยการโรงงาน/ผู้จัดการโรงงาน
        </p>

        {/* ════════════ ส่วนเทคโนโลยีสารสนเทศ ════════════ */}
        <div className="border-t border-black mt-2 pt-2">
          <div className="flex justify-between relative">
            {/* ซ้าย: ผู้อนุมัติ + ผู้แก้ไข + ปัญหาอุปสรรค */}
            <div style={{ flex: '2' }}>
              <p className="font-bold underline mb-3" style={{ fontSize: '11px' }}>ส่วนเทคโนโลยีสารสนเทศ</p>

              {/* ลายเซ็น ผู้อนุมัติ + ผู้แก้ไข */}
              <div className="flex gap-8 ml-8 mb-2">
                <div className="text-center">
                  <div className="border-b border-dotted border-black mb-1 relative" style={{ width: '120px', minHeight: '20px' }}>
                    {approvedByITViewer && <span style={{ fontSize: '11px' }}>{approvedByITViewer}</span>}
                  </div>
                  <p style={{ fontSize: '10px' }}>ผู้อนุมัติ</p>
                </div>
                <div className="text-center">
                  <div className="border-b border-dotted border-black mb-1 relative" style={{ width: '120px', minHeight: '20px' }}>
                    {displayResolvedBy && <span style={{ fontSize: '11px' }}>{displayResolvedBy}</span>}
                  </div>
                  <p style={{ fontSize: '10px' }}>ผู้แก้ไข</p>
                </div>
              </div>

            </div>

            {/* ขวา: กล่องฟ้า */}
            <div
              className="self-start border border-black p-2"
              style={{
                backgroundColor: '#d1e9f0',
                minWidth: '200px',
                fontSize: '10px',
              }}
            >
              <div className="flex items-baseline mb-1">
                <span className="whitespace-nowrap">หมายเลขที่งาน</span>
                <Dotted value={request.workOrderNo ?? undefined} w="min-w-[90px]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="whitespace-nowrap">วันที่แก้ไข</span>
                <Dotted value={hasITClosed ? resolvedDate : undefined} w="min-w-[60px]" />
                <span className="whitespace-nowrap">เวลา</span>
                <Dotted value={hasITClosed ? resolvedTime : undefined} w="min-w-[50px]" />
              </div>
            </div>
          </div>

          {/* ปัญหาอุปสรรค — เต็มความกว้าง (ป้ายกำกับ + เส้นจุดลากจนสุดขอบขวา เหมือนฟอร์มจริง) */}
          <div className="flex items-baseline mt-1" style={{ fontSize: '11px' }}>
            <span className="font-bold underline whitespace-nowrap">ปัญหาอุปสรรค (ถ้ามี)</span>
            <Dotted value={itObstacles ?? undefined} />
          </div>
          <div className="border-b border-dotted border-black mt-1" style={{ minHeight: '14px' }}>{' '}</div>
          <div className="border-b border-dotted border-black mt-1" style={{ minHeight: '14px' }}>{' '}</div>
        </div>
      </div>

      {/* ════════════ FOOTER ════════════ */}
      <div className="text-right font-bold mt-1" style={{ fontSize: '10px' }}>
        IT01-IT-F07 Rev.3
      </div>
    </div>
  );
}
