# SQL Server migration runbook

## Current finding

The application datasource is SQL Server, but the original migration was generated for PostgreSQL. Do not run `prisma migrate deploy` against the current migration directory until the baseline has been replaced or the existing database has been explicitly baselined.

The dev database currently has the `DocConfig_categoryId_year_key` unique index applied by the idempotent script in `prisma/sqlserver/`.

The approval-round change is provided as the idempotent script
`prisma/migrations/add_approval_round.sql`. Apply it in staging/production through
SSMS (after backup and the preflight below), then run `npx prisma generate` for
the application build. It adds `approvalRound = 1` to existing requests and
history rows and creates an index for current-round checks; it does not delete
historical approval data.

## Known local blocker

The application connects through `@prisma/adapter-mssql`, but Prisma's native migration engine on this Windows machine fails during the SQL Server TLS handshake with `P1011` (`No credentials are available in the security package`). This occurs with both SQL Authentication and Windows Authentication, and with `encrypt=true` or `encrypt=false`; `encrypt=false` still protects the login exchange according to Prisma's SQL Server connection behavior.

Do not work around this by using plaintext TLS settings. Run Prisma migration commands from a trusted Linux/WSL/CI runner with the same environment, or review and apply an explicit SQL migration through SSMS. Do not run the pending `20260202035330_init` migration against the existing database until it has been baselined.

## Required preflight

1. Stop the application and take a SQL Server full backup.
2. Run the following checks using a read-only database account:

```sql
SELECT categoryId, year, COUNT(*) AS duplicateCount
FROM dbo.DocConfig
GROUP BY categoryId, year
HAVING COUNT(*) > 1;

SELECT workOrderNo, COUNT(*) AS duplicateCount
FROM dbo.ITRequestF07
WHERE workOrderNo IS NOT NULL
GROUP BY workOrderNo
HAVING COUNT(*) > 1;

SELECT approvalToken, COUNT(*) AS duplicateCount
FROM dbo.ITRequestF07
WHERE approvalToken IS NOT NULL
GROUP BY approvalToken
HAVING COUNT(*) > 1;
```

All three queries must return zero rows before adding unique constraints.

## Baseline procedure

1. Generate the SQL Server baseline from the current schema:

```powershell
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script -o prisma/sqlserver-baseline.sql
```

2. Review the generated SQL and compare table/column names with the existing database.
3. For a new database, apply the baseline script and then run:

```powershell
npx prisma db seed
```

4. For an existing database, record the current schema version with `prisma migrate resolve` only after the backup, duplicate checks, and manual schema comparison are complete.
5. Run `npx prisma migrate status` and `npx prisma migrate deploy` in a staging database before production.

## Required database settings (found by load testing at 30k rows)

These are **not** optional at production data volumes. With ~30,000 requests the
E2E suite failed with `Timeout: Request failed to complete in 30000ms` on
`GET /api/requests` until both were in place; afterwards the full suite passed.
At the ~4 rows a fresh dev database carries, neither problem is visible.

1. **`READ_COMMITTED_SNAPSHOT ON`** — approvals run in `SERIALIZABLE`
   transactions (`lib/services/approvalService.ts`). Without row versioning,
   readers can wait on those writers instead of reading a consistent snapshot.

```powershell
npx tsx scripts/enable-rcsi.ts          # ALTER DATABASE ... SET READ_COMMITTED_SNAPSHOT ON
npx tsx scripts/enable-rcsi.ts --off    # revert
```

   It briefly disconnects other sessions (`WITH ROLLBACK IMMEDIATE`), so run it
   in a maintenance window. Confirm with:

```sql
SELECT is_read_committed_snapshot_on FROM sys.databases WHERE name = 'requestonline';
```

2. **Connection pool size** — the `mssql` driver defaults to `pool.max = 10`,
   which starves under concurrent users and surfaces as the misleading
   `Failed to connect to <server>:1433 in 15000ms`. `lib/mssql-config.ts` now
   defaults to 25 and reads these env overrides, to be tuned during load tests:

```
MSSQL_POOL_MAX=25
MSSQL_POOL_MIN=2
MSSQL_POOL_IDLE_MS=30000
MSSQL_CONNECTION_TIMEOUT_MS=15000
MSSQL_REQUEST_TIMEOUT_MS=30000
```

3. **Document numbering must not read before it writes.** `generateRequestNumber`
   increments `DocConfig` with a single `UPDATE ... OUTPUT`. Do not reintroduce a
   `SELECT` before the `UPDATE`: under `SERIALIZABLE` that makes two concurrent
   submissions take shared locks on the same row and then both request an
   exclusive lock — a lock-upgrade deadlock. Measured with 5 simultaneous
   submissions: **11.7 s median and 27% failures before, 42 ms and 0% after**.
   Guarded by `npm run test:db` (needs a live database, skipped by `npm test`):
   it fires 20 concurrent `generateRequestNumber` calls and requires zero
   failures plus a gap-free run of numbers. Confirmed to fail on the old
   implementation — **17 of 20 deadlocked**.

### Load test

```powershell
npx tsx scripts/load-test.ts --setup 60                # create loaduser_* accounts
npx tsx scripts/load-test.ts --users 60 --seconds 45   # HTTP read load
npx tsx scripts/load-test.ts --write-bench 20 --rounds 3   # DocConfig contention
npx tsx scripts/load-test.ts --clean                   # remove accounts + requests
```

Measured on one machine running SQL Server, Next.js and the generator together,
so these are a floor, not a ceiling:

| concurrent users | throughput | p95 | errors | 429s |
|---|---|---|---|---|
| 10 | 26.5 req/s | 40 ms | 0 | 0 |
| 30 | 78.3 req/s | 63 ms | 0 | 0 |
| 60 | 128.0 req/s | 303 ms | 0 | 0 |

Writes after the numbering fix: 20 simultaneous submissions, p50 116 ms, no
failures, no duplicate document numbers.

### Measuring again

```powershell
npx tsx scripts/perf-check.ts --seed 30000   # seed ~2 years of data, then benchmark
npx tsx scripts/perf-check.ts                # benchmark existing data
npx tsx scripts/perf-check.ts --clean        # remove every seeded row
```

Seeded rows are tagged `LOADTEST` in `problemDetail`/`workOrderNo`, so `--clean`
removes them exactly without touching real data. Benchmark the *second* run:
the first pass over a freshly bulk-loaded table reads cold pages and is not
representative.

## Backup and restore drill

A successful backup is not a recoverable backup. Prove it by restoring.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restore-drill.ps1
powershell -ExecutionPolicy Bypass -File scripts/restore-drill.ps1 -Cleanup
```

The drill never touches the live database: it backs up (read-only), restores to
`requestonline_drill`, runs `DBCC CHECKDB`, and compares row counts table by
table. It needs a login with `sysadmin`; Windows auth (`sqlcmd -E`) is enough.

Then do the step most drills skip — prove the restored data actually *runs*:

```powershell
$env:MSSQL_DATABASE='requestonline_drill'; npm run start
$env:TEST_BASE_URL='http://localhost:3000'; npm run test:e2e
```

**Result of the first drill (2026-09-03), 208 MB database:**

| Step | Time |
|---|---|
| Full backup (compressed to 3.6 MB) | 0.2 s |
| Restore to a new database | 0.8 s |
| `DBCC CHECKDB` | 0.4 s |
| **Database RTO** | **< 2 s** |

All 23 tables matched row-for-row, and the E2E suite passed 35/36 against the
restored copy (the one failure passed on its own — the machine-load flake noted
in the E2E runbook). `READ_COMMITTED_SNAPSHOT` survives the backup, so a
restored database keeps it without re-running `scripts/enable-rcsi.ts`.

Re-run the drill quarterly and after any schema migration, and record the timings.

### Scheduled backups (live as of 2026-09-03)

Backups run from **Windows Task Scheduler**, not SQL Server Agent: the Agent
service on this machine is `Stopped` / `Manual` and starting it needs an
elevated session. `schtasks` does not.

| Task | Schedule | Command |
|---|---|---|
| `RequestOnline - Full Backup` | daily 01:00 | `scripts/backup-job.ps1 -Mode Full` |
| `RequestOnline - Log Backup` | every 15 min | `scripts/backup-job.ps1 -Mode Log` |

Files land in `D:\SQLBackup` (granted to `NT SERVICE\MSSQLSERVER`), with a
14-day retention sweep and an append-only log at `D:\SQLBackup\backup-job.log`.
The database is in `FULL` recovery, so **log backups are not optional** —
without them the transaction log grows until the disk fills. Every 15 minutes
sets the RPO: at most 15 minutes of work can be lost.

Verified end to end: both tasks ran on demand with `LastTaskResult = 0`, wrote
real files, and a full backup plus its log chain restored cleanly into a scratch
database that returned the expected row counts. `scripts/backup-database.sql`
carries the same statements for the day the Agent is enabled, plus a health
query that returns rows **only** when a backup is late — wire that to an alert.

**Two limitations to close before this counts as production-grade:**

1. The tasks were created without stored credentials, so they run **only while a
   user is logged on**. This PC stays logged in as a server, but a reboot with
   no login means no backups. Fix by enabling SQL Server Agent once, as an
   administrator, and moving both jobs there:
   `Start-Service SQLSERVERAGENT; Set-Service SQLSERVERAGENT -StartupType Automatic`
2. Nothing alerts when a backup fails — the failure is only visible in the log
   file. Point a monitor at `/api/health` and at the backup health query.

## Verification

- `npx prisma migrate status` succeeds using the SQL Server datasource from the selected migration runner.
- `READ_COMMITTED_SNAPSHOT` is ON and the pool env vars above are set.
- Application startup and Prisma queries succeed.
- Unique `(categoryId, year)` exists on `DocConfig`.
- Request creation, approval, audit logging, and restore verification pass.
- Backup and restore timings are recorded in the release ticket.

Never use `db push --force-reset` against staging or production.
