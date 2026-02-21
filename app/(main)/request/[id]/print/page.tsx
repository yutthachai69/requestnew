'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import F07FormPrint from '@/app/components/F07FormPrint';
import LoadingSpinner from '@/app/components/LoadingSpinner';

type RequestData = {
  workOrderNo: string | null;
  thaiName: string;
  phone: string | null;
  position?: string | null;
  problemDetail: string;
  systemType: string;
  createdAt: string;
  attachmentPath?: string | null;
  department: { name: string };
  location: { name: string };
  category?: { name: string };
  requester?: { position?: string | null } | null;
};

type HistoryItem = {
  FullName: string;
  RoleName: string;
  ActionType: string;
  ApprovalTimestamp: string;
};

/** คำนวณลายเซ็นจากประวัติการอนุมัติ — รองรับชื่อ role ไทย/อังกฤษ */
function getSignaturesFromHistory(history: HistoryItem[]) {
  const approvedByAnyRole = (roleNames: string[]) => {
    const entry = [...history].reverse().find((h) => h.ActionType === 'อนุมัติ' && roleNames.includes(h.RoleName));
    return entry ? entry.FullName : undefined;
  };
  return {
    reviewer: approvedByAnyRole(['Head of Department', 'หัวหน้าแผนก', 'Manager', 'หน.แผนก', 'ผู้จัดการฝ่าย']),
    accountant: approvedByAnyRole(['Accountant', 'บัญชี']),
    approver: approvedByAnyRole(['Final Approver', 'ผู้อนุมัติ', 'ผู้จัดการฝ่ายสำนักงาน', 'รองผู้อำนวยการโรงงาน', 'ผู้จัดการโรงงาน']),
  };
}

/** Parse attachment paths from JSON string */
function parseAttachments(attachmentPath: string | null | undefined): string[] {
  if (!attachmentPath) return [];
  try {
    const parsed = JSON.parse(attachmentPath);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return attachmentPath ? [attachmentPath] : [];
  }
}

/** Check if file is an image */
function isImageFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg'].includes(ext || '');
}

/** Check if file is a PDF */
function isPdfFile(path: string): boolean {
  return path.toLowerCase().endsWith('.pdf');
}

/**
 * ส่งออก PDF แบบ client-side (html2canvas + jsPDF) — ตรงตามจอ ไม่มีปัญหา Thai shaping
 * Flow เหมือน RequestDetailPage.jsx เดิม: ถ่ายรูปฟอร์ม → ใส่ในหน้าแรก PDF → บันทึก
 */
export default function RequestPrintPage() {
  const params = useParams();
  const id = params?.id as string;
  const formRef = useRef<HTMLDivElement>(null);
  const [request, setRequest] = useState<RequestData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [resolvedBy, setResolvedBy] = useState<string | null>(null);
  const [resolvedAt, setResolvedAt] = useState<string | null>(null);
  const [approvedByITViewer, setApprovedByITViewer] = useState<string | null>(null);
  const [itObstacles, setItObstacles] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [includeAttachments, setIncludeAttachments] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('ไม่พบ ID คำร้อง');
      return;
    }
    let cancelled = false;
    fetch(`/api/requests/${id}`, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'ไม่พบคำร้อง' : 'โหลดข้อมูลไม่ได้');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setRequest(data.request);
        setHistory(data.history ?? []);
        setResolvedBy(data.resolvedBy ?? null);
        setResolvedAt(data.resolvedAt ?? null);
        setApprovedByITViewer(data.approvedByITViewer ?? null);
        setItObstacles(data.itObstacles ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message ?? 'โหลดข้อมูลไม่ได้');
          setRequest(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  /** ส่งออกเป็น PDF ตรงตามจอ (html2canvas + jsPDF) พร้อมไฟล์แนบ */
  const handleExportPdfClient = async () => {
    const el = formRef.current;
    if (!el || !request) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      // 1. Create Main PDF with form content
      // Use ignoreElements to hide buttons during capture
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        ignoreElements: (element) => {
          return element.hasAttribute('data-hide-on-pdf');
        }
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentW = pageW - margin * 2;
      const aspect = canvas.height / canvas.width;
      const contentH = contentW * aspect;

      // Add form image to first page
      pdf.addImage(imgData, 'PNG', margin, margin, contentW, contentH);

      // Collect PDF blobs to merge later
      const pdfAttachmentsToMerge: ArrayBuffer[] = [];

      // 2. Process attachments
      if (includeAttachments && request.attachmentPath) {
        const attachments = parseAttachments(request.attachmentPath);

        for (const attachmentPath of attachments) {
          try {
            const response = await fetch(attachmentPath, { credentials: 'same-origin' });
            if (!response.ok) continue;

            if (isImageFile(attachmentPath)) {
              // Handle Image: Add directly to current jsPDF instance
              const blob = await response.blob();
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });

              pdf.addPage();

              // Calculate dimensions
              const img = new Image();
              await new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.src = dataUrl;
              });

              const imgAspect = img.height / img.width;
              const maxW = pageW - margin * 2;
              const maxH = pageH - margin * 2;
              let imgW = maxW;
              let imgH = imgW * imgAspect;

              if (imgH > maxH) {
                imgH = maxH;
                imgW = imgH / imgAspect;
              }

              const x = (pageW - imgW) / 2;
              pdf.addImage(dataUrl, 'PNG', x, margin, imgW, imgH);

              pdf.setFontSize(10);
              pdf.text(`ไฟล์แนบ: ${attachmentPath.split('/').pop()}`, margin, pageH - 5);

            } else if (isPdfFile(attachmentPath)) {
              // Handle PDF: Buffer it for later merging
              const buffer = await response.arrayBuffer();
              pdfAttachmentsToMerge.push(buffer);
            }
          } catch (e) {
            console.warn('Failed to process attachment:', attachmentPath, e);
          }
        }
      }

      // 3. Finalize
      if (pdfAttachmentsToMerge.length > 0) {
        // Merge jsPDF output + External PDFs
        const { PDFDocument } = await import('pdf-lib');

        // Load the main report (from jsPDF)
        const mainPdfBytes = pdf.output('arraybuffer');
        const finalPdfDoc = await PDFDocument.load(mainPdfBytes);

        // Merge each PDF attachment
        for (const buffer of pdfAttachmentsToMerge) {
          try {
            const attachDoc = await PDFDocument.load(buffer);
            const copiedPages = await finalPdfDoc.copyPages(attachDoc, attachDoc.getPageIndices());
            copiedPages.forEach((page) => finalPdfDoc.addPage(page));
          } catch (err) {
            console.error('Error merging PDF attachment', err);
          }
        }

        // Save final merged document
        const mergedBytes = await finalPdfDoc.save();
        const blob = new Blob([mergedBytes as unknown as BlobPart], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `F07-${request.workOrderNo ?? id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // No PDF attachments to merge, just save the jsPDF
        pdf.save(`F07-${request.workOrderNo ?? id}.pdf`);
      }

    } catch (e) {
      console.error('Export failed:', e);
      setError(e instanceof Error ? e.message : 'ส่งออก PDF ไม่สำเร็จ');
    } finally {
      setDownloading(false);
    }
  };

  /** ดาวน์โหลด PDF จากเซิร์ฟเวอร์ (pdf-lib) — เลือก/ค้นหาข้อความใน PDF ได้ แต่อาจมีสระลอย */
  const handleDownloadPdfServer = async () => {
    if (!id) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/requests/${id}/pdf`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('ดาวน์โหลดไม่สำเร็จ');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `F07-${request?.workOrderNo ?? id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ดาวน์โหลดไม่สำเร็จ');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const attachments = parseAttachments(request?.attachmentPath);

  if (loading) {
    return (
      <div className="w-full p-6 flex justify-center items-center min-h-[200px]">
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !request) {
    return (
      <div className="w-full p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
          {error ?? 'ไม่พบข้อมูลคำร้อง'}
        </div>
        <Link href="/dashboard" className="mt-4 inline-block text-blue-600 hover:underline">
          ← กลับไป Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full p-6 bg-gray-100 min-h-screen">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2 print:hidden">
        <Link href={`/request/${id}`} className="text-blue-600 hover:underline text-sm">
          ← กลับไปรายละเอียดคำร้อง
        </Link>
        <div className="flex flex-wrap gap-3 items-center" data-hide-on-pdf>
          {/* Attachment toggle */}
          {attachments.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-700 bg-white px-3 py-2 rounded-lg border border-gray-200">
              <input
                type="checkbox"
                checked={includeAttachments}
                onChange={(e) => setIncludeAttachments(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              รวมไฟล์แนบ ({attachments.length} ไฟล์)
            </label>
          )}

          <button
            type="button"
            onClick={handleExportPdfClient}
            disabled={downloading}
            className="inline-flex items-center gap-3 px-6 py-3 bg-[#E91E63] text-white rounded-full text-sm font-bold shadow-lg hover:bg-[#d81b60] hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-200"
          >
            {downloading ? (
              <>
                <svg className="w-6 h-6 animate-spin shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                กำลังสร้าง PDF...
              </>
            ) : (
              <>
                <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6M9 16h6" />
                </svg>
                ส่งออกเป็น PDF
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 border-2 border-gray-300 rounded-full text-sm font-medium shadow-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow active:scale-[0.98] transition-all duration-200"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            พิมพ์ / บันทึกเป็น PDF
          </button>
          <button
            type="button"
            onClick={handleDownloadPdfServer}
            disabled={downloading}
            className="text-sm text-blue-600 hover:underline disabled:opacity-50"
          >
            ดาวน์โหลด PDF จากเซิร์ฟเวอร์
          </button>
        </div>
      </div>

      <div
        ref={formRef}
        id="export-form-paper"
        className="print:bg-white print:p-0 print:shadow-none bg-white max-w-[210mm] mx-auto"
      >
        <F07FormPrint
          request={{ ...request, position: request.requester?.position ?? request.position ?? null }}
          signatures={getSignaturesFromHistory(history)}
          resolvedBy={resolvedBy}
          resolvedAt={resolvedAt}
          approvedByITViewer={approvedByITViewer}
          itObstacles={itObstacles}
        />
      </div>

      {/* Attachment preview section */}
      {attachments.length > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-4 max-w-[210mm] mx-auto print:hidden">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            ไฟล์แนบ ({attachments.length} ไฟล์)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {attachments.map((path, index) => (
              <a
                key={index}
                href={path}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors group"
              >
                <div className="flex flex-col items-center gap-2">
                  {isImageFile(path) ? (
                    <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                    </svg>
                  )}
                  <span className="text-xs text-gray-600 truncate max-w-full group-hover:text-blue-600" title={path.split('/').pop()}>
                    {path.split('/').pop()}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}


    </div>
  );
}
