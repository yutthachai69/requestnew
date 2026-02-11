// app/(main)/request/page.tsx
'use client';

export default function RequestForm() {
  return (
    <div className="w-full p-8 bg-white shadow-lg rounded-lg">
      <h1 className="text-2xl font-bold mb-6 text-center">แบบฟอร์มขอแก้ไขข้อมูลระบบ (IT-F07)</h1>
      
      <form className="space-y-4">
        {/* ส่วนข้อมูลผู้แจ้ง */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">ชื่อภาษาไทย</label>
            <input type="text" className="mt-1 block w-full border rounded-md p-2" placeholder="ระบุชื่อ-นามสกุล" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">โทรศัพท์</label>
            <input type="text" className="mt-1 block w-full border rounded-md p-2" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">แผนก</label>
            <input type="text" className="mt-1 block w-full border rounded-md p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">ตำแหน่ง</label>
            <input type="text" className="mt-1 block w-full border rounded-md p-2" />
          </div>
        </div>

        {/* ส่วนรายละเอียดระบบ */}
        <div className="border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">ระบบที่ต้องการแก้ไข</label>
          <div className="flex items-center space-x-4">
            <label><input type="radio" name="system" value="erp" /> ระบบ ERP Softpro</label>
            <label><input type="radio" name="system" value="other" /> อื่นๆ (ระบุ)</label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">ระบุรายละเอียดของปัญหา</label>
          <textarea className="mt-1 block w-full border rounded-md p-2 h-32"></textarea>
        </div>

        <button type="submit" className="w-full bg-blue-600 text-white font-bold py-2 rounded-md hover:bg-blue-700">
          ส่งคำขออนุมัติ
        </button>
      </form>
    </div>
  );
}
