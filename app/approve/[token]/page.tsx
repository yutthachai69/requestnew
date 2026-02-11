import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import ApprovalButtons from './ApprovalButtons'; // เดี๋ยวสร้างไฟล์นี้ต่อ

export default async function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // 0. บังคับ Login เพื่อระบุตัวตน (Security Feature)
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(`/login?callbackUrl=/approve/${token}`);
  }
  // 1. ค้นหาคำร้องด้วย Token
  const request = await prisma.iTRequestF07.findUnique({
    where: { approvalToken: token },
    include: {
      department: true,
      category: true,
      location: true,
    },
  });
  const currentStep = request ? (request as { currentApprovalStep?: number }).currentApprovalStep ?? 1 : 0;
  const isClosedOrRejected = request?.status === 'CLOSED' || request?.status === 'REJECTED';

  // 2. ถ้าไม่เจอ หรือปิดงาน/ปฏิเสธแล้ว ให้ขึ้นข้อความ (สถานะอื่น เช่น WAITING_ACCOUNT_1 ยังกดอนุมัติจากลิงก์ได้)
  if (!request || isClosedOrRejected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-xl font-bold text-gray-600">ลิงก์นี้หมดอายุ หรือคำร้องถูกดำเนินการไปแล้ว</h1>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto my-10 p-8 bg-white shadow-2xl rounded-3xl border border-gray-100">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-blue-600">พิจารณาอนุมัติคำร้อง F07</h1>
        <p className="text-gray-500">เลขที่ใบงาน: {request.workOrderNo}</p>
        {currentStep > 0 && (
          <p className="text-sm text-amber-600 mt-1">ขั้นที่ {currentStep} ของการอนุมัติ</p>
        )}
      </div>

      <div className="space-y-4 bg-gray-50 p-6 rounded-2xl mb-8">
        <p><strong>ผู้แจ้ง:</strong> {request.thaiName}</p>
        <p><strong>แผนก:</strong> {request.department.name}</p>
        <p><strong>หมวดหมู่:</strong> {request.category.name}</p>
        <div className="border-t pt-3">
          <p className="font-semibold text-gray-700">รายละเอียดปัญหา:</p>
          <p className="text-gray-600 mt-1 italic">"{request.problemDetail}"</p>
        </div>
      </div>

      {/* ปุ่มกดอนุมัติ/ไม่อนุมัติ (Client Component) */}
      <ApprovalButtons token={token} />
    </div>
  );
}