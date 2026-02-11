
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    await client.connect();
    const res = await client.query(`SELECT id, code, "displayName" FROM "Status" ORDER BY id;`);
    console.table(res.rows);
    await client.end();
}

main().catch(e => console.error(e));
