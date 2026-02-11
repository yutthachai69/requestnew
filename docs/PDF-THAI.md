# PDF ใบ F07 และปัญหา Thai Character Shaping

## สรุปฟังก์ชันส่งออก PDF ในโปรเจกต์นี้ (Next.js)

| วิธี | ไฟล์ | ฟังก์ชัน | ปุ่ม/การเรียกใช้ |
|-----|------|----------|-------------------|
| **Client-side (ตรงตามจอ)** | `app/(main)/request/[id]/print/page.tsx` | `handleExportPdfClient` | ปุ่ม "ส่งออกเป็น PDF" |
| **Server-side (pdf-lib)** | `app/api/requests/[id]/pdf/route.ts` | `buildF07Pdf` | ปุ่ม "ดาวน์โหลด PDF จากเซิร์ฟเวอร์" หรือ GET `/api/requests/[id]/pdf` |

- **Client-side:** ใช้ **html2canvas** ถ่ายรูป DOM ของฟอร์ม (F07FormPrint) แล้ว **jsPDF** ใส่รูปลงหน้าแรกและบันทึก → ผลลัพธ์ตรงกับจอ ภาษาไทยไม่เพี้ยน
- **Server-side:** ใช้ **pdf-lib** วาดฟอร์มจากข้อมูล API → อาจมีสระลอย/วรรณยุกต์ซ้อน แต่เลือก/ค้นหาข้อความใน PDF ได้

Flow แบบ client-side (เหมือน RequestDetailPage.jsx เดิม):

1. ตรวจ `formRef.current` และ `request` → ตั้ง `downloading = true`
2. โหลด html2canvas + jsPDF (dynamic import)
3. html2canvas กับ element ที่ `formRef` (id `export-form-paper`), scale: 2, useCORS: true
4. แปลง canvas เป็น Data URL (PNG)
5. สร้าง jsPDF A4 → addImage รูปฟอร์ม → save

---

## ปัญหาที่เกิดขึ้นกับ pdf-lib

1. **สระลอย / วรรณยุกต์ซ้อน**  
   pdf-lib วาดตัวอักษรทีละตัวตามลำดับ ไม่มีการทำ **Thai Character Shaping** (การจัดตำแหน่งสระบน/ล่าง และวรรณยุกต์) จึงทำให้สระและวรรณยุกต์อาจวางซ้อนหรือลอยผิดตำแหน่ง

2. **Layout เลื่อน**  
   การคำนวณตำแหน่ง Y แบบทีละบรรทัดอาจไม่สัมพันธ์กับขนาดฟอนต์ไทยจริง (upper/lower bound ของฟอนต์ไทยมักสูงกว่าภาษาอังกฤษ) จึงทำให้เส้นตารางและข้อความทับหรือเลื่อนได้

## สิ่งที่ทำในโค้ดปัจจุบัน (pdf-lib)

- ใช้ **จุดอ้างอิงกล่องคงที่ (Box Reference Points)** แทนการลด y ทีละบรรทัด:
  - Header Box: y 800–730  
  - User Info Box: y 720–680  
  - Detail Box: y 670–400  
  - IT Box: y 390–200  

- ใช้ **LINE_HEIGHT_THAI = 18** สำหรับระยะห่างบรรทัดที่เกี่ยวกับข้อความไทย  
- ฝังฟอนต์ **Noto Sans Thai** (จาก .env, node_modules, lib/fonts หรือ CDN) เพื่อให้รองรับตัวอักษรไทย

หมายเหตุ: แพ็กเกจ `thai-smart-copy` ที่กล่าวถึงในบางที่อาจไม่มีบน npm; ถ้ามีฟังก์ชันช่วยจัดตำแหน่งสระ/วรรณยุกต์ก่อนส่งเข้า `drawText` ก็สามารถนำมาใช้เสริมได้

## ทางเลือก: สร้าง PDF จาก HTML (ผลลัพธ์ตรงกับ F07FormPrint 100%)

ถ้าต้องการให้ PDF ตรงกับหน้าเว็บ (ภาษาไทยและ Layout เหมือนที่เห็นบนจอ) แนะนำให้ใช้ **Puppeteer** หรือ **Playwright** ทำ **Print to PDF** จากหน้า HTML ที่ใช้คอมโพเนนต์ `F07FormPrint` โดยตรง

### วิธีใช้ Puppeteer (ตัวอย่างรันบนเครื่องตัวเอง)

1. ติดตั้ง Puppeteer:
   ```bash
   npm install puppeteer
   ```

2. รันเซิร์ฟเวอร์แอป (เช่น `npm run dev`) แล้วใช้สคริปต์ `scripts/print-f07-pdf.ts` เพื่อเปิด URL หน้ากดพิมพ์ (เช่น `http://localhost:3000/request/1/print`) และสั่ง `page.pdf()` แล้วบันทึกไฟล์

3. หรือสร้าง API route ที่ใช้ Puppeteer/Playwright ในฝั่ง Server เพื่อเปิด URL ภายใน (ต้องจัดการ authentication เช่น token หรือ cookie) แล้วส่ง PDF กลับ

### ข้อควรระวัง

- บน Vercel / Serverless การใช้ Puppeteer/Playwright มักต้องใช้ Chromium แยก (เช่น Layer หรือ external service) เพราะ binary ใหญ่
- การยิงจาก API ไปที่หน้า print ต้องส่ง cookie หรือ token เพื่อให้ได้หน้าที่ login แล้ว

## สรุป

| วิธี | ข้อดี | ข้อเสีย |
|-----|--------|--------|
| **pdf-lib (ปัจจุบัน)** | ไม่ต้องพึ่ง browser, เหมาะกับ serverless | อาจมีสระลอย/วรรณยุกต์ซ้อน และ layout เลื่อนเล็กน้อย |
| **Puppeteer/Playwright** | ภาษาไทยและ Layout ตรงกับเว็บ 100% | ต้องมี browser, ใช้ทรัพยากรมากกว่า เหมาะกับรันบนเครื่องหรือ server ที่มี Chromium |
