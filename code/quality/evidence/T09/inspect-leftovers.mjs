import pg from 'pg';
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
try {
 await client.connect();
 const rows=await client.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 't09_harness_%'");
 console.log(JSON.stringify(rows.rows));
}finally{await client.end();}
