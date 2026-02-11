// app/components/RequestTable.tsx
import Link from 'next/link';

export default function RequestTable({ requests }: { requests: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
          <tr>
            <th className="px-4 py-3">เลขที่ใบงาน</th>
            <th className="px-4 py-3">ผู้แจ้ง / แผนก</th>
            <th className="px-4 py-3">หมวดหมู่</th>
            <th className="px-4 py-3">สถานะ</th>
            <th className="px-4 py-3">วันที่แจ้ง</th>
            <th className="px-4 py-3">ดำเนินการ</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {requests.map((req) => (
            <tr key={req.id} className="hover:bg-gray-50 transition">
              <td className="px-4 py-4 font-medium">
                <Link href={`/request/${req.id}`} className="text-blue-600 hover:underline">
                  {req.workOrderNo ?? `#${req.id}`}
                </Link>
              </td>
              <td className="px-4 py-4">
                <div>{req.thaiName}</div>
                <div className="text-xs text-gray-400">{req.department.name}</div>
              </td>
              <td className="px-4 py-4">{req.category.name}</td>
              <td className="px-4 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold 
                  ${req.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 
                    req.status === 'CLOSED' ? 'bg-gray-100 text-gray-700' :
                    req.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {req.status === 'PENDING' ? `รอขั้นที่ ${req.currentApprovalStep ?? 1}` : req.status === 'CLOSED' ? 'ปิดงานแล้ว' : req.status}
                </span>
              </td>
              <td className="px-4 py-4 text-gray-500">
                {new Date(req.createdAt).toLocaleDateString('th-TH')}
              </td>
              <td className="px-4 py-4">
                <Link
                  href={`/request/${req.id}`}
                  className="text-blue-600 hover:underline text-sm"
                >
                  ดูรายละเอียด
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}