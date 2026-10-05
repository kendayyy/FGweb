import pg from 'pg';
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try {
  const schemas=(await client.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 't16_%'")).rows;
  console.log(JSON.stringify(schemas));
  for(const {nspname} of schemas) {
    if(!/^t16_[0-9]+_[a-z0-9]+$/.test(nspname))continue;
    console.log(JSON.stringify({schema:nspname,createdAt:new Date(Number(nspname.split('_')[1])).toISOString(),tables:(await client.query('SELECT table_name FROM information_schema.tables WHERE table_schema=$1',[nspname])).rows}));
  }
}finally{await client.end();}
