import { chromium } from '@playwright/test';

const baseURL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const password = process.env.TEST_PASSWORD;
const results = [];

const accounts = {
  requester: process.env.TEST_REQUESTER ?? 'req_cane',
  head: process.env.TEST_HEAD ?? 'head_cane',
  accountant: process.env.TEST_ACCOUNTANT ?? 'accountant',
  final: process.env.TEST_FINAL ?? 'final',
  it: process.env.TEST_IT ?? 'it_operator',
  itReviewer: process.env.TEST_IT_REVIEWER ?? 'it_reviewer',
  admin: process.env.TEST_ADMIN ?? 'admin',
};

if (!password) {
  console.error('Set TEST_PASSWORD for the local seeded test accounts.');
  process.exit(2);
}

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function json(response) {
  try { return await response.json(); } catch { return {}; }
}

async function login(context, username) {
  const page = await context.newPage();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(1200);

  if (page.url().includes('/login')) {
    const csrfResponse = await page.request.get('/api/auth/csrf');
    const csrf = csrfResponse.ok() ? await csrfResponse.json() : {};
    await page.request.post('/api/auth/callback/credentials', {
      form: { csrfToken: csrf.csrfToken ?? '', username, password, callbackUrl: '/dashboard', json: 'true' },
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        await page.waitForTimeout(1000);
      }
    }
    await page.waitForTimeout(800);
  }

  const ok = !page.url().includes('/login');
  record(`login ${username}`, ok, page.url());
  if (!ok) throw new Error(`Login failed: ${username}`);
  return page;
}

async function clickButtonContaining(page, text) {
  const buttons = page.locator('button');
  const index = await buttons.evaluateAll((items, needle) =>
    items.findIndex((item) => (item.textContent ?? '').includes(needle)), text);
  if (index < 0) throw new Error(`Button not found: ${text}`);
  await buttons.nth(index).click();
}

async function clickLastEnabled(page) {
  if (process.env.DEBUG_MUTATION === 'true') {
    console.log('BUTTONS', await page.locator('button:visible').allTextContents());
  }
  await page.locator('button:visible:enabled').last().click();
}

async function readRequest(page, id) {
  const response = await page.request.get(`/api/requests/${id}`);
  return { response, data: await json(response) };
}

const browser = await chromium.launch({
  headless: process.env.HEADED !== 'true',
  slowMo: process.env.HEADED === 'true' ? 180 : 0,
});

function configureContext(context) {
  return context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return route.continue();
    return route.abort('blockedbyclient');
  });
}

const requesterContext = await browser.newContext({ baseURL });
const headContext = await browser.newContext({ baseURL });
const accountantContext = await browser.newContext({ baseURL });
const finalContext = await browser.newContext({ baseURL });
const itContext = await browser.newContext({ baseURL });
const itReviewerContext = await browser.newContext({ baseURL });
const adminContext = await browser.newContext({ baseURL });
for (const context of [requesterContext, headContext, accountantContext, finalContext, itContext, itReviewerContext, adminContext]) {
  await configureContext(context);
}

if (process.env.CLEANUP_ID) {
  const cleanupPage = await login(adminContext, accounts.admin);
  const cleanup = await cleanupPage.request.delete(`/api/requests/${Number(process.env.CLEANUP_ID)}`);
  console.log(`CLEANUP request=${Number(process.env.CLEANUP_ID)} HTTP=${cleanup.status()}`);
  await browser.close();
  process.exitCode = cleanup.ok() || cleanup.status() === 404 ? 0 : 1;
  process.exit();
}

let requestId;
let requestDeleted = false;
try {
  // Create a request through the visible three-step UI.
  const requester = await login(requesterContext, accounts.requester);
  await requester.goto('/request/new', { waitUntil: 'domcontentloaded' });
  await requester.waitForTimeout(1600);

  const categoriesResponse = await requester.request.get('/api/master/categories');
  const categories = await json(categoriesResponse);
  const categoryList = Array.isArray(categories) ? categories : [];
  let selectedCategory;
  for (const category of categoryList) {
    const categoryId = category.CategoryID ?? category.id;
    const typesResponse = await requester.request.get(`/api/master/correction-types?categoryId=${categoryId}`);
    const types = await json(typesResponse);
    if (typesResponse.ok() && Array.isArray(types) && types.length > 0) {
      selectedCategory = { categoryId: String(categoryId), types };
      break;
    }
  }
  if (!selectedCategory) throw new Error('No accessible category with correction type found');

  const selects = requester.locator('select');
  await selects.nth(0).selectOption(selectedCategory.categoryId);
  await requester.waitForTimeout(700);
  await requester.locator('textarea').first().fill(`SMOKE TEST ${new Date().toISOString()} — ทดสอบสร้างคำขอ`);
  await requester.getByRole('button', { name: 'ถัดไป', exact: true }).click();
  await requester.waitForTimeout(500);
  if (process.env.DEBUG_MUTATION === 'true') console.log('AFTER_STEP_1', requester.url());

  const checks = requester.locator('input[type="checkbox"]');
  if (await checks.count()) await checks.first().check();
  await requester.waitForTimeout(300);
  for (const field of await requester.locator('input[required]:visible, textarea[required]:visible').all()) {
    if (await field.getAttribute('type') === 'checkbox') continue;
    const value = await field.inputValue().catch(() => '');
    if (!value.trim()) await field.fill('SMOKE TEST DETAIL');
  }
  await requester.getByRole('button', { name: 'ถัดไป', exact: true }).click();
  await requester.waitForTimeout(400);
  if (process.env.DEBUG_MUTATION === 'true') console.log('AFTER_STEP_2', requester.url());
  await requester.getByRole('button', { name: /ส่งคำร้อง/ }).click();
  await requester.waitForURL(/\/request\/\d+/, { timeout: 15000 });
  requestId = Number(new URL(requester.url()).pathname.split('/').pop());
  record('create request through UI', Number.isInteger(requestId) && requestId > 0, `id=${requestId}`);

  let state = (await readRequest(requester, requestId)).data?.request;
  record('new request starts PENDING', state?.status === 'PENDING', state?.status ?? 'missing');

  // Reject once, then edit and resubmit to exercise the revision path.
  const head = await login(headContext, accounts.head);
  await head.goto(`/request/${requestId}`, { waitUntil: 'domcontentloaded' });
  await head.waitForTimeout(1000);
  const headDetail = (await readRequest(head, requestId)).data;
  const reject = (headDetail.possibleActions ?? []).find((a) => a.ActionName === 'REJECT');
  if (!reject) throw new Error('Head cannot reject the newly created request');
  await clickButtonContaining(head, reject.ActionDisplayName);
  await head.locator('textarea:visible').last().fill('SMOKE TEST: กรุณาแก้ไขรายละเอียด');
  await head.getByRole('button', { name: 'ยืนยัน', exact: true }).last().click();
  await head.waitForTimeout(1200);
  state = (await readRequest(head, requestId)).data?.request;
  record('head rejects request with comment', state?.status === 'REVISION', state?.status ?? 'missing');

  await requester.goto(`/request/${requestId}/edit`, { waitUntil: 'domcontentloaded' });
  await requester.waitForTimeout(800);
  const editText = requester.locator('textarea').first();
  await editText.fill(`${await editText.inputValue()} — แก้ไขแล้ว`);
  await requester.locator('form button[type="submit"]').click();
  await requester.waitForTimeout(1200);
  state = (await readRequest(requester, requestId)).data?.request;
  record('requester edits and resubmits revision', state?.status === 'PENDING', state?.status ?? 'missing');

  // Approve each workflow stage with the seeded account for that stage.
  const stages = [
    { code: 'PENDING', context: headContext, username: accounts.head, action: 'APPROVE' },
    { code: 'WAITING_ACCOUNT_1', context: accountantContext, username: accounts.accountant, action: 'APPROVE' },
    { code: 'WAITING_FINAL_APP', context: finalContext, username: accounts.final, action: 'APPROVE' },
    { code: 'IT_WORKING', context: itContext, username: accounts.it, action: 'IT_PROCESS' },
    { code: 'WAITING_ACCOUNT_2', context: accountantContext, username: accounts.accountant, action: 'APPROVE' },
    { code: 'WAITING_IT_CLOSE', context: itReviewerContext, username: accounts.itReviewer, action: 'CONFIRM_COMPLETE' },
  ];
  const pages = new Map();
  for (const stage of stages) {
    const page = pages.get(stage.username) ?? await login(stage.context, stage.username);
    pages.set(stage.username, page);
    const detail = (await readRequest(page, requestId)).data;
    state = detail?.request;
    if (state?.status === 'CLOSED') break;
    if (state?.status !== stage.code) {
      record(`workflow stage ${stage.code}`, false, `actual=${state?.status ?? 'missing'}`);
      break;
    }
    const action = (detail.possibleActions ?? []).find((a) => a.ActionName === stage.action);
    if (!action) {
      record(`workflow action ${stage.action} at ${stage.code}`, false, 'action unavailable');
      break;
    }
    await page.goto(`/request/${requestId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    await clickButtonContaining(page, action.ActionDisplayName);
    const modal = page.locator('div.fixed').last();
    if (stage.action === 'IT_PROCESS') await page.locator('textarea:visible').last().fill('SMOKE TEST IT processing');
    await page.getByRole('button', { name: 'ยืนยัน', exact: true }).last().click();
    await page.waitForTimeout(1400);
    const after = (await readRequest(page, requestId)).data?.request;
    record(`workflow ${stage.code} → ${after?.status ?? 'missing'}`, after?.status !== stage.code, `action=${stage.action}`);
    state = after;
  }
  record('workflow reaches CLOSED', state?.status === 'CLOSED', state?.status ?? 'missing');

  // Admin delete is the final destructive check, scoped to the smoke-created request.
  const admin = await login(adminContext, accounts.admin);
  const deleteResponse = await admin.request.delete(`/api/requests/${requestId}`);
  record('admin deletes smoke-test request', deleteResponse.ok(), `HTTP ${deleteResponse.status()}`);
  requestDeleted = deleteResponse.ok();
  const verifyDelete = await admin.request.get(`/api/requests/${requestId}`);
  record('deleted request is no longer readable', verifyDelete.status() === 404, `HTTP ${verifyDelete.status()}`);
} catch (error) {
  record('mutation smoke run', false, error instanceof Error ? error.message : String(error));
} finally {
  if (requestId && !requestDeleted) {
    try {
      const cleanupPage = await login(adminContext, accounts.admin);
      const cleanup = await cleanupPage.request.delete(`/api/requests/${requestId}`);
      console.log(`CLEANUP request=${requestId} HTTP=${cleanup.status()}`);
    } catch (cleanupError) {
      console.error('CLEANUP_FAILED', cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
    }
  }
  await browser.close();
}

const failed = results.filter((result) => !result.ok);
console.log(`RESULTS passed=${results.length - failed.length} failed=${failed.length}`);
process.exitCode = failed.length ? 1 : 0;
