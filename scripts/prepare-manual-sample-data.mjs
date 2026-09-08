import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.MANUAL_BASE_URL ?? 'http://localhost:3100';
const password = process.env.MANUAL_PASSWORD ?? '1234';
const outputPath = path.resolve('docs/manual-assets/sample-data.json');
const existingIds = (process.env.MANUAL_EXISTING_IDS ?? '').split(',').map(Number).filter(Number.isFinite);
let clientNumber = 40;

const examples = [
  { targetStatus: 'PENDING', reason: 'ตัวอย่างคู่มือ: แก้ไขเลขที่บิลน้ำมันจาก 1414141 เป็น 47474', values: ['1414141', '47474'] },
  { targetStatus: 'PENDING', reason: 'ตัวอย่างคู่มือ: แก้ไขชื่อชาวไร่จาก นายสมชาย ใจดี เป็น นายสมหมาย ใจดี', values: ['นายสมชาย ใจดี', 'นายสมหมาย ใจดี'] },
  { targetStatus: 'WAITING_ACCOUNT_1', reason: 'ตัวอย่างคู่มือ: แก้ไขทะเบียนรถจาก 81-2345 เป็น 82-3456', values: ['81-2345', '82-3456'] },
  { targetStatus: 'WAITING_FINAL_APP', reason: 'ตัวอย่างคู่มือ: แก้ไขโควตาจาก 120 ตัน เป็น 150 ตัน', values: ['120 ตัน', '150 ตัน'] },
  { targetStatus: 'IT_WORKING', reason: 'ตัวอย่างคู่มือ: แก้ไขประเภทอ้อยจาก อ้อยสด เป็น อ้อยไฟไหม้', values: ['อ้อยสด', 'อ้อยไฟไหม้'] },
  { targetStatus: 'WAITING_ACCOUNT_2', reason: 'ตัวอย่างคู่มือ: แก้ไขข้อมูลพ่วงแม่และลูก เลขที่ 1001 และ 1002', values: ['1001', '1002'] },
  { targetStatus: 'WAITING_IT_CLOSE', reason: 'ตัวอย่างคู่มือ: แก้ไขใบปล่อยรถศูนย์ เลขที่ 2026-001', values: ['2026-001', '2026-002'] },
  { targetStatus: 'CLOSED', reason: 'ตัวอย่างคู่มือ: คำร้องที่ตรวจสอบและดำเนินการเสร็จสิ้นแล้ว', values: ['ข้อมูลเดิม', 'ข้อมูลที่แก้ไขแล้ว'] },
];

const browser = await chromium.launch({ headless: true });

async function login(username) {
  clientNumber += 1;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    extraHTTPHeaders: { 'x-forwarded-for': `10.254.0.${clientNumber}` },
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(1000);
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
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  const me = await page.request.get(`${baseUrl}/api/me`);
  if (!me.ok()) throw new Error(`Login failed for ${username}: ${me.status()}`);
  return { context, page };
}

async function createRequest(page, example, typeIndex) {
  await page.goto(`${baseUrl}/request/new`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '1. ข้อมูลทั่วไป' }).waitFor({ timeout: 30_000 });

  const category = page.locator('select').first();
  await page.waitForFunction(() => document.querySelectorAll('select')[0]?.options.length > 1);
  await category.selectOption({ index: 1 });
  const location = page.locator('select').nth(1);
  await page.waitForFunction(() => document.querySelectorAll('select')[1]?.options.length > 1);
  if (!(await location.inputValue())) await location.selectOption({ index: 1 });
  await page.locator('textarea').first().fill(example.reason);
  await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();

  await page.getByRole('heading', { name: '2. ระบุรายละเอียดการแก้ไข' }).waitFor({ timeout: 30_000 });
  const typeCheckboxes = page.locator('input[type="checkbox"]');
  await typeCheckboxes.first().waitFor();
  const count = await typeCheckboxes.count();
  await typeCheckboxes.nth(typeIndex % count).check();
  const fields = await page.locator('input[type="text"]:visible, textarea:visible').all();
  for (let index = 0; index < fields.length; index += 1) {
    if (!(await fields[index].inputValue()).trim()) {
      await fields[index].fill(example.values[index] ?? `ข้อมูลตัวอย่าง ${index + 1}`);
    }
  }
  const next = page.getByRole('button', { name: 'ถัดไป', exact: true });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'ถัดไป');
    return button && !button.disabled;
  });
  await next.click();

  await page.getByRole('heading', { name: '3. ตรวจสอบข้อมูลทั้งหมด' }).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: /ส่งคำร้อง/ }).click();
  await page.waitForURL(/\/request\/\d+/, { timeout: 30_000 });
  const id = Number(new URL(page.url()).pathname.split('/').pop());
  const response = await page.request.get(`${baseUrl}/api/requests/${id}`);
  const detail = await response.json();
  return { id, workOrderNo: detail.request.workOrderNo ?? detail.request.WorkOrderNo };
}

async function perform(page, id, actionName, comment) {
  const response = await page.request.post(`${baseUrl}/api/requests/${id}/action`, {
    data: { actionName, comment },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) throw new Error(`${actionName} ${id} failed: ${response.status()} ${JSON.stringify(body)}`);
}

const stageActions = [
  ['head_cane', 'APPROVE', 'ตรวจสอบข้อมูลตัวอย่างแล้ว ถูกต้องครบถ้วน'],
  ['accountant', 'APPROVE', 'บัญชีตรวจสอบเอกสารรอบแรกแล้ว'],
  ['final', 'APPROVE', 'อนุมัติให้ดำเนินการแก้ไขข้อมูล'],
  ['it_operator', 'IT_PROCESS', 'IT แก้ไขข้อมูลตามคำร้องเรียบร้อยแล้ว'],
  ['accountant', 'APPROVE', 'บัญชีตรวจสอบผลหลังแก้ไขแล้ว'],
  ['it_reviewer', 'CONFIRM_COMPLETE', 'ตรวจรับงานและยืนยันปิดงานเรียบร้อย'],
];

const targetDepth = {
  PENDING: 0,
  WAITING_ACCOUNT_1: 1,
  WAITING_FINAL_APP: 2,
  IT_WORKING: 3,
  WAITING_ACCOUNT_2: 4,
  WAITING_IT_CLOSE: 5,
  CLOSED: 6,
};

const sessions = new Map();
const created = [];

try {
  if (existingIds.length) {
    if (existingIds.length !== examples.length) throw new Error(`Expected ${examples.length} existing IDs, got ${existingIds.length}`);
    for (let index = 0; index < examples.length; index += 1) {
      created.push({ id: existingIds[index], workOrderNo: '', ...examples[index], correctionType: '' });
      console.log(`REUSE ${existingIds[index]} -> ${examples[index].targetStatus}`);
    }
  } else {
    const requester = await login('req_cane');
    const typesResponse = await requester.page.request.get(`${baseUrl}/api/master/correction-types?categoryId=1`);
    const correctionTypes = await typesResponse.json();

    for (let index = 0; index < examples.length; index += 1) {
      const example = examples[index];
      const request = await createRequest(requester.page, example, index);
      created.push({ ...request, ...example, correctionType: correctionTypes[index % correctionTypes.length]?.Name ?? '' });
      console.log(`CREATED ${request.id} ${request.workOrderNo} -> ${example.targetStatus}`);
    }
    await requester.context.close();
  }

  for (const item of created) {
    const depth = targetDepth[item.targetStatus];
    for (let index = 0; index < depth; index += 1) {
      const [username, actionName, comment] = stageActions[index];
      if (!sessions.has(username)) sessions.set(username, await login(username));
      await perform(sessions.get(username).page, item.id, actionName, comment);
    }
    if (!sessions.has('admin')) sessions.set('admin', await login('admin'));
    const verifier = sessions.get(stageActions[Math.max(0, depth - 1)]?.[0]) ?? sessions.get('admin');
    const response = await verifier.page.request.get(`${baseUrl}/api/requests/${item.id}`);
    const body = await response.json();
    const actual = body.request.status ?? body.request.Status;
    item.workOrderNo = body.request.workOrderNo ?? body.request.WorkOrderNo ?? body.request.requestNumber ?? '';
    if (actual !== item.targetStatus) throw new Error(`Request ${item.id}: expected ${item.targetStatus}, got ${actual}`);
    console.log(`READY ${item.id} ${actual}`);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({ createdAt: new Date().toISOString(), requests: created }, null, 2)}\n`, 'utf8');
  console.log(`MANIFEST ${outputPath}`);
} finally {
  for (const { context } of sessions.values()) await context.close().catch(() => {});
  await browser.close();
}
