import fs from 'node:fs';
import {parseEnv} from 'node:util';
import pg from 'pg';
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const client=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});await client.connect();
try{
 const tables=(await client.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_name IN ('invitations','__drizzle_migrations','profiles') ORDER BY table_schema,table_name")).rows;
 console.log(JSON.stringify({tables,searchPath:(await client.query('SHOW search_path')).rows,publicTables:(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")).rows}));
}finally{await client.end();}
