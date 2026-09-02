import { chromium } from '@playwright/test';

const baseURL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const username = process.env.TEST_USER;
const password = process.env.TEST_PASSWORD;
const results = [];

if (!username || !password) {
  console.error('Set TEST_USER and TEST_PASSWORD for the local test account.');
  process.exit(2);
}

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({
  headless: process.env.HEADED !== 'true',
  slowMo: process.env.HEADED === 'true' ? 150 : 0,
});
const context = await browser.newContext({ baseURL });

// Safety boundary: the browser may only talk to this local app.
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    await route.continue();
  } else {
    await route.abort('blockedbyclient');
  }
});

const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const authRequests = [];
const failedRequests = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('request', (request) => {
  if (request.url().includes('/api/auth/')) authRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
});
page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${new URL(request.url()).pathname}`));

async function visit(name, path, expectedText) {
  let response;
  try {
    response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
    return { response: null, text: '' };
  }
  await page.waitForTimeout(500);
  const status = response?.status() ?? 0;
  const text = await page.locator('body').innerText().catch(() => '');
  const ok = status < 500 && (!expectedText || text.includes(expectedText));
  record(name, ok, `HTTP ${status}, URL ${page.url()}`);
  return { response, text };
}

await visit('login page loads', '/login', 'เข้าสู่ระบบ');
await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
record('unauthenticated dashboard redirects', page.url().includes('/login'), page.url());

const unauthApi = await page.request.get('/api/requests');
record('unauthenticated API is rejected', unauthApi.status() === 401, `HTTP ${unauthApi.status()}`);

await page.goto('/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.getByLabel(/username/i).fill(username);
await page.getByLabel(/password/i).fill(password);
await page.getByRole('button', { name: /เข้าสู่ระบบ|login/i }).click();
await page.waitForTimeout(1000);

let loggedIn = !page.url().includes('/login');
const loginErrors = await page.locator('.text-red-500, .text-red-700').allInnerTexts().catch(() => []);
record('test account login', loggedIn, `${page.url()}${loginErrors.length ? `; errors=${loginErrors.join(' | ')}` : ''}`);

if (!loggedIn) {
  // Diagnostic only: exercise the same NextAuth endpoint through Playwright.
  // This does not mutate application data; it only creates a local auth session.
  const csrfResponse = await page.request.get('/api/auth/csrf');
  const csrf = csrfResponse.ok() ? await csrfResponse.json() : {};
  const authResponse = await page.request.post('/api/auth/callback/credentials', {
    form: {
      csrfToken: csrf.csrfToken ?? '',
      username,
      password,
      callbackUrl: '/dashboard',
      json: 'true',
    },
  });
  const sessionResponse = await page.request.get('/api/auth/session');
  const session = sessionResponse.ok() ? await sessionResponse.json() : {};
  const apiLoggedIn = Boolean(session?.user);
  record('NextAuth credentials endpoint', authResponse.ok() && apiLoggedIn, `HTTP ${authResponse.status()} session=${apiLoggedIn}`);
  if (apiLoggedIn) {
    loggedIn = true;
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    record('authenticated dashboard opens after API login', !page.url().includes('/login'), page.url());
  }
}

if (loggedIn) {
  for (const [name, path] of [
    ['dashboard page', '/dashboard'],
    ['request list page', '/request'],
    ['new request form opens', '/request/new'],
    ['pending tasks page', '/pending-tasks'],
    ['notifications page', '/notifications'],
    ['profile page', '/profile'],
    ['report page', '/report'],
  ]) {
    await visit(name, path);
  }

  const adminApi = await page.request.get('/api/admin/users');
  const isAdmin = adminApi.status() === 200;
  record('admin API permission check', isAdmin || adminApi.status() === 403, `HTTP ${adminApi.status()}`);

  if (isAdmin) {
    for (const [name, path] of [
      ['admin dashboard', '/admin'],
      ['admin users page', '/admin/users'],
      ['admin roles page', '/admin/roles'],
      ['admin categories page', '/admin/categories'],
      ['admin departments page', '/admin/departments'],
      ['admin locations page', '/admin/locations'],
      ['admin statuses page', '/admin/statuses'],
      ['admin workflows page', '/admin/workflows'],
      ['admin transitions page', '/admin/workflow-transitions'],
      ['admin correction types page', '/admin/correction-types'],
      ['admin correction reasons page', '/admin/correction-reasons'],
      ['admin email templates page', '/admin/email-templates'],
      ['admin document config page', '/admin/doc-config'],
      ['admin audit logs page', '/admin/audit-logs'],
      ['admin audit report page', '/admin/audit-report'],
    ]) {
      await visit(name, path);
    }
  }

  const requestsResponse = await page.request.get('/api/requests?limit=1');
  if (requestsResponse.ok()) {
    const requestData = await requestsResponse.json();
    const requestId = requestData?.requests?.[0]?.id;
    if (requestId) {
      await visit('request detail page', `/request/${requestId}`);
      const pdfResponse = await page.request.get(`/api/requests/${requestId}/pdf`);
      record('request PDF endpoint', pdfResponse.status() < 500 && pdfResponse.headers()['content-type']?.includes('application/pdf'), `HTTP ${pdfResponse.status()}`);
    } else {
      record('request detail/PDF data availability', true, 'ไม่มีคำร้องในฐานข้อมูลทดสอบ');
    }
  } else {
    record('request list API for detail test', false, `HTTP ${requestsResponse.status()}`);
  }

  await visit('invalid approval token page', '/approve/browser-smoke-invalid-token');

  for (const path of [
    '/api/app/shell',
    '/api/me',
    '/api/statuses',
    '/api/pending-tasks/count',
    '/api/user/bulk-permission',
  ]) {
    const response = await page.request.get(path);
    record(`authenticated ${path}`, response.status() < 500, `HTTP ${response.status()}`);
  }
}

record('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
record('no browser console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
if (!loggedIn) {
  console.log(`AUTH_REQUESTS ${authRequests.join(' | ')}`);
  console.log(`FAILED_REQUESTS ${failedRequests.join(' | ')}`);
}

await browser.close();
const failed = results.filter((result) => !result.ok);
process.exitCode = failed.length ? 1 : 0;
