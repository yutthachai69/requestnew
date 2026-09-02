/**
 * Edge cases around the email-link (token) approval path, approver lifecycle,
 * and master data changed while a request is still open.
 *
 * These complement tests/e2e/requestonline.spec.js, which covers the happy path
 * through the dashboard. Everything that changes data is gated behind
 * RUN_MUTATION_TESTS=true and cleans up after itself.
 *
 * Test isolation note: middleware rate-limits by *session identity*
 * (`user:<id>`, 100 req/min), not by IP, so spoofing x-forwarded-for does not
 * isolate tests. Each test therefore submits from its own throwaway requester
 * account, cloned from the seed requester, so one test cannot exhaust another
 * test's budget.
 */
import { test, expect } from '@playwright/test';
import { TEMP_PASSWORD, passwordFor, retireTestUser, withThrowawayAccounts } from './rate-limit-isolation.js';

const password = process.env.TEST_PASSWORD;
const accounts = {
  // Seed account cloned per test; tests log in as `accounts.testRequester`.
  requester: process.env.TEST_REQUESTER ?? process.env.TEST_USER ?? 'req_cane',
  testRequester: process.env.TEST_REQUESTER ?? process.env.TEST_USER ?? 'req_cane',
  head: process.env.TEST_HEAD ?? 'head_cane',
  otherDeptHead: process.env.TEST_OTHER_DEPT_HEAD ?? 'head_store',
  admin: process.env.TEST_ADMIN ?? 'admin',
};

// Each test gets its own Admin account; see rate-limit-isolation.js.
withThrowawayAccounts(test, accounts, password);

const EXPIRED_LINK_TEXT = /ลิงก์นี้หมดอายุ|คำร้องถูกดำเนินการไปแล้ว/;
const APPROVE_BUTTON = /อนุมัติ \(Approve\)/;
const REJECT_BUTTON = /ไม่อนุมัติ \(Reject\)/;

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

async function requestDetail(page, id) {
  const response = await page.request.get(`/api/requests/${id}`);
  expect(response.ok(), `GET /api/requests/${id} → ${response.status()}`).toBeTruthy();
  return response.json();
}

async function requestStatus(page, id) {
  return (await requestDetail(page, id)).request.status;
}

async function createRequestThroughUI(page, problemDetail) {
  await gotoWithRetry(page, '/request/new');
  await page.waitForTimeout(700);

  const categoriesResponse = await page.request.get('/api/master/categories');
  expect(categoriesResponse.ok(), `GET categories → ${categoriesResponse.status()}`).toBeTruthy();
  const categories = await categoriesResponse.json();
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
  expect(selectedCategory, 'no category with correction types is visible to this requester').toBeTruthy();

  await page.locator('select').nth(0).selectOption(selectedCategory);
  await page.waitForTimeout(500);
  await page
    .locator('textarea')
    .first()
    .fill(problemDetail ?? `EDGE TEST ${Date.now()} — ทดสอบลิงก์อนุมัติ`);
  await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();

  const types = page.locator('input[type="checkbox"]');
  if (await types.count()) await types.first().check();
  for (const field of await page.locator('input[required]:visible, textarea[required]:visible').all()) {
    if ((await field.getAttribute('type')) === 'checkbox') continue;
    if (!(await field.inputValue().catch(() => '')).trim()) await field.fill('EDGE TEST DETAIL');
  }
  await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
  await page.getByRole('button', { name: /ส่งคำร้อง/ }).click();
  await page.waitForURL(/\/request\/\d+/, { timeout: 30_000 });
  return Number(new URL(page.url()).pathname.split('/').pop());
}

/** Read the live approval token for a request from the approver's own task list. */
async function approvalTokenFor(approverPage, requestId) {
  const response = await approverPage.request.get('/api/pending-tasks');
  expect(response.ok(), `GET /api/pending-tasks → ${response.status()}`).toBeTruthy();
  const { requests } = await response.json();
  const task = (requests ?? []).find((item) => item.id === requestId);
  expect(task, `request ${requestId} is not in the approver's pending tasks`).toBeTruthy();
  expect(task.approvalToken, `request ${requestId} has no approval token`).toBeTruthy();
  return task.approvalToken;
}

/** Open /approve/<token> and report whether it offers a live approval form. */
async function openApprovalLink(page, token) {
  await gotoWithRetry(page, `/approve/${encodeURIComponent(token)}`);
  const button = page.getByRole('button', { name: APPROVE_BUTTON });
  const expired = page.getByText(EXPIRED_LINK_TEXT).first();
  // The page is server-rendered: exactly one of the two states is present.
  await expect
    .poll(async () => ((await button.count()) > 0 ? 'live' : (await expired.count()) > 0 ? 'expired' : 'unknown'), {
      timeout: 20_000,
    })
    .not.toBe('unknown');
  return (await button.count()) > 0 ? 'live' : 'expired';
}

/**
 * Click Approve/Reject on /approve/<token>. Server-action failures surface as a
 * window.alert, so the alert text is captured and returned instead of the
 * success banner.
 */
async function actOnApprovalLink(page, token, intent = 'APPROVED') {
  const alerts = [];
  const onDialog = async (dialog) => {
    alerts.push(dialog.message());
    await dialog.dismiss().catch(() => {});
  };
  page.on('dialog', onDialog);
  try {
    const state = await openApprovalLink(page, token);
    if (state === 'expired') return { ok: false, alert: null, expired: true };

    const button = page.getByRole('button', { name: intent === 'APPROVED' ? APPROVE_BUTTON : REJECT_BUTTON });
    await button.click();
    // Either a success banner replaces the buttons, or an alert fires.
    await expect
      .poll(async () => alerts.length > 0 || (await button.count()) === 0, { timeout: 30_000 })
      .toBe(true);
    return { ok: alerts.length === 0, alert: alerts[0] ?? null, expired: false };
  } finally {
    page.off('dialog', onDialog);
  }
}

/** Per-test fixture: throwaway requester + admin, with guaranteed cleanup. */
function edgeCaseFixture(browser) {
  const contexts = [];
  let clientNumber = 10;

  const accountPage = async (username, loginPassword = passwordFor(username, password)) => {
    clientNumber += 1;
    const context = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': `10.250.20.${clientNumber}` },
    });
    contexts.push(context);
    await localOnly(context);
    const page = await context.newPage();
    await login(page, username, loginPassword);
    return page;
  };

  const closeAll = async () => {
    for (const context of contexts) await context.close().catch(() => {});
  };

  return { accountPage, closeAll };
}

test.describe('email-link approval token lifecycle', () => {
  test('unknown and forged tokens never expose a request', async ({ browser }) => {
    test.skip(!password, 'Set TEST_PASSWORD to run authenticated tests');
    const { accountPage, closeAll } = edgeCaseFixture(browser);

    try {
      const anonymousContext = await browser.newContext();
      await localOnly(anonymousContext);
      const anonymous = await anonymousContext.newPage();
      // An approval link must not be reachable without a session.
      await gotoWithRetry(anonymous, '/approve/00000000-0000-4000-8000-000000000000');
      await expect(anonymous).toHaveURL(/\/login/);
      await anonymousContext.close();

      const head = await accountPage(accounts.head);
      for (const token of [
        '00000000-0000-4000-8000-000000000000',
        'not-a-uuid',
        "' OR 1=1 --",
        '../../api/requests/1',
        '%00',
      ]) {
        expect(await openApprovalLink(head, token), token).toBe('expired');
        await expect(head.getByRole('button', { name: APPROVE_BUTTON }), token).toHaveCount(0);
      }
    } finally {
      await closeAll();
    }
  });

  test('a token is single-use: it rotates once the step is approved', async ({ browser }) => {
    test.setTimeout(150_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const { accountPage, closeAll } = edgeCaseFixture(browser);
    let admin;
    let requestId;

    try {
      admin = await accountPage(accounts.admin);
      const requester = await accountPage(accounts.testRequester, TEMP_PASSWORD);

      requestId = await createRequestThroughUI(requester);
      expect(await requestStatus(requester, requestId)).toBe('PENDING');

      const head = await accountPage(accounts.head);
      const token = await approvalTokenFor(head, requestId);

      const firstUse = await actOnApprovalLink(head, token, 'APPROVED');
      expect(firstUse.ok, `first use failed: ${firstUse.alert}`).toBe(true);
      await expect.poll(async () => requestStatus(admin, requestId)).not.toBe('PENDING');
      const statusAfterFirstUse = await requestStatus(admin, requestId);

      // Re-opening the same emailed link must not advance the request again.
      expect(await openApprovalLink(head, token), 'stale token still live').toBe('expired');
      expect(await requestStatus(admin, requestId)).toBe(statusAfterFirstUse);
    } finally {
      if (requestId && admin) {
        const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
        expect(cleanup.ok(), `cleanup request ${requestId}`).toBeTruthy();
      }
      await closeAll();
    }
  });

  test('a token from before a reject/resubmit cycle cannot approve the new submission', async ({ browser }) => {
    test.setTimeout(150_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const { accountPage, closeAll } = edgeCaseFixture(browser);
    let admin;
    let requestId;

    try {
      admin = await accountPage(accounts.admin);
      const requester = await accountPage(accounts.testRequester, TEMP_PASSWORD);
      requestId = await createRequestThroughUI(requester);

      const head = await accountPage(accounts.head);
      const staleToken = await approvalTokenFor(head, requestId);

      const reject = await head.request.post(`/api/requests/${requestId}/action`, {
        data: { actionName: 'REJECT', comment: 'EDGE TEST: ส่งกลับแก้ไข' },
      });
      expect(reject.ok(), `reject → ${reject.status()}`).toBeTruthy();
      await expect.poll(async () => requestStatus(admin, requestId)).toBe('REVISION');

      // A rejected request has no live link at all.
      expect(await openApprovalLink(head, staleToken), 'link live during REVISION').toBe('expired');

      await gotoWithRetry(requester, `/request/${requestId}/edit`);
      const editField = requester.locator('textarea').first();
      await editField.fill(`${await editField.inputValue()} — แก้ไขแล้ว`);
      await requester.locator('form button[type="submit"]').click();
      await expect.poll(async () => requestStatus(admin, requestId)).toBe('PENDING');

      // Resubmission issues a fresh token; the emailed one must stay dead.
      const freshToken = await approvalTokenFor(head, requestId);
      expect(freshToken).not.toBe(staleToken);
      expect(await openApprovalLink(head, staleToken), 'stale token became live again').toBe('expired');
      expect(await requestStatus(admin, requestId)).toBe('PENDING');
    } finally {
      if (requestId && admin) {
        const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
        expect(cleanup.ok(), `cleanup request ${requestId}`).toBeTruthy();
      }
      await closeAll();
    }
  });

  test('a valid token does not grant approval rights to the wrong user', async ({ browser }) => {
    test.setTimeout(180_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const { accountPage, closeAll } = edgeCaseFixture(browser);
    let admin;
    let requestId;

    try {
      admin = await accountPage(accounts.admin);
      const requester = await accountPage(accounts.testRequester, TEMP_PASSWORD);
      requestId = await createRequestThroughUI(requester);

      const head = await accountPage(accounts.head);
      const token = await approvalTokenFor(head, requestId);

      // A forwarded link must not let the requester approve their own request.
      const selfApproval = await actOnApprovalLink(requester, token, 'APPROVED');
      expect(selfApproval.ok, 'requester approved their own request through the email link').toBe(false);
      expect(await requestStatus(admin, requestId)).toBe('PENDING');

      // Nor a head of another department, who is a valid approver elsewhere.
      const otherHead = await accountPage(accounts.otherDeptHead);
      const crossDepartment = await actOnApprovalLink(otherHead, token, 'APPROVED');
      expect(crossDepartment.ok, 'cross-department head approved through the email link').toBe(false);
      expect(await requestStatus(admin, requestId)).toBe('PENDING');

      // The rightful approver still works afterwards.
      const rightful = await actOnApprovalLink(head, token, 'APPROVED');
      expect(rightful.ok, `rightful approver blocked: ${rightful.alert}`).toBe(true);
      await expect.poll(async () => requestStatus(admin, requestId)).not.toBe('PENDING');
    } finally {
      if (requestId && admin) {
        const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
        expect(cleanup.ok(), `cleanup request ${requestId}`).toBeTruthy();
      }
      await closeAll();
    }
  });

  test('an approver disabled mid-flow can no longer act on the emailed link', async ({ browser }) => {
    test.setTimeout(180_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const { accountPage, closeAll } = edgeCaseFixture(browser);
    let admin;
    let standInId = null;
    let requestId;

    try {
      admin = await accountPage(accounts.admin);
      const requester = await accountPage(accounts.testRequester, TEMP_PASSWORD);
      requestId = await createRequestThroughUI(requester);

      const head = await accountPage(accounts.head);
      const token = await approvalTokenFor(head, requestId);

      // Clone the head's role and department onto a throwaway account so the
      // shared seed approver is never disabled.
      const users = await (await admin.request.get('/api/admin/users')).json();
      const headProfile = users.find((u) => u.Username === accounts.head);
      expect(headProfile, `seed approver ${accounts.head} not found`).toBeTruthy();

      const suffix = Date.now();
      const createResponse = await admin.request.post('/api/admin/users', {
        data: {
          username: `e2e_appr_${suffix}`,
          password: TEMP_PASSWORD,
          fullName: `E2E Edge Approver ${suffix}`,
          email: `e2e.appr.${suffix}@example.com`,
          roleId: headProfile.RoleID,
          departmentId: headProfile.DepartmentID,
          isActive: true,
        },
      });
      expect(createResponse.status(), await createResponse.text()).toBe(200);
      standInId = (await createResponse.json()).UserID;

      const standIn = await accountPage(`e2e_appr_${suffix}`, TEMP_PASSWORD);
      // While active the stand-in sees a live approval form.
      expect(await openApprovalLink(standIn, token)).toBe('live');

      const disable = await admin.request.put(`/api/admin/users/${standInId}`, { data: { isActive: false } });
      expect(disable.status()).toBe(200);

      // The API is DB-checked, so the disabled account is rejected immediately.
      expect((await standIn.request.post(`/api/requests/${requestId}/action`, {
        data: { actionName: 'APPROVE' },
      })).status(), 'disabled user could call the action API').toBe(401);
      expect((await standIn.request.get('/api/me')).status()).toBe(401);

      // The email-link server action must refuse the disabled account too, and
      // must not advance the request. (The page itself may still render: the
      // JWT session is not revalidated against the DB on page load.)
      const disabledAttempt = await actOnApprovalLink(standIn, token, 'APPROVED');
      expect(disabledAttempt.ok, 'disabled approver approved through the email link').toBe(false);
      expect(await requestStatus(admin, requestId)).toBe('PENDING');

      // The real approver can still finish the step.
      const rightful = await actOnApprovalLink(head, token, 'APPROVED');
      expect(rightful.ok, `rightful approver blocked: ${rightful.alert}`).toBe(true);
      await expect.poll(async () => requestStatus(admin, requestId)).not.toBe('PENDING');
    } finally {
      if (standInId && admin) {
        await retireTestUser(admin, standInId);
      }
      if (requestId && admin) {
        const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
        expect(cleanup.ok(), `cleanup request ${requestId}`).toBeTruthy();
      }
      await closeAll();
    }
  });
});

test.describe('master data changed while a request is open', () => {
  test('deleting a user who has already acted is refused, not a 500', async ({ browser }) => {
    test.setTimeout(150_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const { accountPage, closeAll } = edgeCaseFixture(browser);
    let admin;
    let userId = null;
    let requestId;

    try {
      admin = await accountPage(accounts.admin);

      // Clone the seed requester so the throwaway account can raise a request.
      const users = await (await admin.request.get('/api/admin/users')).json();
      const seed = users.find((u) => u.Username === accounts.requester);
      expect(seed, `seed requester ${accounts.requester} not found`).toBeTruthy();

      const suffix = Date.now();
      const created = await admin.request.post('/api/admin/users', {
        data: {
          username: `e2e_del_${suffix}`,
          password: TEMP_PASSWORD,
          fullName: `E2E Delete Target ${suffix}`,
          email: `e2e.del.${suffix}@example.com`,
          roleId: seed.RoleID,
          departmentId: seed.DepartmentID,
          categoryIds: seed.CategoryIDs,
          isActive: true,
        },
      });
      expect(created.status(), await created.text()).toBe(200);
      userId = (await created.json()).UserID;

      // A brand-new account with no history can still be deleted outright.
      // Prove that first, so the 409 below is about history, not about users
      // being undeletable in general.
      const throwaway = await admin.request.post('/api/admin/users', {
        data: {
          username: `e2e_del_unused_${suffix}`,
          password: TEMP_PASSWORD,
          fullName: `E2E Unused ${suffix}`,
          email: `e2e.del.unused.${suffix}@example.com`,
          roleId: seed.RoleID,
          departmentId: seed.DepartmentID,
          isActive: true,
        },
      });
      expect(throwaway.status()).toBe(200);
      expect(
        (await admin.request.delete(`/api/admin/users/${(await throwaway.json()).UserID}`)).status()
      ).toBe(200);

      // Now give the target a history by raising a request as that user.
      const requester = await accountPage(`e2e_del_${suffix}`, TEMP_PASSWORD);
      requestId = await createRequestThroughUI(requester);

      // Deleting must be refused with an actionable message — the FK violation
      // used to escape as a 500 with no explanation.
      const deletion = await admin.request.delete(`/api/admin/users/${userId}`);
      expect(deletion.status(), `DELETE user → ${deletion.status()}`).toBe(409);
      expect((await deletion.json()).message ?? '').toContain('ปิดใช้งาน');

      // The account and its request are untouched by the failed delete.
      const stillThere = (await (await admin.request.get('/api/admin/users')).json())
        .find((u) => u.UserID === userId);
      expect(stillThere?.IsActive).toBe(true);
      expect(await requestStatus(admin, requestId)).toBe('PENDING');

      // Deactivating is the supported alternative and must work.
      const disabled = await admin.request.put(`/api/admin/users/${userId}`, { data: { isActive: false } });
      expect(disabled.status()).toBe(200);
      const afterDisable = (await (await admin.request.get('/api/admin/users')).json())
        .find((u) => u.UserID === userId);
      expect(afterDisable?.IsActive).toBe(false);
    } finally {
      if (requestId && admin) {
        const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
        expect(cleanup.ok(), `cleanup request ${requestId}`).toBeTruthy();
      }
      if (userId && admin) await retireTestUser(admin, userId);
      await closeAll();
    }
  });

  test('deleting the category of an open request never corrupts the request', async ({ browser }) => {
    test.setTimeout(150_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const { accountPage, closeAll } = edgeCaseFixture(browser);
    let admin;
    let requestId;

    try {
      admin = await accountPage(accounts.admin);
      const requester = await accountPage(accounts.testRequester, TEMP_PASSWORD);
      requestId = await createRequestThroughUI(requester);

      const before = (await requestDetail(requester, requestId)).request;
      const categoryId = before.categoryId ?? before.category?.id;
      expect(categoryId).toBeTruthy();

      // A category still referenced by an open request must be refused, with a
      // message the admin can act on — not a 500 and not a silent cascade.
      const deletion = await admin.request.delete(`/api/admin/categories/${categoryId}`);
      expect(deletion.status(), `DELETE category → ${deletion.status()}`).toBe(409);
      expect((await deletion.json()).message ?? '').not.toBe('');

      const after = (await requestDetail(requester, requestId)).request;
      expect(after.status).toBe(before.status);
      expect(after.workOrderNo).toBe(before.workOrderNo);

      // The approver's queue and detail page must still render.
      const head = await accountPage(accounts.head);
      expect((await head.request.get('/api/pending-tasks')).status()).toBe(200);
      const detailPage = await gotoWithRetry(head, `/request/${requestId}`);
      expect(detailPage?.status()).toBeLessThan(500);
    } finally {
      if (requestId && admin) {
        const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
        expect(cleanup.ok(), `cleanup request ${requestId}`).toBeTruthy();
      }
      await closeAll();
    }
  });
});

test.describe('requests that nobody can approve', () => {
  test('a request with no eligible approver alerts an admin instead of stalling silently', async ({ browser }) => {
    test.setTimeout(180_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const { accountPage, closeAll } = edgeCaseFixture(browser);
    let admin;
    let departmentId = null;
    let orphanUserId = null;
    let requestId;

    try {
      admin = await accountPage(accounts.admin);

      // A department with no members at all: step 1 filters approvers by
      // department, so nothing can pick this request up.
      const suffix = Date.now();
      const departmentCreate = await admin.request.post('/api/admin/departments', {
        data: { departmentName: `E2E Orphan Dept ${suffix}` },
      });
      expect(departmentCreate.status(), await departmentCreate.text()).toBe(200);
      departmentId = (await departmentCreate.json()).DepartmentID;

      const seed = (await (await admin.request.get('/api/admin/users')).json())
        .find((u) => u.Username === accounts.requester);
      expect(seed, `seed requester ${accounts.requester} not found`).toBeTruthy();

      const orphanCreate = await admin.request.post('/api/admin/users', {
        data: {
          username: `e2e_orphan_${suffix}`,
          password: TEMP_PASSWORD,
          fullName: `E2E Orphan Requester ${suffix}`,
          email: `e2e.orphan.${suffix}@example.com`,
          roleId: seed.RoleID,
          departmentId,
          categoryIds: seed.CategoryIDs,
          isActive: true,
        },
      });
      expect(orphanCreate.status(), await orphanCreate.text()).toBe(200);
      orphanUserId = (await orphanCreate.json()).UserID;

      const requester = await accountPage(`e2e_orphan_${suffix}`, TEMP_PASSWORD);
      requestId = await createRequestThroughUI(requester);

      // The submission itself must still succeed — the requester is not punished
      // for a workflow gap.
      expect(await requestStatus(admin, requestId)).toBe('PENDING');

      // …but an admin must be told, otherwise the request sits unseen forever.
      // Poll on a fixed 2s cadence: the default escalating interval fires ~35
      // requests in 30s, which eats into this account's 100-req/min rate-limit
      // budget and makes the check fail for the wrong reason.
      let alertMessage = null;
      await expect
        .poll(
          async () => {
            const response = await admin.request.get('/api/notifications');
            if (response.status() !== 200) return null;
            const { notifications } = await response.json();
            const hit = (notifications ?? []).find((item) => item.RequestID === requestId);
            alertMessage = hit?.Message ?? null;
            return alertMessage;
          },
          {
            timeout: 30_000,
            intervals: [1000, 2000, 2000, 2000, 2000, 2000],
            message: 'no admin alert was raised for the stalled request',
          }
        )
        .not.toBe(null);

      expect(alertMessage, `alert text: ${alertMessage}`).toContain('ค้างในระบบ');
    } finally {
      if (requestId && admin) {
        const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
        expect(cleanup.ok(), `cleanup request ${requestId}`).toBeTruthy();
      }
      if (orphanUserId && admin) {
        // Move the account off the throwaway department first: a user that has
        // raised a request cannot be deleted, and while it still points here the
        // department cannot be deleted either — which would leak one row per run.
        const seedDepartmentId = (await (await admin.request.get('/api/admin/users')).json())
          .find((u) => u.Username === accounts.requester)?.DepartmentID;
        if (seedDepartmentId) {
          await admin.request.put(`/api/admin/users/${orphanUserId}`, {
            data: { departmentId: seedDepartmentId },
          });
        }
        await retireTestUser(admin, orphanUserId);
      }
      if (departmentId && admin) {
        const removed = await admin.request.delete(`/api/admin/departments/${departmentId}`);
        expect([200, 404], `leftover department ${departmentId}: ${removed.status()}`).toContain(
          removed.status()
        );
      }
      await closeAll();
    }
  });
});

test.describe('report date ranges', () => {
  test('a same-day filter includes a request created today, and impossible dates are refused', async ({ browser }) => {
    test.setTimeout(150_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const { accountPage, closeAll } = edgeCaseFixture(browser);
    let admin;
    let requestId;

    try {
      admin = await accountPage(accounts.admin);
      const requester = await accountPage(accounts.testRequester, TEMP_PASSWORD);
      requestId = await createRequestThroughUI(requester);

      // Local calendar day, exactly what the date picker submits.
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

      // A single-day range must cover the whole local day — the request just
      // created has to be inside it.
      const listed = await requester.request.get(
        `/api/requests?startDate=${today}&endDate=${today}&limit=100`
      );
      expect(listed.status()).toBe(200);
      const { requests } = await listed.json();
      expect(
        (requests ?? []).some((item) => item.id === requestId),
        `request ${requestId} missing from the ${today}–${today} range`
      ).toBe(true);

      // The same range must not error out on the aggregate endpoints.
      for (const path of [
        `/api/dashboard/report-data?startDate=${today}&endDate=${today}`,
        `/api/dashboard/category-stats?startDate=${today}&endDate=${today}`,
      ]) {
        const response = await admin.request.get(path);
        expect(response.status(), path).toBe(200);
      }

      // A date that does not exist must be refused, not silently rolled over to
      // another month (`new Date('2026-02-31')` is 3 March).
      for (const bad of ['2026-02-31', '2026-13-01', 'not-a-date', '2026-00-10']) {
        for (const endpoint of ['/api/dashboard/report-data', '/api/dashboard/category-stats']) {
          const response = await admin.request.get(`${endpoint}?startDate=${bad}&endDate=${today}`);
          expect(response.status(), `${endpoint} startDate=${bad}`).toBe(400);
        }
      }
    } finally {
      if (requestId && admin) {
        const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
        expect(cleanup.ok(), `cleanup request ${requestId}`).toBeTruthy();
      }
      await closeAll();
    }
  });
});

test.describe('PDF layout with long Thai text', () => {
  test('long problem detail flows onto a continuation page instead of off the form', async ({ browser }) => {
    test.setTimeout(180_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const { accountPage, closeAll } = edgeCaseFixture(browser);
    const { PDFDocument } = await import('pdf-lib');
    let admin;
    let shortId;
    let longId;

    try {
      admin = await accountPage(accounts.admin);
      const requester = await accountPage(accounts.testRequester, TEMP_PASSWORD);

      // ── ปกติ: ต้องอยู่ในหน้าเดียวเหมือนแบบฟอร์มจริง ──
      shortId = await createRequestThroughUI(requester, 'EDGE TEST ปัญหาสั้น ๆ');
      const shortPdf = await requester.request.get(`/api/requests/${shortId}/pdf`);
      expect(shortPdf.status()).toBe(200);
      expect(shortPdf.headers()['content-type']).toContain('application/pdf');
      const shortDoc = await PDFDocument.load(await shortPdf.body());
      expect(shortDoc.getPageCount(), 'คำร้องปกติต้องได้ PDF หน้าเดียว').toBe(1);

      // ── ยาวมาก: เดิมข้อความจะถูกวาดทะลุกรอบและส่วนเกิน 7 บรรทัดหายเงียบ ──
      // ฟอร์มหน้าเว็บจำกัดความยาวไว้ แต่คอลัมน์เป็น NVarChar(Max) และ API แก้ไข
      // ไม่จำกัดความยาว (ข้อมูลที่ย้ายมาจากระบบเดิมก็ยาวได้) จึงตั้งค่าผ่าน API
      // ย่อหน้าเดียวไม่มีช่องว่างเลย — เคสที่ตัดตามคำไม่ได้ ต้องตัดทีละอักขระ
      longId = await createRequestThroughUI(requester, 'EDGE TEST ยาวมาก');
      const longDetail =
        'EDGE TEST ' +
        'ระบบขัดข้องไม่สามารถบันทึกข้อมูลได้กรุณาตรวจสอบโดยด่วนที่สุด'.repeat(40);
      const updated = await requester.request.put(`/api/requests/${longId}`, {
        data: { problemDetail: longDetail },
      });
      expect(updated.status(), await updated.text()).toBe(200);

      const stored = (await requestDetail(requester, longId)).request.problemDetail;
      expect(stored.length, 'ข้อความยาวต้องถูกบันทึกครบ').toBeGreaterThan(1000);

      const longPdf = await requester.request.get(`/api/requests/${longId}/pdf`);
      expect(longPdf.status()).toBe(200);
      const longDoc = await PDFDocument.load(await longPdf.body());

      // ส่วนที่ล้นต้องไปต่อหน้าถัดไป ไม่ใช่หายไปหรือทะลุขอบกระดาษ
      expect(
        longDoc.getPageCount(),
        `รายละเอียดยาว ${stored.length} ตัวอักษร ต้องมีหน้าต่อ แต่ได้ ${longDoc.getPageCount()} หน้า`
      ).toBeGreaterThan(1);

      // ทุกหน้าต้องเป็น A4 ขนาดเท่ากัน
      for (const [index, page] of longDoc.getPages().entries()) {
        const { width, height } = page.getSize();
        expect(Math.round(width), `หน้า ${index + 1} กว้างผิด`).toBe(595);
        expect(Math.round(height), `หน้า ${index + 1} สูงผิด`).toBe(842);
      }
    } finally {
      for (const id of [shortId, longId]) {
        if (id && admin) {
          const cleanup = await admin.request.delete(`/api/requests/${id}`);
          expect(cleanup.ok(), `cleanup request ${id}`).toBeTruthy();
        }
      }
      await closeAll();
    }
  });
});

test.describe('health endpoint', () => {
  test('is reachable without a session, reports the database, and is not rate limited', async ({ browser }) => {
    test.setTimeout(120_000);

    const context = await browser.newContext();
    await localOnly(context);
    const page = await context.newPage();

    try {
      // ตัวเฝ้าภายนอกล็อกอินไม่ได้ — ต้องเรียกได้แบบไม่มี session
      const response = await page.request.get('/api/health');
      expect(response.status(), 'health ต้องตอบ 200 เมื่อระบบปกติ').toBe(200);

      const report = await response.json();
      expect(report.status).toBe('ok');
      expect(report.checks.database.ok, 'ต้องตรวจฐานข้อมูลจริง').toBe(true);
      expect(typeof report.checks.database.latencyMs).toBe('number');
      expect(Date.parse(report.timestamp)).not.toBeNaN();

      // ต้องไม่แคช ไม่งั้นตัวเฝ้าจะได้ผลเก่าตอนระบบล่มไปแล้ว
      expect(response.headers()['cache-control'] ?? '').toContain('no-store');

      // ต้องไม่หลุดรายละเอียดระบบ เพราะเปิดสาธารณะ
      const body = JSON.stringify(report);
      for (const secret of ['1433', 'requestapp', 'MSSQL', 'password']) {
        expect(body, `health เปิดเผย "${secret}"`).not.toContain(secret);
      }

      // ยิงถี่แบบตัวเฝ้าจริงต้องไม่โดน 429 (middleware ไม่ครอบ path นี้)
      const statuses = await Promise.all(
        Array.from({ length: 40 }, () => page.request.get('/api/health').then((r) => r.status()))
      );
      expect(
        statuses.filter((s) => s === 429).length,
        `โดน rate limit ${statuses.filter((s) => s === 429).length}/40 ครั้ง`
      ).toBe(0);
      expect(new Set(statuses)).toEqual(new Set([200]));
    } finally {
      await context.close();
    }
  });
});
