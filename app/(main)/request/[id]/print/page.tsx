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
  SignatureUrl?: string | null;
};

function getSignaturesFromHistory(history: HistoryItem[]) {
  const approvedByAnyRole = (roleNames: string[]) => {
    const entry = [...history].reverse().find((h) => h.ActionType === 'อนุมัติ' && roleNames.includes(h.RoleName));
    return entry ? { name: entry.FullName, url: entry.SignatureUrl ?? null } : undefined;
  };
  return {
    reviewer: approvedByAnyRole(['Head of Department', 'หัวหน้าแผนก', 'Manager', 'หน.แผนก', 'ผู้จัดการฝ่าย']),
    accountant: approvedByAnyRole(['Accountant', 'บัญชี']),
    approver: approvedByAnyRole(['Final Approver', 'ผู้อนุมัติ', 'ผู้จัดการฝ่ายสำนักงาน', 'รองผู้อำนวยการโรงงาน', 'ผู้จัดการโรงงาน']),
  };
}

function parseAttachments(attachmentPath: string | null | undefined): string[] {
  if (!attachmentPath) return [];
  try {
    const parsed = JSON.parse(attachmentPath);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return attachmentPath ? [attachmentPath] : [];
  }
}

function isImageFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg'].includes(ext || '');
}

function isPdfFile(path: string): boolean {
  return path.toLowerCase().endsWith('.pdf');
}

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

  const handleExportPdfClient = async () => {
    const wrapper = formRef.current;
    const el = wrapper?.querySelector<HTMLElement>('[id="export-form-inner"]') ?? wrapper;
    if (!el || !request) return;
    
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      // กำหนดขนาดจำลองให้ html2canvas จับภาพได้เต็มแผ่น 100% (ป้องกันจอเล็กบีบฟอร์ม)
      const targetWidth = 794; 
      
      const canvas = await html2canvas(el, {
        scale: 3,
        useCORS: true,
        logging: false,
        width: targetWidth,
        height: el.scrollHeight,
        windowWidth: targetWidth, 
        ignoreElements: (element) => element.hasAttribute('data-hide-on-pdf'),
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      const pdfW = 210;
      const pdfH = pdfW * (canvas.height / canvas.width);
      const pdf = new jsPDF(pdfW > pdfH ? 'l' : 'p', 'mm', [pdfW, pdfH]);
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);

      const pdfAttachmentsToMerge: ArrayBuffer[] = [];

      if (includeAttachments && request.attachmentPath) {
        const attachments = parseAttachments(request.attachmentPath);

        for (const attachmentPath of attachments) {
          try {
            const response = await fetch(attachmentPath, { credentials: 'same-origin' });
            if (!response.ok) continue;

            if (isImageFile(attachmentPath)) {
              const blob = await response.blob();
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });

              pdf.addPage();

              const img = new Image();
              await new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.src = dataUrl;
              });

              const imgAspect = img.height / img.width;
              const attachMargin = 5;
              const maxW = pdfW - attachMargin * 2;
              const maxH = pdfH - attachMargin * 2;
              let imgW = maxW;
              let imgH = imgW * imgAspect;

              if (imgH > maxH) {
                imgH = maxH;
                imgW = imgH / imgAspect;
              }

              const x = (pdfW - imgW) / 2;
              pdf.addImage(dataUrl, 'PNG', x, attachMargin, imgW, imgH);

              pdf.setFontSize(10);
              pdf.text(`ไฟล์แนบ: ${attachmentPath.split('/').pop()}`, attachMargin, pdfH - 5);

            } else if (isPdfFile(attachmentPath)) {
              const buffer = await response.arrayBuffer();
              pdfAttachmentsToMerge.push(buffer);
            }
          } catch (e) {
            console.warn('Failed to process attachment:', attachmentPath, e);
          }
        }
      }

      if (pdfAttachmentsToMerge.length > 0) {
        const { PDFDocument } = await import('pdf-lib');
        const mainPdfBytes = pdf.output('arraybuffer');
        const finalPdfDoc = await PDFDocument.load(mainPdfBytes);

        for (const buffer of pdfAttachmentsToMerge) {
          try {
            const attachDoc = await PDFDocument.load(buffer);
            const copiedPages = await finalPdfDoc.copyPages(attachDoc, attachDoc.getPageIndices());
            copiedPages.forEach((page) => finalPdfDoc.addPage(page));
          } catch (err) {
            console.error('Error merging PDF attachment', err);
          }
        }

        const mergedBytes = await finalPdfDoc.save();
        const blob = new Blob([mergedBytes as unknown as BlobPart], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `F07-${request.workOrderNo ?? id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        pdf.save(`F07-${request.workOrderNo ?? id}.pdf`);
      }

    } catch (e) {
      console.error('Export failed:', e);
      setError(e instanceof Error ? e.message : 'ส่งออก PDF ไม่สำเร็จ');
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
    <div className="w-full p-6 bg-gray-100 min-h-screen print:bg-white print:p-0">
      <style>{`
        /* แก้ไข @page ให้เป็น A4 แนวตั้ง ตามขนาดจริงของฟอร์ม (794x1123) */
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2 print:hidden max-w-5xl mx-auto">
        <Link href={`/request/${id}`} className="text-blue-600 hover:underline text-sm font-medium">
          ← กลับไปรายละเอียดคำร้อง
        </Link>
        <div className="flex flex-wrap gap-3 items-center">
          {attachments.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-700 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
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
            className="inline-flex items-center gap-3 px-6 py-2.5 bg-[#E91E63] text-white rounded-full text-sm font-bold shadow-md hover:bg-[#d81b60] hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
          >
            {downloading ? (
              <>
                <svg className="w-5 h-5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                กำลังสร้าง PDF...
              </>
            ) : (
              'ดาวน์โหลด PDF'
            )}
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-full text-sm font-medium shadow-sm hover:bg-gray-50 transition-all duration-200"
          >
            พิมพ์ฟอร์ม
          </button>
        </div>
      </div>

      {/* จุดแก้เพี้ยน: ใส่ overflow-x-auto เพื่อให้จอเล็กสามารถเลื่อนดูได้ 
        และป้องกันไม่ให้ Tailwind บีบขนาด 794px ของ F07FormPrint จนเละ 
      */}
      <div className="overflow-x-auto w-full flex justify-center pb-8 print:pb-0 print:block">
        <div
          ref={formRef}
          id="export-form-paper"
          className="print:bg-white print:p-0 print:shadow-none bg-white shadow-xl"
          style={{ minWidth: '794px' }}
        >
          <div id="export-form-inner" className="w-full">
            <F07FormPrint
              request={{ ...request, position: request.requester?.position ?? request.position ?? null }}
              signatures={getSignaturesFromHistory(history)}
              resolvedBy={resolvedBy}
              resolvedAt={resolvedAt}
              approvedByITViewer={approvedByITViewer}
              itObstacles={itObstacles}
            />
          </div>
        </div>
      </div>

      {/* ไฟล์แนบสำหรับพิมพ์ — แสดงเฉพาะรูปภาพ (hidden บนจอ, แสดงเฉพาะตอน print) */}
      {includeAttachments && attachments.filter(isImageFile).length > 0 && (
        <div className="hidden print:block">
          {attachments.filter(isImageFile).map((path, index) => (
            <div
              key={index}
              style={{ pageBreakBefore: 'always', breakBefore: 'page' }}
              className="w-full flex flex-col items-center justify-start pt-4"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={path}
                alt={`ไฟล์แนบ ${index + 1}`}
                style={{ maxWidth: '100%', maxHeight: '260mm', objectFit: 'contain' }}
              />
              <p className="text-xs text-gray-400 mt-2">{path.split('/').pop()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Attachment preview section */}
      {attachments.length > 0 && (
        <div className="mt-4 bg-white rounded-xl shadow-sm border border-gray-200 p-4 max-w-5xl mx-auto print:hidden">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            ไฟล์แนบ ({attachments.length} ไฟล์)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {attachments.map((path, index) => (
              <a
                key={index}
                href={path}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-blue-50 transition-colors group flex flex-col items-center gap-2"
              >
                {isImageFile(path) ? (
                  <span className="text-blue-500 font-bold text-xl">IMG</span>
                ) : (
                  <span className="text-red-500 font-bold text-xl">PDF</span>
                )}
                <span className="text-xs text-gray-600 truncate max-w-full group-hover:text-blue-600">
                  {path.split('/').pop()}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}