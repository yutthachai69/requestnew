import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.MANUAL_BASE_URL ?? 'http://localhost:3100';
const password = process.env.MANUAL_PASSWORD ?? '1234';
const outputDir = path.resolve('docs/manual-assets');
const captureGroup = process.env.MANUAL_CAPTURE_GROUP ?? 'all';
const roleFilter = process.env.MANUAL_CAPTURE_ROLE ?? '';
const manifest = JSON.parse(await fs.readFile(path.join(outputDir, 'sample-data.json'), 'utf8'));
const samples = new Map(manifest.requests.map((item) => [item.targetStatus, item]));
let clientNumber = 80;

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function login(username) {
  clientNumber += 1;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    extraHTTPHeaders: { 'x-forwarded-for': `10.255.0.${clientNumber}` },
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(800);
  if (page.url().includes('/login')) {
    const csrfResponse = await page.request.get(`${baseUrl}/api/auth/csrf`);
    const csrf = await csrfResponse.json();
    const authResponse = await page.request.post(`${baseUrl}/api/auth/callback/credentials`, {
      timeout: 60_000,
      form: {
        csrfToken: csrf.csrfToken ?? '',
        username,
        password,
        callbackUrl: `${baseUrl}/dashboard`,
        json: 'true',
      },
    });
    if (!authResponse.ok()) throw new Error(`Credential callback failed for ${username}: ${authResponse.status()}`);
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  }
  const me = await page.request.get(`${baseUrl}/api/me`);
  if (!me.ok()) throw new Error(`Login failed for ${username}: /api/me returned ${me.status()}`);
  return { context, page };
}

async function gotoWithRetry(page, pathname) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(750);
    }
  }
  throw lastError;
}

async function waitUntilRendered(page, locator, requiredText = '') {
  await locator.waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForFunction((expected) => {
    const body = document.body?.innerText ?? '';
    const hasLoadingText = body.includes('กำลังโหลด') || body.includes('กรุณาเข้าสู่ระบบ');
    const hasSkeleton = document.querySelectorAll('.animate-pulse.bg-gray-200').length > 0;
    return !hasLoadingText && !hasSkeleton && (!expected || body.includes(expected));
  }, requiredText, { timeout: 45_000 });
  await page.waitForTimeout(1000);
}

async function saveScreenshot(page, filename) {
  await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach((element) => element.remove()));
  const body = await page.locator('body').innerText();
  if (body.includes('กำลังโหลด') || body.includes('กรุณาเข้าสู่ระบบ')) {
    throw new Error(`${filename}: loading text is still visible`);
  }
  if (await page.locator('.animate-pulse.bg-gray-200').count()) {
    throw new Error(`${filename}: skeleton is still visible`);
  }
  await page.screenshot({ path: path.join(outputDir, filename), fullPage: false });
  console.log(`CAPTURED ${filename}`);
}

async function capture(page, pathname, filename, readyLocator, requiredText = '') {
  await gotoWithRetry(page, pathname);
  await waitUntilRendered(page, readyLocator, requiredText);
  await saveScreenshot(page, filename);
}

async function captureRequester() {
  const pending = manifest.requests.find((item) => item.targetStatus === 'PENDING');
  const dashboard = await login('req_cane');
  await capture(dashboard.page, '/dashboard', 'requester-dashboard.png', dashboard.page.getByText(pending.workOrderNo, { exact: true }).first());
  await capture(dashboard.page, '/category/1', 'requester-requests.png', dashboard.page.getByText(pending.workOrderNo, { exact: true }).first());
  await dashboard.context.close();

  const form = await login('req_cane');
  await gotoWithRetry(form.page, '/request/new');
  await form.page.getByRole('heading', { name: '1. ข้อมูลทั่วไป' }).waitFor({ timeout: 45_000 });
  const category = form.page.locator('select').first();
  await form.page.waitForFunction(() => document.querySelectorAll('select')[0]?.options.length > 1);
  await category.selectOption({ index: 1 });
  await form.page.waitForFunction(() => document.querySelectorAll('select')[1]?.options.length > 1);
  await waitUntilRendered(form.page, form.page.getByRole('heading', { name: '1. ข้อมูลทั่วไป' }));
  await saveScreenshot(form.page, 'requester-new-step1.png');

  await form.page.locator('textarea').first().fill('ตัวอย่างคู่มือ: แก้ไขเลขที่บิลน้ำมันจาก 1414141 เป็น 47474');
  await form.page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
  await form.page.getByRole('heading', { name: '2. ระบุรายละเอียดการแก้ไข' }).waitFor({ timeout: 45_000 });
  await form.page.locator('input[type="checkbox"]').first().check();
  const detailFields = await form.page.locator('input[type="text"]:visible, textarea:visible').all();
  const detailValues = ['1414141', '47474'];
  for (let index = 0; index < detailFields.length; index += 1) {
    if (!(await detailFields[index].inputValue()).trim()) await detailFields[index].fill(detailValues[index] ?? `ข้อมูลตัวอย่าง ${index + 1}`);
  }
  await waitUntilRendered(form.page, form.page.getByRole('heading', { name: '2. ระบุรายละเอียดการแก้ไข' }));
  await saveScreenshot(form.page, 'requester-new-step2.png');
  await form.page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'ถัดไป');
    return button && !button.disabled;
  });
  await form.page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
  await waitUntilRendered(form.page, form.page.getByRole('heading', { name: '3. ตรวจสอบข้อมูลทั้งหมด' }));
  await saveScreenshot(form.page, 'requester-new-step3.png');
  await form.context.close();

  const detail = await login('req_cane');
  await capture(detail.page, `/request/${pending.id}`, 'requester-detail.png', detail.page.getByText(pending.workOrderNo, { exact: true }).first());
  await capture(detail.page, '/profile', 'requester-profile.png', detail.page.getByText('ลายเซ็นอิเล็กทรอนิกส์', { exact: true }));
  await detail.context.close();
}

async function captureRole(username, status, prefix) {
  const sample = samples.get(status);
  const listSession = await login(username);
  await capture(listSession.page, '/pending-tasks', `${prefix}-pending-tasks.png`, listSession.page.getByRole('heading', { name: 'รายการที่ต้องอนุมัติ/ดำเนินการ' }), sample.workOrderNo);
  await listSession.context.close();
  const detailSession = await login(username);
  await capture(detailSession.page, `/request/${sample.id}`, `${prefix}-request-detail.png`, detailSession.page.getByText('แบบฟอร์มขอแก้ไขข้อมูลระบบ', { exact: true }).first(), sample.workOrderNo);
  return detailSession;
}

async function captureApprovers() {
  if (!roleFilter || roleFilter === 'head') {
    const head = await captureRole('head_cane', 'PENDING', 'head');
    await head.page.getByRole('button', { name: 'ปฏิเสธ/ส่งกลับ', exact: true }).click();
    await head.page.getByPlaceholder('กรุณาระบุเหตุผล').fill('ข้อมูลไม่ครบถ้วน กรุณาตรวจสอบเลขที่เอกสารและแก้ไข');
    await waitUntilRendered(head.page, head.page.getByRole('heading', { name: 'ยืนยันการดำเนินการ' }));
    await saveScreenshot(head.page, 'head-reject-dialog.png');
    await head.page.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    await head.page.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
    await waitUntilRendered(head.page, head.page.getByRole('heading', { name: 'ยืนยันการดำเนินการ' }));
    await saveScreenshot(head.page, 'head-approve-dialog.png');
    await head.page.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    await head.context.close();
    const profile = await login('head_cane');
    await capture(profile.page, '/profile', 'approver-profile.png', profile.page.getByText('ลายเซ็นอิเล็กทรอนิกส์', { exact: true }));
    await profile.context.close();
  }
  if (!roleFilter || roleFilter === 'accountant') {
    const accountant = await captureRole('accountant', 'WAITING_ACCOUNT_1', 'accountant');
    await accountant.context.close();
  }
  if (!roleFilter || roleFilter === 'final') {
    const final = await captureRole('final', 'WAITING_FINAL_APP', 'final');
    await final.context.close();
    const finalDashboard = await login('final');
    await capture(finalDashboard.page, '/dashboard', 'approver-dashboard.png', finalDashboard.page.getByRole('heading', { name: 'ภาพรวมคำร้อง' }), samples.get('WAITING_FINAL_APP').workOrderNo);
    await finalDashboard.context.close();
    const finalReport = await login('final');
    await capture(finalReport.page, '/report', 'approver-report.png', finalReport.page.getByRole('heading', { name: /รายงาน/ }).first());
    await finalReport.context.close();
  }
  if (!roleFilter || roleFilter === 'it-operator') {
    const operator = await captureRole('it_operator', 'IT_WORKING', 'it-operator');
    await operator.context.close();
  }
  if (!roleFilter || roleFilter === 'it-reviewer') {
    const reviewer = await captureRole('it_reviewer', 'WAITING_IT_CLOSE', 'it-reviewer');
    await reviewer.context.close();
  }
}

try {
  if (captureGroup === 'all' || captureGroup === 'requester') await captureRequester();
  if (captureGroup === 'all' || captureGroup === 'approver') await captureApprovers();
} finally {
  await browser.close();
}
