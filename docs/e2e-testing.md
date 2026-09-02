# E2E testing

The Playwright suite is local-only and uses a single worker.

Start the app separately on `http://localhost:3000`. For mutation runs, make
sure the server-side email and webhook settings are disabled or point to a
local test sink before starting Next.js.

Read-only smoke tests:

```powershell
$env:TEST_PASSWORD = '<seeded-test-password>'
npm run test:e2e
```

Mutation workflow test (creates and deletes a request marked `SMOKE TEST`):

```powershell
$env:TEST_PASSWORD = '<seeded-test-password>'
$env:RUN_MUTATION_TESTS = 'true'
npm run test:e2e:mutation
```

To watch the browser actions:

```powershell
$env:HEADED = 'true'
$env:TEST_PASSWORD = '<seeded-test-password>'
$env:RUN_MUTATION_TESTS = 'true'
npx playwright test tests/e2e/requestonline.spec.js -g "create, reject, resubmit"
```

The mutation test rejects a request without a comment first, verifies that the
state is unchanged, then runs reject → edit/resubmit → each configured approval
stage → cleanup. It also verifies that an admin-only delete succeeds.
