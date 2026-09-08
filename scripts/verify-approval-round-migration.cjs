// Default: exercise the exact migration on isolated tables and roll back.
// --apply: additionally make/verify a COPY_ONLY backup, then migrate dbo.
require('dotenv').config({ quiet: true });
const sql = require('mssql');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const migration = fs.readFileSync(path.join(__dirname, '../prisma/migrations/add_approval_round.sql'), 'utf8');
const ident = value => `[${value.replaceAll(']', ']]')}]`;
const literal = value => `N'${value.replaceAll("'", "''")}'`;

async function main() {
  const pool = await new sql.ConnectionPool({
    server: process.env.MSSQL_SERVER || 'localhost', port: Number(process.env.MSSQL_PORT || 1433),
    database: process.env.MSSQL_DATABASE || 'requestonline',
    user: process.env.MSSQL_USER, password: process.env.MSSQL_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true },
    connectionTimeout: 10000, requestTimeout: 120000,
  }).connect();
  try {
    const schema = `approval_round_verify_${Date.now()}`;
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).batch(`CREATE SCHEMA ${ident(schema)}`);
      await new sql.Request(tx).batch(`
        CREATE TABLE ${ident(schema)}.ITRequestF07 (id int PRIMARY KEY, updatedAt datetime2 NOT NULL);
        CREATE TABLE ${ident(schema)}.ApprovalHistory (id int PRIMARY KEY, requestId int, approvalLevel decimal(32,16), comment nvarchar(100));
        INSERT INTO ${ident(schema)}.ITRequestF07 VALUES (1, '2026-01-01');
        INSERT INTO ${ident(schema)}.ApprovalHistory VALUES (1, 1, 1, N'preserve history');
      `);
      const isolated = migration.replaceAll('dbo.', `${schema}.`);
      await new sql.Request(tx).batch(isolated);
      await new sql.Request(tx).batch(isolated);
      const rows = (await new sql.Request(tx).query(`
        SELECT r.approvalRound AS requestRound, h.approvalRound AS historyRound, h.comment
        FROM ${ident(schema)}.ITRequestF07 r JOIN ${ident(schema)}.ApprovalHistory h ON h.requestId = r.id;
        SELECT COUNT(*) AS n FROM sys.indexes WHERE object_id = OBJECT_ID('${schema}.ApprovalHistory')
        AND name = 'ApprovalHistory_request_round_level_idx';
      `)).recordsets;
      assert.deepEqual(rows[0], [{ requestRound: 1, historyRound: 1, comment: 'preserve history' }]);
      assert.equal(rows[1][0].n, 1);
      const result = await new sql.Request(tx).batch(`
        UPDATE ${ident(schema)}.ITRequestF07 SET updatedAt = '2026-01-02'
          WHERE id=1 AND updatedAt='2026-01-01' AND approvalRound=1;
        SELECT @@ROWCOUNT AS firstWrite;
        UPDATE ${ident(schema)}.ITRequestF07 SET updatedAt = '2026-01-03'
          WHERE id=1 AND updatedAt='2026-01-01' AND approvalRound=1;
        SELECT @@ROWCOUNT AS staleWrite;
      `);
      assert.equal(result.recordsets[0][0].firstWrite, 1);
      assert.equal(result.recordsets[1][0].staleWrite, 0);
      console.log('PASS: fresh migration, repeat migration, preserved history, index, stale version rejection');
    } finally {
      // Only the unique test schema/tables were touched; never migrate dbo in this transaction.
      try { await tx.rollback(); } catch (error) { if (error.code !== 'ENOTBEGUN') throw error; }
    }
    assert.equal((await pool.request().input('schema', schema)
      .query('SELECT COUNT(*) AS n FROM sys.schemas WHERE name=@schema')).recordset[0].n, 0);
    console.log('PASS: isolated test schema rolled back');

    if (process.argv.includes('--apply')) {
      const info = (await pool.request().query(`SELECT DB_NAME() AS db,
        CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000)) AS backupDir`)).recordset[0];
      if (!info.backupDir) throw new Error('Backup directory unavailable; dbo migration not applied');
      const backup = path.win32.join(info.backupDir, `${info.db}_before_approval_round_${Date.now()}.bak`);
      await pool.request().batch(`BACKUP DATABASE ${ident(info.db)} TO DISK = ${literal(backup)} WITH COPY_ONLY, CHECKSUM`);
      await pool.request().batch(`RESTORE VERIFYONLY FROM DISK = ${literal(backup)} WITH CHECKSUM`);
      console.log(`PASS: backup verified: ${backup}`);
      await pool.request().batch(migration);
      const columns = (await pool.request().query(`
        SELECT COL_LENGTH('dbo.ITRequestF07','approvalRound') AS requestColumn,
          COL_LENGTH('dbo.ApprovalHistory','approvalRound') AS historyColumn;
        SELECT TOP (0) approvalRound FROM dbo.ITRequestF07;
        SELECT TOP (0) approvalRound FROM dbo.ApprovalHistory;
      `)).recordsets[0][0];
      assert.equal(columns.requestColumn, 4);
      assert.equal(columns.historyColumn, 4);
      console.log('PASS: dbo migration applied and both columns query successfully');
    }
  } finally { await pool.close(); }
}
main().catch(error => {
  console.error(error.message);
  for (const previous of error.precedingErrors || []) console.error(previous.message);
  process.exitCode = 1;
});
