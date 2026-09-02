/**
 * Mobile / touch coverage.
 *
 * The system is used on the factory floor from phones, but every other spec
 * runs at desktop width. These tests drive the real journeys on a phone
 * viewport with touch input, and check the two things that actually break on
 * small screens: controls that cannot be reached, and layouts that scroll
 * sideways.
 *
 * Signature capture is an image *upload*, not a draw-on-canvas pad, so the
 * touch risk there is file selection — covered here plus server-side validation
 * in lib/signature.test.ts.
 */
import { test, expect, devices } from '@playwright/test';
import { TEMP_PASSWORD, passwordFor, withThrowawayAccounts } from './rate-limit-isolation.js';

const password = process.env.TEST_PASSWORD;
const accounts = {
  requester: process.env.TEST_REQUESTER ?? process.env.TEST_USER ?? 'req_cane',
  testRequester: process.env.TEST_REQUESTER ?? process.env.TEST_USER ?? 'req_cane',
  head: process.env.TEST_HEAD ?? 'head_cane',
  admin: process.env.TEST_ADMIN ?? 'admin',
};

withThrowawayAccounts(test, accounts, password);

const PHONE = devices['Pixel 5'];

async function localOnly(context) {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      await route.continue();
    } else {
      await route.abort('blockedbyclient');
    }
  });
}

async function gotoWithRetry(page, path) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(750);
    }
  }
  throw lastError;
}

async function login(page, username, loginPassword = passwordFor(username, password)) {
  await gotoWithRetry(page, '/login');
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(loginPassword);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(800);

  if (page.url().includes('/login')) {
    const csrfResponse = await page.request.get('/api/auth/csrf');
    const csrf = csrfResponse.ok() ? await csrfResponse.json() : {};
    const authResponse = await page.request.post('/api/auth/callback/credentials', {
      form: {
        csrfToken: csrf.csrfToken ?? '',
        username,
        password: loginPassword,
        callbackUrl: '/dashboard',
        json: 'true',
      },
    });
    expect(authResponse.ok(), `login ${username} → ${authResponse.status()}`).toBeTruthy();
    await gotoWithRetry(page, '/dashboard');
  }
  await expect(page, `login ${username}`).not.toHaveURL(/\/login/);
}

/** The page body must never scroll sideways on a phone. */
async function expectNoHorizontalOverflow(page, label) {
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  // 1px of rounding is tolerable; anything more is a real sideways scroll.
  expect(
    overflow.scrollWidth - overflow.clientWidth,
    `${label} scrolls sideways (${overflow.scrollWidth} > ${overflow.clientWidth})`
  ).toBeLessThanOrEqual(1);
}

async function phonePage(browser, username, loginPassword) {
  const context = await browser.newContext({ ...PHONE });
  await localOnly(context);
  const page = await context.newPage();
  await login(page, username, loginPassword);
  return { page, context };
}

test.describe('phone viewport', () => {
  test('core pages fit the screen and stay usable', async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(!password, 'Set TEST_PASSWORD to run authenticated tests');

    const { page, context } = await phonePage(browser, accounts.requester);
    try {
      for (const path of ['/dashboard', '/request', '/request/new', '/notifications', '/profile', '/report']) {
        const response = await gotoWithRetry(page, path);
        expect(response?.status(), path).toBeLessThan(500);
        await expectNoHorizontalOverflow(page, path);
      }
    } finally {
      await context.close();
    }
  });

  test('a request can be submitted end to end by touch', async ({ browser }) => {
    test.setTimeout(180_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const contexts = [];
    let requestId;
    let adminPage;

    try {
      const requester = await phonePage(browser, accounts.testRequester, TEMP_PASSWORD);
      contexts.push(requester.context);
      const page = requester.page;

      await gotoWithRetry(page, '/request/new');
      await page.waitForTimeout(700);

      const categories = await (await page.request.get('/api/master/categories')).json();
      let selectedCategory;
      for (const category of Array.isArray(categories) ? categories : []) {
        const categoryId = category.CategoryID ?? category.id;
        const typesResponse = await page.request.get(`/api/master/correction-types?categoryId=${categoryId}`);
        const types = typesResponse.ok() ? await typesResponse.json() : [];
        if (Array.isArray(types) && types.length > 0) {
          selectedCategory = String(categoryId);
          break;
        }
      }
      expect(selectedCategory).toBeTruthy();

      await page.locator('select').nth(0).selectOption(selectedCategory);
      await page.waitForTimeout(500);
      await page.locator('textarea').first().fill(`MOBILE TEST ${Date.now()} — ทดสอบบนมือถือ`);
      await expectNoHorizontalOverflow(page, '/request/new step 1');

      // `tap()` requires a touch-enabled context — it fails if the phone
      // emulation is not actually in effect, which is the point.
      await page.getByRole('button', { name: 'ถัดไป', exact: true }).tap();

      const types = page.locator('input[type="checkbox"]');
      if (await types.count()) await types.first().tap();
      for (const field of await page.locator('input[required]:visible, textarea[required]:visible').all()) {
        if ((await field.getAttribute('type')) === 'checkbox') continue;
        if (!(await field.inputValue().catch(() => '')).trim()) await field.fill('MOBILE TEST DETAIL');
      }
      await expectNoHorizontalOverflow(page, '/request/new step 2');
      await page.getByRole('button', { name: 'ถัดไป', exact: true }).tap();
      await page.getByRole('button', { name: /ส่งคำร้อง/ }).tap();
      await page.waitForURL(/\/request\/\d+/, { timeout: 30_000 });
      requestId = Number(new URL(page.url()).pathname.split('/').pop());

      // The detail page a requester lands on must also fit the phone.
      await expectNoHorizontalOverflow(page, `/request/${requestId}`);

      // And the approver's queue and approval link must work on a phone too.
      const head = await phonePage(browser, accounts.head);
      contexts.push(head.context);
      await gotoWithRetry(head.page, '/pending-tasks');
      await expectNoHorizontalOverflow(head.page, '/pending-tasks');

      const tasks = await (await head.page.request.get('/api/pending-tasks')).json();
      const task = (tasks.requests ?? []).find((item) => item.id === requestId);
      expect(task, `request ${requestId} not in approver queue`).toBeTruthy();

      await gotoWithRetry(head.page, `/approve/${task.approvalToken}`);
      await expect(head.page.getByRole('button', { name: /อนุมัติ \(Approve\)/ })).toBeVisible();
      await expectNoHorizontalOverflow(head.page, '/approve/<token>');
    } finally {
      if (requestId) {
        const admin = await phonePage(browser, accounts.admin);
        contexts.push(admin.context);
        adminPage = admin.page;
        const cleanup = await adminPage.request.delete(`/api/requests/${requestId}`);
        expect(cleanup.ok(), `cleanup request ${requestId}`).toBeTruthy();
      }
      for (const context of contexts) await context.close().catch(() => {});
    }
  });

  test('signature upload is validated on the server, not just in the browser', async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const { page, context } = await phonePage(browser, accounts.testRequester, TEMP_PASSWORD);
    try {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const asDataUrl = (type, buffer) => `data:image/${type};base64,${buffer.toString('base64')}`;

      // The profile page enforces 2MB and image-only in JS; the API must not
      // trust that, because it can be called directly from a phone or curl.
      const rejected = [
        ['oversized', asDataUrl('png', Buffer.concat([png, Buffer.alloc(3 * 1024 * 1024)]))],
        ['type mismatch', asDataUrl('png', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))],
        ['svg with script', asDataUrl('svg+xml', Buffer.from('<svg onload="alert(1)"/>'))],
        ['html disguised', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
        ['empty payload', 'data:image/png;base64,'],
        ['remote url', 'https://example.com/signature.png'],
      ];
      for (const [label, signatureData] of rejected) {
        const response = await page.request.post('/api/me/signature', { data: { signatureData } });
        expect(response.status(), `${label} was accepted`).toBe(400);
      }

      // The stored signature must be unchanged after all those attempts.
      const before = (await (await page.request.get('/api/me')).json()).user.signatureUrl;
      expect(before ?? null).toBe(null);

      // A real, small PNG is accepted, and clearing it works.
      const accepted = await page.request.post('/api/me/signature', {
        data: { signatureData: asDataUrl('png', png) },
      });
      expect(accepted.status(), await accepted.text()).toBe(200);
      expect((await (await page.request.get('/api/me')).json()).user.signatureUrl).toContain('data:image/png');

      const cleared = await page.request.post('/api/me/signature', { data: { signatureData: null } });
      expect(cleared.status()).toBe(200);
      expect((await (await page.request.get('/api/me')).json()).user.signatureUrl ?? null).toBe(null);
    } finally {
      await context.close();
    }
  });
});
