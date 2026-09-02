import { test, expect } from '@playwright/test';
import { TEMP_PASSWORD, passwordFor, retireTestUser, withThrowawayAccounts } from './rate-limit-isolation.js';

const password = process.env.TEST_PASSWORD;
const requesterUser = process.env.TEST_REQUESTER ?? process.env.TEST_USER ?? 'req_cane';
const accounts = {
  // `requester` is the seed account each test's throwaway requester is cloned
  // from; tests log in as `accounts.testRequester` (set per test by the fixture).
  requester: requesterUser,
  testRequester: requesterUser,
  head: process.env.TEST_HEAD ?? 'head_cane',
  accountant: process.env.TEST_ACCOUNTANT ?? 'accountant',
  final: process.env.TEST_FINAL ?? 'final',
  it: process.env.TEST_IT ?? 'it_operator',
  itReviewer: process.env.TEST_IT_REVIEWER ?? 'it_reviewer',
  admin: process.env.TEST_ADMIN ?? 'admin',
};

// Give every test its own Admin account so one test's admin API traffic cannot
// exhaust the shared seed admin's per-user rate-limit budget for the next one.
withThrowawayAccounts(test, accounts, password);

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

  // The fallback keeps the test stable when the client-side login redirect races
  // Next.js dev Fast Refresh; it only creates a local auth session.
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
    expect(authResponse.ok()).toBeTruthy();
    await gotoWithRetry(page, '/dashboard');
  }
  await expect(page).not.toHaveURL(/\/login/);
}

async function requestDetail(page, id) {
  const response = await page.request.get(`/api/requests/${id}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function createRequestThroughUI(page, withAttachment = false) {
  await gotoWithRetry(page, '/request/new');
  await page.waitForTimeout(700);

  const categoriesResponse = await page.request.get('/api/master/categories');
  expect(categoriesResponse.ok()).toBeTruthy();
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
  expect(selectedCategory).toBeTruthy();

  await page.locator('select').nth(0).selectOption(selectedCategory);
  await page.waitForTimeout(500);
  await page.locator('textarea').first().fill(`SMOKE TEST ${Date.now()} — ทดสอบ workflow`);
  await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();

  const types = page.locator('input[type="checkbox"]');
  if (await types.count()) await types.first().check();
  if (withAttachment) {
    await page.locator('input[type="file"]').setInputFiles({
      name: 'smoke.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    });
  }
  for (const field of await page.locator('input[required]:visible, textarea[required]:visible').all()) {
    if ((await field.getAttribute('type')) === 'checkbox') continue;
    if (!(await field.inputValue().catch(() => '')).trim()) await field.fill('SMOKE TEST DETAIL');
  }
  await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
  await page.getByRole('button', { name: /ส่งคำร้อง/ }).click();
  await page.waitForURL(/\/request\/\d+/, { timeout: 20_000 });
  return Number(new URL(page.url()).pathname.split('/').pop());
}

async function clickActionAndConfirm(page, actionDisplayName, comment = '') {
  const buttons = page.locator('button');
  const index = await buttons.evaluateAll((items, needle) =>
    items.findIndex((item) => (item.textContent ?? '').includes(needle)), actionDisplayName);
  expect(index).toBeGreaterThanOrEqual(0);
  console.log(`ACTION OPEN ${actionDisplayName}`);
  await buttons.nth(index).click({ timeout: 10_000 });
  if (comment) {
    const commentField = page.locator('textarea:visible').last();
    if (await commentField.count()) await commentField.fill(comment);
  }
  console.log(`ACTION CONFIRM ${actionDisplayName}`);
  const actionResponse = page.waitForResponse(
    (response) => response.url().includes('/api/requests/') && response.url().includes('/action') && response.request().method() === 'POST',
    { timeout: 20_000 },
  );
  await page.getByRole('button', { name: 'ยืนยัน', exact: true }).last().click({ timeout: 10_000, noWaitAfter: true });
  console.log(`ACTION CLICKED ${actionDisplayName}`);
  const response = await actionResponse;
  const body = await response.json().catch(() => ({}));
  expect(response.ok(), `${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
}

test.describe('RequestOnline safe smoke tests', () => {
  test('unauthenticated pages and APIs are protected', async ({ page }) => {
    await localOnly(page.context());
    await gotoWithRetry(page, '/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await expect((await page.request.get('/api/requests')).status()).toBe(401);
  });

  test('protected APIs reject missing auth and malformed inputs', async ({ page }) => {
    await localOnly(page.context());

    const unauthenticatedChecks = [
      ['/api/me', 401],
      ['/api/app/shell', 401],
      ['/api/auth/my-stats', 401],
      ['/api/requests', 401],
      ['/api/requests/1', 401],
      ['/api/requests/1/pdf', 401],
      ['/api/pending-tasks', 401],
      ['/api/dashboard/overview', 401],
      ['/api/dashboard/category-stats', 401],
      ['/api/dashboard/report-data', 401],
      ['/api/dashboard/statistics', 401],
      ['/api/category/1/statistics', 401],
      ['/api/master/categories', 401],
      ['/api/master/departments', 401],
      ['/api/statuses', 401],
      ['/api/admin/users', 401],
      ['/api/files/missing.pdf', 401],
    ];
    for (const [path, expectedStatus] of unauthenticatedChecks) {
      expect((await page.request.get(path)).status(), path).toBe(expectedStatus);
    }
    const notifications = await page.request.get('/api/notifications');
    expect(notifications.status()).toBe(200);
    expect(await notifications.json()).toMatchObject({ notifications: [], unreadCount: 0 });

    test.skip(!password, 'Set TEST_PASSWORD to run authenticated smoke tests');
    await login(page, process.env.TEST_NON_ADMIN ?? 'req_cane');
    expect((await page.request.get('/api/requests/0')).status()).toBe(400);
    expect((await page.request.get('/api/requests/not-a-number')).status()).toBe(400);
    expect((await page.request.put('/api/requests/0', { data: {} })).status()).toBe(400);
    expect((await page.request.post('/api/requests/999999/action', {
      data: { actionName: 'NOT_A_REAL_ACTION' },
    })).status()).toBe(400);
    expect((await page.request.post('/api/admin/departments', {
      data: { departmentName: `Should Not Be Created ${Date.now()}` },
    })).status()).toBe(403);
  });

  test('authenticated core pages and request PDF load without server errors', async ({ page }) => {
    test.skip(!password, 'Set TEST_PASSWORD to run authenticated smoke tests');
    await localOnly(page.context());
    // Read-only, and it needs a requester that already owns requests — a fresh
    // throwaway account has none, so this one test uses the seed requester.
    await login(page, accounts.requester);

    for (const path of ['/dashboard', '/request', '/request/new', '/pending-tasks', '/notifications', '/profile', '/report']) {
      const response = await gotoWithRetry(page, path);
      expect(response?.status(), path).toBeLessThan(500);
    }

    const listResponse = await page.request.get('/api/requests?limit=1');
    expect(listResponse.status()).toBeLessThan(500);
    const list = await listResponse.json();
    const id = list?.requests?.[0]?.id;
    test.skip(!id, 'No existing request available for detail/PDF smoke test');
    const detailResponse = await gotoWithRetry(page, `/request/${id}`);
    expect(detailResponse?.status()).toBeLessThan(500);
    const pdfResponse = await page.request.get(`/api/requests/${id}/pdf`);
    expect(pdfResponse.status()).toBeLessThan(500);
    expect(pdfResponse.headers()['content-type']).toContain('application/pdf');
  });

  test('admin pages are available only to an admin account', async ({ page }) => {
    test.skip(!password, 'Set TEST_PASSWORD to run authenticated smoke tests');
    await localOnly(page.context());
    await login(page, accounts.testRequester);
    const permission = await page.request.get('/api/admin/users');
    expect([200, 403]).toContain(permission.status());
    if (permission.status() !== 200) return;

    for (const path of ['/admin', '/admin/users', '/admin/roles', '/admin/categories', '/admin/departments', '/admin/locations', '/admin/workflow-transitions', '/admin/correction-types', '/admin/correction-reasons', '/admin/doc-config', '/admin/email-templates', '/admin/statuses', '/admin/audit-logs', '/admin/audit-report']) {
      const response = await gotoWithRetry(page, path);
      expect(response?.status(), path).toBeLessThan(500);
    }
  });

  test('read-only dashboard and task APIs tolerate concurrent requests', async ({ page }) => {
    test.skip(!password, 'Set TEST_PASSWORD to run authenticated smoke tests');
    await localOnly(page.context());
    await login(page, accounts.testRequester);

    const endpoints = [
      '/api/requests?limit=10',
      '/api/pending-tasks',
      '/api/pending-tasks/count',
      '/api/dashboard/overview',
      '/api/dashboard/statistics',
      '/api/dashboard/category-stats',
      '/api/notifications?page=1&limit=10',
      '/api/dashboard/report-data',
    ];
    const responses = [];
    for (let round = 0; round < 4; round += 1) {
      const batch = await Promise.all(endpoints.map((endpoint) => page.request.get(endpoint)));
      responses.push(...batch);
    }

    for (const response of responses) {
      expect(response.status(), response.url()).toBeLessThan(500);
      expect(response.status(), response.url()).not.toBe(429);
    }
  });

  test('non-admin and guessed file paths remain blocked', async ({ page }) => {
    test.skip(!password, 'Set TEST_PASSWORD to run authenticated smoke tests');
    await localOnly(page.context());
    // Use the head account by default so this test does not inherit the
    // requester account's global rate-limit bucket from earlier smoke tests.
    await login(page, process.env.TEST_NON_ADMIN ?? accounts.head);

    expect((await page.request.get('/api/admin/users')).status()).toBe(403);
    expect((await page.request.get('/api/admin/roles')).status()).toBe(403);
    expect((await page.request.get('/api/files/does-not-exist.pdf')).status()).toBe(404);
    expect((await page.request.get('/api/files/unknown/subpath.pdf')).status()).toBe(400);
  });

  test('rate limit cannot be bypassed by spoofing forwarded IP', async ({ page }) => {
    test.skip(!password, 'Set TEST_PASSWORD to run authenticated smoke tests');
    await localOnly(page.context());
    // `accounts.admin` is this test's own throwaway admin, so exhausting its
    // quota here cannot 429 any other test (the limiter buckets by session
    // identity, `user:<id>`, not by IP — which is exactly what this asserts).
    await login(page, accounts.admin);

    const responses = await Promise.all(
      Array.from({ length: 105 }, (_, index) => page.request.get('/api/admin/users', {
        headers: {
          'x-forwarded-for': `198.51.${Math.floor(index / 255)}.${index % 255}`,
        },
      })),
    );
    const statuses = responses.map((response) => response.status());
    expect(statuses.some((status) => status === 429), `statuses: ${statuses.join(',')}`).toBe(true);
  });

  test('closed requests reject further workflow actions', async ({ page }) => {
    test.skip(!password, 'Set TEST_PASSWORD to run authenticated smoke tests');
    await localOnly(page.context());
    await login(page, accounts.admin);

    const listResponse = await page.request.get('/api/requests?status=CLOSED&limit=100');
    expect(listResponse.status()).toBe(200);
    const list = await listResponse.json();
    const closedRequest = list?.requests?.[0];
    test.skip(!closedRequest?.id, 'No closed request available for workflow edge-case test');

    const actionResponse = await page.request.post(`/api/requests/${closedRequest.id}/action`, {
      data: { actionName: 'APPROVE' },
    });
    expect(actionResponse.status()).toBe(400);
    const detail = await requestDetail(page, closedRequest.id);
    expect(detail.request.status).toBe('CLOSED');
  });

  test('bulk action rejects more than 100 requests before processing', async ({ page }) => {
    test.skip(!password, 'Set TEST_PASSWORD to run authenticated smoke tests');
    await localOnly(page.context());
    await login(page, accounts.head);

    const requestIds = Array.from({ length: 101 }, (_, index) => 900000 + index);
    const response = await page.request.post('/api/requests/bulk-action', {
      data: { requestIds, actionName: 'APPROVE' },
    });
    expect(response.status()).toBe(400);
  });

  test('notifications, report filters, and PDF invalid IDs fail safely', async ({ page }) => {
    test.skip(!password, 'Set TEST_PASSWORD to run authenticated smoke tests');
    await localOnly(page.context());
    await login(page, process.env.TEST_NON_ADMIN ?? 'req_cane');

    const notifications = await page.request.get('/api/notifications');
    expect(notifications.status()).toBe(200);
    expect(await notifications.json()).toEqual(expect.objectContaining({
      notifications: expect.any(Array),
      unreadCount: expect.any(Number),
    }));
    const unknownNotification = await page.request.patch('/api/notifications', {
      data: { id: 999999999 },
    });
    expect(unknownNotification.status()).toBe(200);

    const report = await page.request.get('/api/dashboard/report-data?startDate=2026-01-01&endDate=2026-12-31');
    expect(report.status()).toBe(200);
    expect(await report.json()).toEqual(expect.objectContaining({
      summary: expect.any(Object),
      byStatus: expect.any(Array),
      byCategory: expect.any(Array),
    }));
    const invalidReport = await page.request.get('/api/dashboard/report-data?startDate=not-a-date');
    expect(invalidReport.status()).toBe(400);

    expect((await page.request.get('/api/requests/0/pdf')).status()).toBe(400);
    expect((await page.request.get('/api/requests/999999999/pdf')).status()).toBe(404);
  });
});

test.describe('RequestOnline mutation workflow', () => {
  test('concurrent creates receive distinct request numbers', async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const contexts = [];
    const requestIds = [];
    let admin = null;
    const accountPage = async (username, loginPassword = passwordFor(username, password)) => {
      const context = await browser.newContext();
      contexts.push(context);
      await localOnly(context);
      const page = await context.newPage();
      await login(page, username, loginPassword);
      return page;
    };

    try {
      admin = await accountPage(accounts.admin);
      // Two sessions of one throwaway requester: same user, genuinely
      // concurrent submissions, without spending the seed account's quota.
      const [first, second] = await Promise.all([
        accountPage(accounts.testRequester, TEMP_PASSWORD),
        accountPage(accounts.testRequester, TEMP_PASSWORD),
      ]);
      const [firstId, secondId] = await Promise.all([
        createRequestThroughUI(first),
        createRequestThroughUI(second),
      ]);
      requestIds.push(firstId, secondId);

      const [firstDetail, secondDetail] = await Promise.all([
        requestDetail(first, firstId),
        requestDetail(second, secondId),
      ]);
      expect(firstDetail.request.id).not.toBe(secondDetail.request.id);
      expect(firstDetail.request.workOrderNo).toBeTruthy();
      expect(secondDetail.request.workOrderNo).toBeTruthy();
      expect(firstDetail.request.workOrderNo).not.toBe(secondDetail.request.workOrderNo);
    } finally {
      if (!admin) admin = await accountPage(accounts.admin);
      for (const requestId of requestIds) {
        const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
        expect([200, 204, 404]).toContain(cleanup.status());
      }
      await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    }
  });

  test('admin CRUD keeps master data changes reversible', async ({ browser }) => {
    test.setTimeout(90_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const context = await browser.newContext();
    await localOnly(context);
    const page = await context.newPage();
    const created = { departmentId: null, roleId: null, categoryId: null, locationId: null };
    const suffix = Date.now();

    try {
      await login(page, accounts.admin);

      const departmentCreate = await page.request.post('/api/admin/departments', {
        data: { departmentName: `E2E Department ${suffix}` },
      });
      expect(departmentCreate.status()).toBe(200);
      created.departmentId = (await departmentCreate.json()).DepartmentID;
      const departmentUpdate = await page.request.put(`/api/admin/departments/${created.departmentId}`, {
        data: { departmentName: `E2E Department Updated ${suffix}`, isActive: true },
      });
      expect(departmentUpdate.status()).toBe(200);
      expect((await departmentUpdate.json()).DepartmentName).toContain('Updated');

      const roleCreate = await page.request.post('/api/admin/roles', {
        data: { roleName: `E2E Role ${suffix}`, description: 'Created by reversible E2E test' },
      });
      expect(roleCreate.status()).toBe(200);
      created.roleId = (await roleCreate.json()).RoleID;
      const roleUpdate = await page.request.put(`/api/admin/roles/${created.roleId}`, {
        data: { roleName: `E2E Role Updated ${suffix}`, allowBulkActions: true },
      });
      expect(roleUpdate.status()).toBe(200);
      expect((await roleUpdate.json()).RoleName).toContain('Updated');

      const categoryCreate = await page.request.post('/api/admin/categories', {
        data: { name: `E2E Category ${suffix}`, requiresCCSClosing: false },
      });
      expect(categoryCreate.status()).toBe(200);
      created.categoryId = (await categoryCreate.json()).CategoryID;
      const categoryUpdate = await page.request.put(`/api/admin/categories/${created.categoryId}`, {
        data: { name: `E2E Category Updated ${suffix}`, requiresCCSClosing: true },
      });
      expect(categoryUpdate.status()).toBe(200);
      expect((await categoryUpdate.json()).CategoryName).toContain('Updated');

      const locationCreate = await page.request.post('/api/admin/locations', {
        data: { name: `E2E Location ${suffix}`, categoryIds: [created.categoryId] },
      });
      expect(locationCreate.status()).toBe(200);
      created.locationId = (await locationCreate.json()).LocationID;
      const locationUpdate = await page.request.put(`/api/admin/locations/${created.locationId}`, {
        data: { locationName: `E2E Location Updated ${suffix}`, categoryIds: [created.categoryId] },
      });
      expect(locationUpdate.status()).toBe(200);
      expect((await locationUpdate.json()).LocationName).toContain('Updated');
    } finally {
      if (created.locationId) {
        const response = await page.request.delete(`/api/admin/locations/${created.locationId}`);
        expect([200, 404]).toContain(response.status());
      }
      if (created.categoryId) {
        const response = await page.request.delete(`/api/admin/categories/${created.categoryId}`);
        expect([200, 404]).toContain(response.status());
      }
      if (created.roleId) {
        const response = await page.request.delete(`/api/admin/roles/${created.roleId}`);
        expect([200, 404]).toContain(response.status());
      }
      if (created.departmentId) {
        const response = await page.request.delete(`/api/admin/departments/${created.departmentId}`);
        expect([200, 404]).toContain(response.status());
      }
      await context.close();
    }
  });

  test('admin CRUD covers correction types and reasons', async ({ browser }) => {
    test.setTimeout(90_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const context = await browser.newContext();
    await localOnly(context);
    const page = await context.newPage();
    const created = { typeId: null, reasonId: null };
    const suffix = Date.now();

    try {
      await login(page, accounts.admin);

      const reasonCreate = await page.request.post('/api/admin/correction-reasons', {
        data: { text: `E2E Reason ${suffix}`, isActive: true },
      });
      expect(reasonCreate.status()).toBe(200);
      created.reasonId = (await reasonCreate.json()).ReasonID;
      const reasonUpdate = await page.request.put(`/api/admin/correction-reasons/${created.reasonId}`, {
        data: { text: `E2E Reason Updated ${suffix}`, isActive: false },
      });
      expect(reasonUpdate.status()).toBe(200);
      expect((await reasonUpdate.json()).Text).toContain('Updated');

      const typeCreate = await page.request.post('/api/admin/correction-types', {
        data: {
          name: `E2E Correction Type ${suffix}`,
          displayOrder: 999,
          isActive: true,
          templateString: 'E2E template',
          fieldsConfig: { fields: [] },
          categoryIds: [],
        },
      });
      expect(typeCreate.status()).toBe(200);
      created.typeId = (await typeCreate.json()).CorrectionTypeID;
      const typeUpdate = await page.request.put(`/api/admin/correction-types/${created.typeId}`, {
        data: {
          name: `E2E Correction Type Updated ${suffix}`,
          displayOrder: 1000,
          isActive: false,
          templateString: 'E2E updated template',
          fieldsConfig: { fields: [{ name: 'detail', type: 'text' }] },
          categoryIds: [],
        },
      });
      expect(typeUpdate.status()).toBe(200);
      expect((await typeUpdate.json()).Name).toContain('Updated');
    } finally {
      if (created.typeId) {
        const response = await page.request.delete(`/api/admin/correction-types/${created.typeId}`);
        expect([200, 404]).toContain(response.status());
      }
      if (created.reasonId) {
        const response = await page.request.delete(`/api/admin/correction-reasons/${created.reasonId}`);
        expect([200, 404]).toContain(response.status());
      }
      await context.close();
    }
  });

  test('admin workflow transition CRUD is reversible on an isolated category', async ({ browser }) => {
    test.setTimeout(90_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const context = await browser.newContext();
    await localOnly(context);
    const page = await context.newPage();
    const created = { categoryId: null, transitionId: null };
    const suffix = Date.now();

    try {
      await login(page, accounts.admin);
      const [statusesResponse, actionsResponse, rolesResponse] = await Promise.all([
        page.request.get('/api/admin/statuses'),
        page.request.get('/api/admin/actions'),
        page.request.get('/api/admin/roles'),
      ]);
      expect(statusesResponse.status()).toBe(200);
      expect(actionsResponse.status()).toBe(200);
      expect(rolesResponse.status()).toBe(200);
      const statuses = await statusesResponse.json();
      const actions = await actionsResponse.json();
      const roles = await rolesResponse.json();
      const currentStatus = statuses.find((status) => status.code === 'PENDING') ?? statuses[0];
      const nextStatus = statuses.find((status) => status.id !== currentStatus?.id) ?? statuses[0];
      const action = actions.find((item) => item.actionName === 'APPROVE') ?? actions[0];
      const role = roles.find((item) => item.RoleName === 'Head of Department') ?? roles.find((item) => item.RoleName !== 'Admin');
      expect(currentStatus).toBeTruthy();
      expect(nextStatus).toBeTruthy();
      expect(action).toBeTruthy();
      expect(role).toBeTruthy();

      const categoryCreate = await page.request.post('/api/admin/categories', {
        data: { name: `E2E Workflow Category ${suffix}`, requiresCCSClosing: false },
      });
      expect(categoryCreate.status()).toBe(200);
      created.categoryId = (await categoryCreate.json()).CategoryID;

      const transitionCreate = await page.request.post('/api/admin/workflow-transitions', {
        data: {
          categoryId: created.categoryId,
          currentStatusId: currentStatus.id,
          actionId: action.id,
          requiredRoleId: role.RoleID,
          nextStatusId: nextStatus.id,
          stepSequence: 90,
          filterByDepartment: true,
        },
      });
      expect(transitionCreate.status()).toBe(200);
      created.transitionId = (await transitionCreate.json()).id;

      const transitionList = await page.request.get(`/api/admin/workflow-transitions?categoryId=${created.categoryId}`);
      expect(transitionList.status()).toBe(200);
      expect((await transitionList.json()).some((item) => item.id === created.transitionId)).toBe(true);

      const transitionUpdate = await page.request.put(`/api/admin/workflow-transitions/${created.transitionId}`, {
        data: { stepSequence: 91, filterByDepartment: false },
      });
      expect(transitionUpdate.status()).toBe(200);
      expect((await transitionUpdate.json()).stepSequence).toBe(91);

      const transitionDelete = await page.request.delete(`/api/admin/workflow-transitions/${created.transitionId}`);
      expect(transitionDelete.status()).toBe(200);
      created.transitionId = null;
    } finally {
      if (created.transitionId) {
        const response = await page.request.delete(`/api/admin/workflow-transitions/${created.transitionId}`);
        expect([200, 404]).toContain(response.status());
      }
      if (created.categoryId) {
        const response = await page.request.delete(`/api/admin/categories/${created.categoryId}`);
        expect([200, 404]).toContain(response.status());
      }
      await context.close();
    }
  });

  test('admin settings changes are restored after verification', async ({ browser }) => {
    test.setTimeout(90_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const context = await browser.newContext();
    await localOnly(context);
    const page = await context.newPage();
    let originalStatus = null;
    let originalTemplate = null;
    let originalDocConfig = null;
    const created = { categoryId: null, specialApprover: false };

    try {
      await login(page, accounts.admin);

      const statusesResponse = await page.request.get('/api/admin/statuses');
      expect(statusesResponse.status()).toBe(200);
      const statuses = await statusesResponse.json();
      const status = statuses[0];
      expect(status).toBeTruthy();
      originalStatus = {
        id: status.id,
        displayName: status.displayName,
        colorCode: status.colorCode,
        displayOrder: status.displayOrder,
      };
      const statusUpdate = await page.request.put(`/api/admin/statuses/${status.id}`, {
        data: {
          displayName: `${status.displayName} E2E`,
          colorCode: status.colorCode,
          displayOrder: status.displayOrder,
        },
      });
      expect(statusUpdate.status()).toBe(200);
      expect((await statusUpdate.json()).displayName).toContain('E2E');

      const templatesResponse = await page.request.get('/api/admin/email-templates');
      expect(templatesResponse.status()).toBe(200);
      const templates = await templatesResponse.json();
      const template = templates[0];
      expect(template).toBeTruthy();
      originalTemplate = {
        id: template.id,
        subject: template.subject ?? '',
        body: template.body ?? '',
      };
      const templateUpdate = await page.request.put(`/api/admin/email-templates/${template.id}`, {
        data: {
          subject: `${template.subject ?? ''} E2E`,
          body: `${template.body ?? ''}\n<!-- E2E -->`,
        },
      });
      expect(templateUpdate.status()).toBe(200);
      expect((await templateUpdate.json()).subject).toContain('E2E');

      const currentYear = new Date().getFullYear() + 543;
      const docConfigResponse = await page.request.get(`/api/admin/doc-config?year=${currentYear}`);
      expect(docConfigResponse.status()).toBe(200);
      const docConfigs = await docConfigResponse.json();
      const docConfig = docConfigs.find((item) => item.id != null);
      if (docConfig) {
        originalDocConfig = {
          id: docConfig.id,
          prefix: docConfig.prefix,
          lastRunningNumber: docConfig.lastRunningNumber,
        };
        const docConfigUpdate = await page.request.put(`/api/admin/doc-config/${docConfig.id}`, {
          data: {
            prefix: `${docConfig.prefix}E2E`,
            lastRunningNumber: docConfig.lastRunningNumber,
          },
        });
        expect(docConfigUpdate.status()).toBe(200);
        expect((await docConfigUpdate.json()).prefix).toContain('E2E');
      }

      const [categoryCreate, usersResponse] = await Promise.all([
        page.request.post('/api/admin/categories', {
          data: { name: `E2E Special Approver Category ${Date.now()}`, requiresCCSClosing: false },
        }),
        page.request.get('/api/admin/users'),
      ]);
      expect(categoryCreate.status()).toBe(200);
      expect(usersResponse.status()).toBe(200);
      created.categoryId = (await categoryCreate.json()).CategoryID;
      const users = await usersResponse.json();
      const user = users.find((item) => item.UserID != null);
      expect(user).toBeTruthy();

      const specialCreate = await page.request.post('/api/admin/special-approvers', {
        data: { categoryId: created.categoryId, stepSequence: 1, userId: user.UserID },
      });
      expect(specialCreate.status()).toBe(200);
      created.specialApprover = true;
      const specialList = await page.request.get(`/api/admin/special-approvers?categoryId=${created.categoryId}`);
      expect(specialList.status()).toBe(200);
      expect((await specialList.json()).some((item) => item.stepSequence === 1 && item.userId === user.UserID)).toBe(true);
    } finally {
      if (created.specialApprover && created.categoryId) {
        const response = await page.request.delete(`/api/admin/special-approvers?categoryId=${created.categoryId}&stepSequence=1`);
        expect([200, 404]).toContain(response.status());
      }
      if (created.categoryId) {
        const response = await page.request.delete(`/api/admin/categories/${created.categoryId}`);
        expect([200, 404]).toContain(response.status());
      }
      if (originalDocConfig) {
        const response = await page.request.put(`/api/admin/doc-config/${originalDocConfig.id}`, {
          data: {
            prefix: originalDocConfig.prefix,
            lastRunningNumber: originalDocConfig.lastRunningNumber,
          },
        });
        expect([200, 404]).toContain(response.status());
      }
      if (originalTemplate) {
        const response = await page.request.put(`/api/admin/email-templates/${originalTemplate.id}`, {
          data: { subject: originalTemplate.subject, body: originalTemplate.body },
        });
        expect([200, 404]).toContain(response.status());
      }
      if (originalStatus) {
        const response = await page.request.put(`/api/admin/statuses/${originalStatus.id}`, {
          data: {
            displayName: originalStatus.displayName,
            colorCode: originalStatus.colorCode,
            displayOrder: originalStatus.displayOrder,
          },
        });
        expect([200, 404]).toContain(response.status());
      }
      await context.close();
    }
  });

  test('notification mark-read updates only the recipient notification', async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const contexts = [];
    const newAccountPage = async (username) => {
      const context = await browser.newContext();
      contexts.push(context);
      await localOnly(context);
      const page = await context.newPage();
      await login(page, username);
      return page;
    };

    let requestId = null;
    let admin = null;
    try {
      admin = await newAccountPage(accounts.admin);
      const requester = await newAccountPage(accounts.testRequester);
      const head = await newAccountPage(accounts.head);
      requestId = await createRequestThroughUI(requester);

      const before = await head.request.get('/api/notifications');
      expect(before.status()).toBe(200);
      const beforeData = await before.json();
      const notification = beforeData.notifications.find((item) => item.RequestID === requestId);
      expect(notification, `No notification found for request ${requestId}`).toBeTruthy();

      const markRead = await head.request.patch('/api/notifications', {
        data: { id: notification.NotificationID },
      });
      expect(markRead.status()).toBe(200);

      const after = await head.request.get('/api/notifications');
      expect(after.status()).toBe(200);
      const afterData = await after.json();
      const updated = afterData.notifications.find((item) => item.NotificationID === notification.NotificationID);
      expect(updated?.IsRead).toBe(true);

      const otherUserNotifications = await requester.request.get('/api/notifications');
      expect(otherUserNotifications.status()).toBe(200);
      const otherData = await otherUserNotifications.json();
      expect(otherData.notifications.some((item) => item.NotificationID === notification.NotificationID)).toBe(false);

      const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
      expect(cleanup.status()).toBe(200);
      requestId = null;
    } finally {
      if (!admin) admin = await newAccountPage(accounts.admin);
      if (requestId) {
        const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
        expect([200, 404]).toContain(cleanup.status());
      }
      await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    }
  });

  test('role changes and disabled users invalidate existing access', async ({ browser }) => {
    test.setTimeout(90_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const adminContext = await browser.newContext();
    const userContext = await browser.newContext();
    await localOnly(adminContext);
    await localOnly(userContext);
    const admin = await adminContext.newPage();
    const user = await userContext.newPage();
    let userId = null;

    try {
      await login(admin, accounts.admin);
      const [rolesResponse, departmentsResponse] = await Promise.all([
        admin.request.get('/api/admin/roles'),
        admin.request.get('/api/admin/departments'),
      ]);
      expect(rolesResponse.status()).toBe(200);
      expect(departmentsResponse.status()).toBe(200);
      const roles = await rolesResponse.json();
      const departments = await departmentsResponse.json();
      const adminRole = roles.find((role) => role.RoleName === 'Admin');
      const userRole = roles.find((role) => role.RoleName === 'User');
      const department = departments[0];
      expect(adminRole).toBeTruthy();
      expect(userRole).toBeTruthy();
      expect(department).toBeTruthy();

      const suffix = Date.now();
      const createResponse = await admin.request.post('/api/admin/users', {
        data: {
          username: `e2e_session_${suffix}`,
          password: '123456',
          fullName: `E2E Session ${suffix}`,
          email: `e2e.session.${suffix}@example.com`,
          roleId: adminRole.RoleID,
          isActive: true,
        },
      });
      expect(createResponse.status()).toBe(200);
      userId = (await createResponse.json()).UserID;

      await login(user, `e2e_session_${suffix}`, '123456');
      expect((await user.request.get('/api/me')).status()).toBe(200);
      expect((await user.request.get('/api/admin/users')).status()).toBe(200);

      const roleChangeResponse = await admin.request.put(`/api/admin/users/${userId}`, {
        data: { roleId: userRole.RoleID, departmentId: department.DepartmentID },
      });
      expect(roleChangeResponse.status()).toBe(200);
      expect((await user.request.get('/api/admin/users')).status()).toBe(403);

      const disableResponse = await admin.request.put(`/api/admin/users/${userId}`, {
        data: { isActive: false },
      });
      expect(disableResponse.status()).toBe(200);

      expect((await user.request.get('/api/me')).status()).toBe(401);
      expect((await user.request.get('/api/requests')).status()).toBe(401);
    } finally {
      if (userId) {
        await retireTestUser(admin, userId);
      }
      await Promise.all([adminContext.close(), userContext.close()]);
    }
  });

  test('users can change/reset passwords and manage signatures safely', async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const adminContext = await browser.newContext();
    const userContext = await browser.newContext();
    await localOnly(adminContext);
    await localOnly(userContext);
    const admin = await adminContext.newPage();
    const user = await userContext.newPage();
    let userId = null;
    const username = `e2e_password_${Date.now()}`;
    const initialPassword = '123456';
    const changedPassword = '654321';
    const resetPassword = '765432';

    const expectLoginFailure = async (page, loginUsername, loginPassword) => {
      await gotoWithRetry(page, '/login');
      await page.getByLabel(/username/i).fill(loginUsername);
      await page.getByLabel(/password/i).fill(loginPassword);
      await page.locator('form button[type="submit"]').click();
      await page.waitForTimeout(800);
      expect(page.url()).toMatch(/\/login/);
    };

    try {
      await login(admin, accounts.admin);
      const [rolesResponse, departmentsResponse] = await Promise.all([
        admin.request.get('/api/admin/roles'),
        admin.request.get('/api/admin/departments'),
      ]);
      expect(rolesResponse.status()).toBe(200);
      expect(departmentsResponse.status()).toBe(200);
      const roles = await rolesResponse.json();
      const departments = await departmentsResponse.json();
      const userRole = roles.find((role) => role.RoleName === 'User');
      const department = departments[0];
      expect(userRole).toBeTruthy();
      expect(department).toBeTruthy();

      const createResponse = await admin.request.post('/api/admin/users', {
        data: {
          username,
          password: initialPassword,
          fullName: `E2E Password ${Date.now()}`,
          email: `${username}@example.com`,
          roleId: userRole.RoleID,
          departmentId: department.DepartmentID,
          isActive: true,
        },
      });
      expect(createResponse.status()).toBe(200);
      userId = (await createResponse.json()).UserID;

      await login(user, username, initialPassword);
      expect((await user.request.get('/api/me')).status()).toBe(200);

      expect((await user.request.put('/api/auth/change-password', {
        data: { oldPassword: 'wrong-password', newPassword: changedPassword },
      })).status()).toBe(400);
      expect((await user.request.put('/api/auth/change-password', {
        data: { oldPassword: initialPassword, newPassword: '123' },
      })).status()).toBe(400);
      expect((await user.request.put('/api/auth/change-password', {
        data: { oldPassword: initialPassword, newPassword: changedPassword },
      })).status()).toBe(200);

      const oldPasswordContext = await browser.newContext();
      await localOnly(oldPasswordContext);
      const oldPasswordPage = await oldPasswordContext.newPage();
      await expectLoginFailure(oldPasswordPage, username, initialPassword);
      await oldPasswordContext.close();

      const changedPasswordContext = await browser.newContext();
      await localOnly(changedPasswordContext);
      const changedPasswordPage = await changedPasswordContext.newPage();
      await login(changedPasswordPage, username, changedPassword);
      expect((await changedPasswordPage.request.get('/api/me')).status()).toBe(200);
      await changedPasswordContext.close();

      expect((await user.request.post('/api/me/signature', {
        data: { signatureData: 123 },
      })).status()).toBe(400);
      expect((await user.request.post('/api/me/signature', {
        data: { signatureData: 'not-an-image' },
      })).status()).toBe(400);
      const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      expect((await user.request.post('/api/me/signature', {
        data: { signatureData: tinyPng },
      })).status()).toBe(200);
      expect((await user.request.post('/api/me/signature', {
        data: { signatureData: null },
      })).status()).toBe(200);

      expect((await admin.request.post(`/api/admin/users/${userId}/reset-password`, {
        data: { newPassword: '123' },
      })).status()).toBe(400);
      expect((await admin.request.post(`/api/admin/users/${userId}/reset-password`, {
        data: { newPassword: resetPassword },
      })).status()).toBe(200);

      const resetPasswordContext = await browser.newContext();
      await localOnly(resetPasswordContext);
      const resetPasswordPage = await resetPasswordContext.newPage();
      await login(resetPasswordPage, username, resetPassword);
      expect((await resetPasswordPage.request.get('/api/me')).status()).toBe(200);
      await resetPasswordContext.close();
    } finally {
      if (userId) {
        await retireTestUser(admin, userId);
      }
      await Promise.all([adminContext.close(), userContext.close()]);
    }
  });

  test('direct API uploads reject fake and oversized files without changing the request', async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const requesterContext = await browser.newContext();
    const adminContext = await browser.newContext();
    await localOnly(requesterContext);
    await localOnly(adminContext);
    const requester = await requesterContext.newPage();
    const admin = await adminContext.newPage();
    let requestId = null;

    try {
      await login(requester, accounts.testRequester);
      requestId = await createRequestThroughUI(requester);

      const fakeFileResponse = await requester.request.put(`/api/requests/${requestId}`, {
        multipart: {
          problemDetail: 'Upload validation test',
          existingFiles: '[]',
          attachments: {
            name: 'fake.png',
            mimeType: 'image/png',
            buffer: Buffer.from('this is not a PNG'),
          },
        },
      });
      expect(fakeFileResponse.status()).toBe(400);

      const oversizedFileResponse = await requester.request.put(`/api/requests/${requestId}`, {
        multipart: {
          problemDetail: 'Upload validation test',
          existingFiles: '[]',
          attachments: {
            name: 'oversized.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(10 * 1024 * 1024 + 1)]),
          },
        },
      });
      expect(oversizedFileResponse.status()).toBe(400);

      const detail = await requestDetail(requester, requestId);
      expect(detail.request.status).toBe('PENDING');
      expect(detail.request.attachmentPath == null || detail.request.attachmentPath === '[]').toBeTruthy();
    } finally {
      if (requestId) {
        await login(admin, accounts.admin);
        const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
        expect([200, 404]).toContain(cleanup.status());
      }
      await Promise.all([requesterContext.close(), adminContext.close()]);
    }
  });

  test('create, reject, resubmit, approve each stage, then clean up', async ({ browser }) => {
    test.setTimeout(180_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const contexts = [];
    let testClientNumber = 100;
    let requestId;
    let deleted = false;
    const newAccountPage = async (username, loginPassword = passwordFor(username, password)) => {
      testClientNumber += 1;
      console.log(`ACCOUNT ${username} client=10.250.0.${testClientNumber}`);
      const context = await browser.newContext({
        extraHTTPHeaders: { 'x-forwarded-for': `10.250.0.${testClientNumber}` },
      });
      contexts.push(context);
      await localOnly(context);
      const page = await context.newPage();
      await login(page, username, loginPassword);
      return page;
    };

    try {
      const setupAdmin = await newAccountPage(accounts.admin);
      const requester = await newAccountPage(accounts.testRequester, TEMP_PASSWORD);
      console.log('STEP create');
      requestId = await createRequestThroughUI(requester);
      console.log(`CREATED ${requestId}`);
      expect((await requestDetail(requester, requestId)).request.status).toBe('PENDING');

      const head = await newAccountPage(accounts.head);
      console.log('STEP reject');
      await gotoWithRetry(head, `/request/${requestId}`);
      const pendingDetail = await requestDetail(head, requestId);
      const rejectAction = pendingDetail.possibleActions.find((action) => action.ActionName === 'REJECT');
      expect(rejectAction).toBeTruthy();
      const missingComment = await head.request.post(`/api/requests/${requestId}/action`, {
        data: { actionName: 'REJECT' },
      });
      expect(missingComment.status()).toBe(400);
      expect((await requestDetail(head, requestId)).request.status).toBe('PENDING');
      await clickActionAndConfirm(head, rejectAction.ActionDisplayName, 'SMOKE TEST: กรุณาแก้ไขรายละเอียด');
      await expect.poll(async () => (await requestDetail(head, requestId)).request.status).toBe('REVISION');
      console.log('REJECTED REVISION');
      const headContext = head.context();
      contexts.splice(contexts.indexOf(headContext), 1);
      await headContext.close();

      await gotoWithRetry(requester, `/request/${requestId}/edit`);
      const editField = requester.locator('textarea').first();
      await editField.fill(`${await editField.inputValue()} — แก้ไขแล้ว`);
      await requester.locator('form button[type="submit"]').click();
      await expect.poll(async () => (await requestDetail(requester, requestId)).request.status).toBe('PENDING');
      console.log('RESUBMITTED PENDING');

      const duplicateHead = await newAccountPage(accounts.head);
      const duplicateHeadContext = duplicateHead.context();
      const duplicateResponses = await Promise.all([
        duplicateHead.request.post(`/api/requests/${requestId}/action`, { data: { actionName: 'APPROVE' } }),
        duplicateHead.request.post(`/api/requests/${requestId}/action`, { data: { actionName: 'APPROVE' } }),
      ]);
      const duplicateStatuses = duplicateResponses.map((response) => response.status()).sort((a, b) => a - b);
      expect(duplicateStatuses, `duplicate action responses: ${duplicateStatuses.join(',')}`).toEqual([200, 400]);
      expect((await requestDetail(requester, requestId)).request.status).toBe('WAITING_ACCOUNT_1');
      contexts.splice(contexts.indexOf(duplicateHeadContext), 1);
      await duplicateHeadContext.close();
      console.log('DUPLICATE ACTION BLOCKED');

      const stages = {
        PENDING: [accounts.head, 'APPROVE'],
        WAITING_ACCOUNT_1: [accounts.accountant, 'APPROVE'],
        WAITING_FINAL_APP: [accounts.final, 'APPROVE'],
        IT_WORKING: [accounts.it, 'IT_PROCESS'],
        WAITING_ACCOUNT_2: [accounts.accountant, 'APPROVE'],
        WAITING_IT_CLOSE: [accounts.itReviewer, 'CONFIRM_COMPLETE'],
      };

      for (let count = 0; count < 8; count += 1) {
        const current = (await requestDetail(requester, requestId)).request;
        console.log(`STAGE ${count + 1} ${current.status}`);
        if (current.status === 'CLOSED') break;
        const stage = stages[current.status];
        expect(stage, `unsupported workflow status ${current.status}`).toBeTruthy();
        const approver = await newAccountPage(stage[0]);
        const approverContext = approver.context();
        await gotoWithRetry(approver, `/request/${requestId}`);
        await approver.waitForTimeout(750);
        const detail = await requestDetail(approver, requestId);
        const action = detail.possibleActions.find((item) => item.ActionName === stage[1]);
        expect(action, `${stage[1]} unavailable at ${current.status}`).toBeTruthy();
        await clickActionAndConfirm(approver, action.ActionDisplayName, stage[1] === 'IT_PROCESS' ? 'SMOKE TEST IT processing' : 'SMOKE TEST approval');
        await expect.poll(async () => (await requestDetail(approver, requestId)).request.status).not.toBe(current.status);
        console.log(`STAGE DONE ${current.status}`);
        contexts.splice(contexts.indexOf(approverContext), 1);
        await approverContext.close();
      }
      expect((await requestDetail(requester, requestId)).request.status).toBe('CLOSED');
    } finally {
      try {
        if ((requestId && !deleted)) {
          const admin = await newAccountPage(accounts.admin);
          if (requestId && !deleted) {
            const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
            deleted = cleanup.ok();
            expect(cleanup.ok(), `cleanup request ${requestId}`).toBeTruthy();
          }
        }
      } finally {
        for (const context of contexts) await context.close().catch(() => {});
      }
    }
  });

  test('cross-department approver cannot change a request', async ({ browser }) => {
    test.setTimeout(90_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const contexts = [];
    let requestId;
    let admin = null;
    const clientBase = 120 + (Date.now() % 100);
    const accountPage = async (username, clientNumber) => {
      const context = await browser.newContext({
        extraHTTPHeaders: { 'x-forwarded-for': `10.250.1.${clientNumber}` },
      });
      contexts.push(context);
      await localOnly(context);
      const page = await context.newPage();
      await login(page, username);
      return page;
    };

    try {
      admin = await accountPage(accounts.admin, clientBase + 2);
      const requester = await accountPage(accounts.testRequester, clientBase);
      requestId = await createRequestThroughUI(requester);
      expect((await requestDetail(requester, requestId)).request.status).toBe('PENDING');

      const otherDepartmentHead = await accountPage(process.env.TEST_OTHER_DEPT_HEAD ?? 'head_store', clientBase + 1);
      const response = await otherDepartmentHead.request.post(`/api/requests/${requestId}/action`, {
        data: { actionName: 'APPROVE' },
      });
      expect(response.status()).toBe(403);
      expect((await requestDetail(requester, requestId)).request.status).toBe('PENDING');
    } finally {
      if (!admin) admin = await accountPage(accounts.admin, clientBase + 2);
      if (requestId) {
        const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
        expect(cleanup.ok(), `cleanup request ${requestId}`).toBeTruthy();
      }
      for (const context of contexts) await context.close().catch(() => {});
    }
  });

  test('request attachments and PDF are limited to the owner or approver', async ({ browser }) => {
    test.setTimeout(90_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const contexts = [];
    const clientBase = 210 + (Date.now() % 20);
    let requestId;
    let admin = null;
    const accountPage = async (username, clientNumber, loginPassword = passwordFor(username, password)) => {
      const context = await browser.newContext({
        extraHTTPHeaders: { 'x-forwarded-for': `10.250.3.${clientNumber}` },
      });
      contexts.push(context);
      await localOnly(context);
      const page = await context.newPage();
      await login(page, username, loginPassword);
      return page;
    };

    try {
      admin = await accountPage(accounts.admin, clientBase + 2);
      const owner = await accountPage(accounts.testRequester, clientBase, TEMP_PASSWORD);
      requestId = await createRequestThroughUI(owner, true);
      const ownerDetail = await requestDetail(owner, requestId);
      const attachmentPath = JSON.parse(ownerDetail.request.attachmentPath)[0];
      expect(attachmentPath).toMatch(/^\/api\/files\//);
      expect((await owner.request.get(attachmentPath)).status()).toBe(200);
      expect((await owner.request.get(`/api/requests/${requestId}/pdf`)).status()).toBe(200);

      const otherOwner = await accountPage(process.env.TEST_OTHER_REQUESTER ?? 'req_store', clientBase + 1);
      expect((await otherOwner.request.get(`/api/requests/${requestId}`)).status()).toBe(403);
      expect((await otherOwner.request.get(attachmentPath)).status()).toBe(403);
      expect((await otherOwner.request.get(`/api/requests/${requestId}/pdf`)).status()).toBe(403);
    } finally {
      if (!admin) admin = await accountPage(accounts.admin, clientBase + 2);
      if (requestId) {
        const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
        expect(cleanup.ok(), `cleanup request ${requestId}`).toBeTruthy();
      }
      for (const context of contexts) await context.close().catch(() => {});
    }
  });

  test('bulk reject uses the same workflow and returns requests to revision', async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'Set RUN_MUTATION_TESTS=true to enable data-changing tests');
    test.skip(!password, 'Set TEST_PASSWORD to run mutation tests');

    const contexts = [];
    const clientBase = 230 + (Date.now() % 20);
    let requestIds = [];
    let admin = null;
    const accountPage = async (username, clientNumber, loginPassword = passwordFor(username, password)) => {
      const context = await browser.newContext({
        extraHTTPHeaders: { 'x-forwarded-for': `10.250.2.${clientNumber}` },
      });
      contexts.push(context);
      await localOnly(context);
      const page = await context.newPage();
      await login(page, username, loginPassword);
      return page;
    };

    try {
      admin = await accountPage(accounts.admin, clientBase + 2);
      const requester = await accountPage(accounts.testRequester, clientBase, TEMP_PASSWORD);
      requestIds.push(await createRequestThroughUI(requester));
      requestIds.push(await createRequestThroughUI(requester));
      for (const requestId of requestIds) {
        expect((await requestDetail(requester, requestId)).request.status).toBe('PENDING');
      }

      const head = await accountPage(accounts.head, clientBase + 1);
      const response = await head.request.post('/api/requests/bulk-action', {
        data: {
          requestIds,
          actionName: 'REJECT',
          comment: 'SMOKE TEST bulk rejection',
        },
      });
      const body = await response.json();
      expect(response.ok(), `${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
      expect(body.count).toBe(2);

      for (const requestId of requestIds) {
        await expect.poll(async () => (await requestDetail(requester, requestId)).request.status).toBe('REVISION');
      }
    } finally {
      if (!admin) admin = await accountPage(accounts.admin, clientBase + 2);
      for (const requestId of requestIds) {
        const cleanup = await admin.request.delete(`/api/requests/${requestId}`);
        expect(cleanup.ok(), `cleanup request ${requestId}`).toBeTruthy();
      }
      for (const context of contexts) await context.close().catch(() => {});
    }
  });
});
