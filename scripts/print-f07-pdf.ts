/**
 * ตัวอย่างสคริปต์สร้าง PDF จากหน้า Print (F07FormPrint) ด้วย Puppeteer
 * ได้ผลลัพธ์ภาษาไทยและ Layout ตรงกับเว็บ 100%
 *
 * การใช้:
 * 1. npm install puppeteer
 * 2. รัน dev server: npm run dev
 * 3. ล็อกอินในเบราว์เซอร์ แล้ว copy cookie (หรือใช้ token ถ้า API รองรับ)
 * 4. node --import tsx scripts/print-f07-pdf.ts <requestId> [baseUrl]
 *
 * หมายเหตุ: หน้า /request/[id]/print ต้องมี session จึงต้องส่ง cookie หรือ
 * แก้ให้ API รองรับ token สำหรับ PDF (เช่น ?token=xxx)
 */
async function main() {
  const id = process.argv[2] || '1';
  const baseUrl = process.argv[3] || 'http://localhost:3000';
  const printUrl = `${baseUrl}/request/${id}/print`;

  let browser: Awaited<ReturnType<typeof import('puppeteer').launch>> | null = null;
  try {
    const puppeteer = await import('puppeteer');
    browser = await puppeteer.default.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 });
    await page.goto(printUrl, {
      waitUntil: 'networkidle0',
      timeout: 15000,
    });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
    const fs = await import('fs');
    const outPath = `F07-${id}-print.pdf`;
    fs.writeFileSync(outPath, pdfBuffer);
    console.log('Saved:', outPath);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
