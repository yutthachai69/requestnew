/**
 * Per-test admin isolation for the E2E suites.
 *
 * `middleware.ts` rate-limits by *session identity* (`user:<id>`, 100 requests
 * per 60s), not by IP — so spoofing `x-forwarded-for` does not isolate tests.
 * A suite where every test drives admin APIs through the one shared `admin`
 * account exhausts that account's bucket and the tests that follow get 429s
 * that look like unrelated failures.
 *
 * This module hands each test its own throwaway Admin account, created and
 * deleted through a single long-lived API session of the seed admin (2 requests
 * per test). Tests keep calling `login(page, accounts.admin)` unchanged: the
 * `accounts` object is rewritten before each test, and `login()` resolves the
 * password for `e2e_*` accounts to TEMP_PASSWORD.
 */
import { expect, request as apiRequest } from '@playwright/test';

export const TEMP_PASSWORD = 'e2e-temp-1234';

/** Password to use for a username — throwaway accounts share one password. */
export function passwordFor(username, seedPassword) {
  return username.startsWith('e2e_') ? TEMP_PASSWORD : seedPassword;
}

/**
 * Remove a throwaway account. DELETE /api/admin/users/[id] fails once the user
 * has written an AuditLog row (FK `AuditLog_userId_fkey`), so fall back to
 * deactivating it — the account is then unusable and no test data is left
 * behind in a usable state.
 */
export async function retireTestUser(adminPage, userId) {
  const deletion = await adminPage.request.delete(`/api/admin/users/${userId}`);
  if ([200, 204, 404].includes(deletion.status())) return;
  const disabled = await adminPage.request.put(`/api/admin/users/${userId}`, {
    data: { isActive: false },
  });
  expect([200, 404], `could not retire test user ${userId}`).toContain(disabled.status());
}

async function loginApiContext(username, loginPassword) {
  const context = await apiRequest.newContext({
    baseURL: process.env.TEST_BASE_URL ?? 'http://localhost:3000',
  });
  const csrfResponse = await context.get('/api/auth/csrf');
  const csrf = csrfResponse.ok() ? await csrfResponse.json() : {};
  const authResponse = await context.post('/api/auth/callback/credentials', {
    form: {
      csrfToken: csrf.csrfToken ?? '',
      username,
      password: loginPassword,
      callbackUrl: '/dashboard',
      json: 'true',
    },
  });
  expect(authResponse.ok(), `seed admin login → ${authResponse.status()}`).toBeTruthy();
  return context;
}

/**
 * Wire per-test throwaway accounts into a spec file.
 *
 * Before each test this creates two accounts through a single long-lived API
 * session of the seed admin, and exposes them on the spec's `accounts` map:
 *
 * - `accounts.admin`        — a fresh Admin (the seed name is restored after)
 * - `accounts.testRequester`— a fresh clone of the seed requester (same role,
 *                             department and category access)
 *
 * Both are retired afterwards. Tests therefore never spend the shared seed
 * accounts' 100-req/min budget on anything but this bookkeeping.
 *
 * @param test      the Playwright `test` object of the calling spec
 * @param accounts  the spec's mutable accounts map
 * @param password  the seed password (TEST_PASSWORD)
 */
export function withThrowawayAccounts(test, accounts, password) {
  const seedAdmin = accounts.admin;
  let seedSession = null;
  let adminRoleId = null;
  let requesterTemplate = null;
  let created = [];

  test.beforeAll(async () => {
    if (!password) return;
    seedSession = await loginApiContext(seedAdmin, password);

    const rolesResponse = await seedSession.get('/api/admin/roles');
    expect(rolesResponse.status(), 'seed admin cannot list roles').toBe(200);
    const role = (await rolesResponse.json()).find((r) => r.RoleName === 'Admin');
    expect(role, 'Admin role not found').toBeTruthy();
    adminRoleId = role.RoleID;

    const usersResponse = await seedSession.get('/api/admin/users');
    expect(usersResponse.status(), 'seed admin cannot list users').toBe(200);
    const seedRequester = (await usersResponse.json()).find((u) => u.Username === accounts.requester);
    expect(seedRequester, `seed requester ${accounts.requester} not found`).toBeTruthy();
    requesterTemplate = {
      roleId: seedRequester.RoleID,
      departmentId: seedRequester.DepartmentID,
      categoryIds: seedRequester.CategoryIDs,
    };
  });

  const provision = async (prefix, data) => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const username = `${prefix}_${suffix}`;
    const response = await seedSession.post('/api/admin/users', {
      data: {
        username,
        password: TEMP_PASSWORD,
        fullName: `E2E ${prefix} ${suffix}`,
        email: `${prefix}.${suffix}@example.com`,
        isActive: true,
        ...data,
      },
    });
    expect(response.status(), await response.text()).toBe(200);
    created.push((await response.json()).UserID);
    return username;
  };

  test.beforeEach(async () => {
    if (!seedSession) return;
    accounts.admin = await provision('e2e_admin', { roleId: adminRoleId });
    accounts.testRequester = await provision('e2e_req', requesterTemplate);
  });

  test.afterEach(async () => {
    accounts.admin = seedAdmin;
    accounts.testRequester = accounts.requester;
    if (!seedSession) return;
    for (const userId of created) {
      // Best effort: a leaked throwaway account would otherwise linger in the DB.
      const deletion = await seedSession.delete(`/api/admin/users/${userId}`).catch(() => null);
      if (!deletion || ![200, 204, 404].includes(deletion.status())) {
        // The account wrote AuditLog rows, so it cannot be deleted — disable it.
        await seedSession
          .put(`/api/admin/users/${userId}`, { data: { isActive: false } })
          .catch(() => {});
      }
    }
    created = [];
  });

  test.afterAll(async () => {
    await seedSession?.dispose().catch(() => {});
    seedSession = null;
  });
}
