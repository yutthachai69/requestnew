# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Next.js dev server (--webpack)
npm run build             # production build
npm run lint               # eslint
npm test                  # vitest run (single run)
npm run test:watch        # vitest watch
npx vitest run lib/hash.test.ts   # run a single test file
npm run db:reset          # prisma db push --force-reset && prisma db seed
npm run seed               # tsx prisma/seed.ts
npm run create-admin      # tsx scripts/create-admin.ts
```

There is no separate typecheck script — use `tsc --noEmit` if needed. Tests live next to the code they cover (e.g. `lib/hash.test.ts`, `lib/services/approvalService.test.ts`) and vitest only picks up `lib/**/*.test.ts(x)`.

Database is PostgreSQL via Prisma (`@prisma/adapter-pg`), configured from `DATABASE_URL` (see `prisma.config.ts` and `lib/prisma.ts`).

## Architecture

This is a Next.js 16 App Router app (Thai-language IT/request-approval system, "REQUESTONLINE"), backed by Prisma/Postgres, NextAuth (Credentials provider) for auth.

### Domain model (`prisma/schema.prisma`)

Central entity is `ITRequestF07` (an IT/maintenance request form), tied to `Category`, `Department`, `Location`, and a `requester` (`User`). Approval/workflow pieces:

- `WorkflowStep` — per-category, per-`stepSequence` approver role (`approverRoleName`), optionally filtered by department. Drives the multi-step email-link approval flow.
- `WorkflowTransition` / `Status` / `Action` — a fuller state-machine model (currentStatus → action → nextStatus, requiredRole) that exists in the schema but is only partially wired up; most of the app still drives status via the simpler `ITRequestF07.status` string (`PENDING`/`APPROVED`/`REJECTED`/...) plus `WorkflowStep`.
- `SpecialApproverMapping` — per-category/step override naming a specific `User` as approver instead of going by role.
- `ApprovalHistory`, `AuditLog`, `Notification` — history/audit/in-app notification trails.
- `CorrectionType` / `CorrectionReason` / `RequestCorrectionType` — "ขอแก้ไข" (correction request) classification attached to requests.
- `DocConfig` — per-category/year running-number config used to generate `workOrderNo` document numbers.

`docs/BACKEND_REFERENCE.md` and `docs/REQUEST-APPROVAL-FLOW.md` map this schema and flow back to an older Express/SQL-Server system; they describe an earlier state of the schema (e.g. claim no `Notification`/`ApprovalHistory` tables) — treat them as historical design notes, not current truth. Prefer reading `prisma/schema.prisma` and the `lib/` code directly.

### Two parallel approval paths

1. **Dashboard/API path**: `app/api/requests/[id]/action/route.ts` — single-step APPROVE/REJECT from the logged-in dashboard, updates `status` + writes `AuditLog`.
2. **Email-link path**: `app/actions/approve-action.ts` (`handleApprovalAction(token, ...)`) — multi-step, driven by `ITRequestF07.approvalToken` + `currentApprovalStep`, using `lib/workflow.ts` (`getApproverForStep`, `getFirstApproverForCategory`, `getWorkflowStepCount`) to advance through `WorkflowStep`s and email the next approver. On final step, status becomes `CLOSED`.

Request creation (`app/actions/f07-action.ts`) creates the `ITRequestF07`, issues `workOrderNo` via `DocConfig`, and emails the step-1 approver.

### Auth & role system

- NextAuth Credentials provider in `lib/auth.ts`; session JWT carries `roleName`.
- `middleware.ts` is the route gatekeeper — checks `/dashboard`, `/admin`, `/api/admin`, `/pending-tasks`, `/report`, `/request`, `/category`, `/notifications` against role lists, plus a global IP rate limit (`lib/rate-limit.ts`). It must stay Edge-runtime-safe (no Prisma/Node imports), which is why role constants live in `lib/auth-constants.ts` rather than being read from the DB.
- `lib/auth-constants.ts` is the single source of truth for role-name strings (the DB has accumulated inconsistent/typo'd role names like `'It operetor'`, `'IT Veiwer'`, Thai names like `'หน.แผนก'` — these are intentionally enumerated, not bugs to "clean up"). Key exports:
  - `allowedDashboardRoles`, `approverRoles`, `requesterRoles`, `reportRoles` — gate page access.
  - `WORKFLOW_ROLE_TO_USER_ROLES` / `getWorkflowRoleNamesForUser` / `getUserRoleNamesForWorkflowRole` / `getCanonicalRoleNamesForApprover` — translate between `WorkflowStep.approverRoleName` (canonical English names used by seed data) and the actual variety of `Role.roleName` values found in the DB, so approval-eligibility checks work despite naming drift.
  - `ROLE_HIERARCHY`, `getTabsForRole` — menu/tab visibility per role.
- `/api/admin/**` is double-guarded: middleware blocks non-Admin at the edge, and routes should still check role server-side (defense in depth).

### Layer structure

- `app/api/**` — REST-ish API routes (mostly thin; call into `lib/services/*`).
- `app/actions/**` — Next.js Server Actions (form submissions: `f07-action.ts`, `approve-action.ts`).
- `lib/services/**` — business logic (`requestService`, `approvalService`, `adminService`, `dashboardService`, `notificationService`, `emailService`, `authService`); prefer adding logic here over inline in routes/actions.
- `lib/workflow.ts` — approver-resolution logic for the multi-step workflow.
- `lib/mail.ts` + `lib/email-helper.ts` — outbound email sending (via `INTERNAL_EMAIL_API_URL`/`VITE_*` env, not SMTP directly) and HTML templates.
- `lib/prisma.ts` — singleton `PrismaClient` (pg adapter).
- `app/(main)/**` — authenticated app pages (dashboard, request CRUD, pending-tasks, profile, report, notifications), under a shared layout group.
- `app/admin/**` — Admin-only CRUD pages for master data (categories, departments, locations, roles, statuses, workflows, workflow-transitions, correction types/reasons, email templates, doc-config, users, audit logs).
- `app/approve/[token]/page.tsx` — public (token-authenticated) approval-link landing page, the entry point for the email-link approval path.

### PDF / fonts

PDF generation (`jspdf`, `pdf-lib`, `canvg`, `html2canvas`) embeds Thai fonts (`lib/noto-sans-thai-base64.ts`, `@fontsource/noto-sans-thai`) — see `docs/PDF-THAI.md` for details if touching `app/(main)/request/[id]/print` or `app/api/requests/[id]/pdf`.
