
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    await client.connect();
    const res = await client.query('SELECT * FROM "Status" WHERE id = 1');
    console.log('Status ID 1:', res.rows[0]);

    if (res.rows[0]) {
        const code = res.rows[0].code;
        console.log(`Fixing requests with currentStatusId=1 to have status='${code}'...`);
        const upd = await client.query(`
        UPDATE "ITRequestF07" 
        SET status = $1 
        WHERE "currentStatusId" = 1 AND status != $1
      `, [code]);
        console.log(`Updated ${upd.rowCount} rows.`);
    }
    await client.end();
}

main().catch(e => console.error(e));
