# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Next.js dev server (--webpack)
npm run build             # production build
npm run lint               # eslint
npm test                  # vitest run (single run; unit tests only, no database)
npm run test:watch        # vitest watch
npx vitest run lib/hash.test.ts   # run a single test file
npm run test:db           # DB-backed vitest (lib/document-number.db.test.ts only) — needs the real SQL Server
npm run build && npm run test:e2e # Playwright E2E — see docs/e2e-testing.md before running
npm run db:reset          # DESTRUCTIVE: prisma db push --force-reset && prisma db seed — wipes the DB in .env
npm run seed               # tsx prisma/seed.ts
npm run create-admin      # tsx scripts/create-admin.ts
```

There is no separate typecheck script — use `tsc --noEmit` if needed. Tests live next to the code they cover (e.g. `lib/hash.test.ts`, `lib/services/approvalService.test.ts`) and vitest only picks up `lib/**/*.test.ts(x)`; route handlers and pages under `app/` are covered only by the Playwright suite in `tests/e2e/`.

`npm run test:e2e` runs `next start` (a production build), so run `npm run build` first. The suite **writes to whatever database `.env` points at** and routes outgoing mail to a local sink; read `docs/e2e-testing.md` first.

Database is **SQL Server** via Prisma with `@prisma/adapter-mssql`, configured from the `MSSQL_SERVER/PORT/DATABASE/USER/PASSWORD` env vars (see `lib/mssql-config.ts`, `lib/prisma.ts`, `prisma.config.ts`, and `.env.example`). The project moved from PostgreSQL; there is no `DATABASE_URL` any more.

**Schema changes are applied by hand as idempotent SQL, not with `prisma migrate`.** `prisma/migrations/0_sqlserver_baseline` plus the `add_*.sql` scripts are run through SSMS, then `npx prisma generate`. Prisma's schema engine fails the TLS handshake against SQL Server on the Windows dev machine (`P1011`), so `db push`/`migrate` are not dependable there. Three older scripts (`add_status_table.sql`, `add_audit_log_request_id.sql`, `add_workflow_filter_and_special_approver.sql`) are SQLite/PostgreSQL syntax and cannot run on SQL Server. The order to apply the current scripts, and the preflight/backup steps, are in `docs/DB-MIGRATION-RUNBOOK.md` — read it before touching a database that has real data. **Code that reads a new column fails on every page until the SQL has been run on that database, and a running dev server keeps the old generated Prisma Client until it is restarted.**

## Architecture

This is a Next.js 16 App Router app (Thai-language IT/request-approval system, "REQUESTONLINE"), backed by Prisma/SQL Server, NextAuth (Credentials provider) for auth.

### Domain model (`prisma/schema.prisma`)

Central entity is `ITRequestF07` (an IT/maintenance request form), tied to `Category`, `Department`, `Location`, and a `requester` (`User`). Approval/workflow pieces:

- `WorkflowTransition` / `Status` / `Action` — **the workflow engine.** Each row is currentStatus → action → nextStatus for a `requiredRole`, with a `stepSequence`, optional `filterByDepartment`, and a `conditionKey`. Every approval, button list and notification recipient is derived from these rows through `lib/workflow.ts` (`findPossibleTransitions`). Request status is `ITRequestF07.currentStatusId` (mirrored in the `status` code string). The normal path is `PENDING → WAITING_ACCOUNT_1 → WAITING_FINAL_APP → IT_WORKING → (WAITING_ACCOUNT_2) → WAITING_IT_CLOSE → CLOSED`; any step can `REJECT` to `REVISION`, and the requester's edit/resubmit returns it to `PENDING`.
- `WorkflowVersion` — transitions belong to a version (`DRAFT` / `PUBLISHED` / `ARCHIVED`, per category and optional correction type). A request is **pinned** to the version it was created under (`ITRequestF07.workflowVersionId`), so publishing a new version never changes the rules for requests already in flight. Publishing validates both account-recheck branches and auto-archives the previous published version; archiving a `PUBLISHED` version directly is refused (409) because it would leave the category with nothing to route by. If no version can be resolved, `findTransitionsByStatus` returns nothing (fail closed → `NO_TRANSITION`) rather than merging every version's rows — merging doubled the "required approvals" of single-approver steps and stalled requests forever. Admin UI/API: `app/admin/workflow-transitions`, `app/api/admin/workflow-versions`, `workflow-simulator`; logic and the validator in `lib/workflow-versioning.ts`.
- `conditionKey` (`ALWAYS` / `ACCOUNT_RECHECK_REQUIRED` / `ACCOUNT_RECHECK_SKIPPED`) is matched against `ITRequestF07.requiresAccountRecheck`, which the requester chooses when creating the request. It decides whether IT's completion goes to `WAITING_ACCOUNT_2` (accounting rechecks) or straight to `WAITING_IT_CLOSE`.
- `Category.isWorkflowTemplate` marks "ทั่วไป" as the shared template workflow. A category whose published version is still the migration-created `Baseline v1` inherits the template's published version (`resolveWorkflowVersionId`); that check is by label, which is fragile.
- `WorkflowStep` — the older per-category, per-`stepSequence` approver-role table, still editable at `/admin/workflows`. It no longer drives status; it survives only as a fallback to find the first approver when a request is created (`getFirstApproverForCategory` in `app/actions/f07-action.ts`).
- `ITRequestF07.approvalRound` and `ApprovalHistory.approvalRound` — editing a request or resubmitting it from `REVISION` starts a new round. "Already approved this step" and "all parallel approvers done" count only the current round; earlier rounds' history is kept (`lib/approval-history.ts` builds the current-round evidence for the print page).
- `SpecialApproverMapping` — per-category/step override naming a specific `User` as approver instead of going by role.
- `ApprovalHistory`, `AuditLog`, `Notification` — history/audit/in-app notification trails.
- `CorrectionType` / `CorrectionReason` / `RequestCorrectionType` — "ขอแก้ไข" (correction request) classification attached to requests.
- `DocConfig` — per-category/year running-number config used to generate `workOrderNo` document numbers.

`docs/BACKEND_REFERENCE.md` and `docs/REQUEST-APPROVAL-FLOW.md` map this schema and flow back to an older Express/SQL-Server system; they describe an earlier state of the schema (e.g. claim no `Notification`/`ApprovalHistory` tables) — treat them as historical design notes, not current truth. Prefer reading `prisma/schema.prisma` and the `lib/` code directly.

### Approval: three entry points, one service

All approvals run through `lib/services/approvalService.ts`. Do not re-implement a status change in a route or action.

1. **Dashboard/API**: `app/api/requests/[id]/action/route.ts` → `executeApproval`.
2. **Bulk**: `app/api/requests/bulk-action/route.ts` → `executeApproval` once per request, sequentially; one stale or forbidden item is skipped and reported without affecting the rest.
3. **Email link**: `app/approve/[token]/page.tsx` + `app/actions/approve-action.ts` (`handleApprovalAction`) → `executeApprovalByToken`, which looks the request up by `ITRequestF07.approvalToken`, picks the action, and calls `executeApproval` with `expectedToken`. A login session is required. The token is single-use: it rotates to a new value at every step and is cleared on close/reject, and a token from before a reject→resubmit cannot approve the new submission. The page renders Approve/Reject for any logged-in viewer; the server, not the page, enforces who may act.

What `executeApproval` guarantees (keep these when changing it):

- **Optimistic concurrency.** Callers must send the `updatedAt` they were shown (`expectedUpdatedAt`; `body.updatedAt` on the action route, `versions[id]` on bulk). Inside a Serializable transaction it first claims that exact `updatedAt` and `approvalRound`; a mismatch is `409 CONFLICT`. This is also what stops a double click or a retry from writing a second history row. Retry is only for a genuine SQL Server abort (`P2034`/`ENOTBEGUN`, `lib/transaction-retry.ts`), never a replay that skips the claim.
- **Authorization** is checked server-side against the transition: role (`getUserRoleNamesForWorkflowRole`), department when `filterByDepartment`, and `SpecialApproverMapping`. `filterTransitionsForActor` is the single rule shared with the request detail page's list of available actions, so a button is never offered that the server would refuse.
- **Parallel approval.** A step with several transitions needs one approval per transition from distinct approvers in the current round before the request moves on (`checkParallelApprovalsCompleted`).
- **Notifications are best effort after commit.** A failed notification or email never turns a committed approval into an error. Next approvers always get an in-app notification, even with no email on file; when nobody can be notified an admin is alerted (`notifyAdminsOfStalledRequest`).

Request creation (`app/actions/f07-action.ts`) creates the `ITRequestF07` in one Serializable transaction, issues `workOrderNo` via `DocConfig` (`lib/document-number.ts`), pins `workflowVersionId`, then notifies the step-1 approver. Uploaded files are deleted again only if that transaction fails.

### Auth & role system

- NextAuth Credentials provider in `lib/auth.ts`; session JWT carries `roleName`.
- `middleware.ts` is the route gatekeeper — checks `/dashboard`, `/admin`, `/api/admin`, `/pending-tasks`, `/report`, `/request`, `/category`, `/notifications` against role lists, plus a global IP rate limit (`lib/rate-limit.ts`). It must stay Edge-runtime-safe (no Prisma/Node imports), which is why role constants live in `lib/auth-constants.ts` rather than being read from the DB.
- `lib/auth-constants.ts` is the single source of truth for role-name strings (the DB has accumulated inconsistent/typo'd role names like `'It operetor'`, `'IT Veiwer'`, Thai names like `'หน.แผนก'` — these are intentionally enumerated, not bugs to "clean up"). Key exports:
  - `allowedDashboardRoles`, `approverRoles`, `requesterRoles`, `reportRoles` — gate page access.
  - `WORKFLOW_ROLE_TO_USER_ROLES` / `getWorkflowRoleNamesForUser` / `getUserRoleNamesForWorkflowRole` / `getCanonicalRoleNamesForApprover` — translate between the canonical English role names used by seed data (`WorkflowTransition.requiredRole`, and `WorkflowStep.approverRoleName` on the legacy table) and the actual variety of `Role.roleName` values found in the DB, so approval-eligibility checks work despite naming drift.
  - `ROLE_HIERARCHY`, `getTabsForRole` — menu/tab visibility per role.
- `/api/admin/**` is double-guarded: middleware blocks non-Admin at the edge, and routes should still check role server-side (defense in depth).

### Layer structure

- `app/api/**` — REST-ish API routes (mostly thin; call into `lib/services/*`).
- `app/actions/**` — Next.js Server Actions (form submissions: `f07-action.ts`, `approve-action.ts`).
- `lib/services/**` — business logic (`requestService`, `approvalService`, `adminService`, `dashboardService`, `notificationService`, `emailService`, `authService`); prefer adding logic here over inline in routes/actions. `approvalService` is the one that matters most (see above); a lot of the rest of the logic lives in `lib/*.ts` directly.
- `lib/workflow.ts` — transition lookup for a request (`findPossibleTransitions`, version-scoped), parallel-approval counting, and next-approver resolution for notifications. `lib/workflow-versioning.ts` — version resolution, the condition matcher, the validator and the simulator.
- `lib/request-concurrency.ts` (version check/next timestamp), `lib/transaction-retry.ts` (Serializable retry + timeouts), `lib/approval-history.ts` (current-round evidence), `lib/attachments.ts` + `lib/storage.ts` (attachment list merge; files saved under `./uploads`, path fixed in code).
- `lib/pending-tasks-shared.ts` + `lib/request-scope.ts` — who sees which request (pending list/count, dashboard scope). They key on (category, status, workflowVersionId, conditionKey) and the current round; they are separate queries from the approval authorization above and must stay consistent with it.
- `lib/mail.ts` + `lib/email-helper.ts` — outbound email and HTML templates. `sendApprovalEmail` tries the Internal Email API (`INTERNAL_EMAIL_API_URL`, falling back to the `VITE_`/`NEXT_PUBLIC_` names) first and falls back to SMTP; if both fail it logs and returns `{ok:false}`. There is no retry queue and no one is told a mail did not go out.
- `lib/prisma.ts` — singleton `PrismaClient` (`@prisma/adapter-mssql`, pool/timeouts from `lib/mssql-config.ts`).
- `GET /api/health` — unauthenticated, reports DB status, exempt from the rate limit; used for external monitoring.
- `app/(main)/**` — authenticated app pages (dashboard, request CRUD, pending-tasks, profile, report, notifications), under a shared layout group.
- `app/admin/**` — Admin-only CRUD pages for master data (categories, departments, locations, roles, statuses, workflows, workflow-transitions, correction types/reasons, email templates, doc-config, users, audit logs).
- `app/approve/[token]/page.tsx` — public (token-authenticated) approval-link landing page, the entry point for the email-link approval path.

### Branches, deployment, operations

- **Work happens on `mssql-migration`, not `master`.** `master` is still the PostgreSQL-era app (its schema datasource is `postgresql`) and has no commits that this branch lacks; this branch is the SQL Server migration plus everything above. Do not merge or rebase assuming the two schemas agree.
- Production runs `next start` under **PM2 on a Windows server** (`ecosystem.config.cjs`, binds `0.0.0.0:3000`). `NEXT_PUBLIC_APP_URL` must be the address users actually open or the links in emails point at the wrong machine. Sign-out uses `lib/client-logout.ts` (redirects within the current origin) so `NEXTAUTH_URL` pointing at another host cannot bounce users away.
- Backups, restore drill and scheduled jobs are documented in `docs/DB-MIGRATION-RUNBOOK.md` (`scripts/backup-job.ps1`, `scripts/restore-drill.ps1`). Back up `./uploads` together with the database; attachments are not in the DB.
- `docs/IMPROVEMENT-PLAN.md` is the working checklist: what is done, what has been verified against a real SQL Server and how, and what is still open. Check it before assuming something is untested or finished.
- Manuals for end users are in `docs/` (`คู่มือการใช้งาน-*.md`, generated `.docx` in `docs/generated-manuals/`); regenerate them with `scripts/prepare-manual-sample-data.mjs`, `capture-manual-screenshots.mjs`, `build-manual-documents.py` after a UI change.

### PDF / fonts

PDF generation (`jspdf`, `pdf-lib`, `canvg`, `html2canvas`) embeds Thai fonts (`lib/noto-sans-thai-base64.ts`, `@fontsource/noto-sans-thai`) — see `docs/PDF-THAI.md` for details if touching `app/(main)/request/[id]/print` or `app/api/requests/[id]/pdf`.

The download and print buttons build the PDF **in the browser** (html2canvas + jsPDF) and merge PDF attachments with pdf-lib; this is the path users get and it renders Thai correctly. `GET /api/requests/[id]/pdf` (pdf-lib on the server) is not called by any screen or email, and its Thai output is wrong (tone marks and upper vowels misplaced because pdf-lib ignores the GPOS offsets). Do not attach or link it for users.
