import pg from 'pg';
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:10000});
await client.connect();
try {
  const schemas=await client.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 't08_fix1_%' OR nspname LIKE 't12_fix1_%' OR nspname LIKE 't18_%' ORDER BY nspname");
  console.log(JSON.stringify({schemaNames:schemas.rows.map(r=>r.nspname),readOnly:true}));
}finally{await client.end();}
