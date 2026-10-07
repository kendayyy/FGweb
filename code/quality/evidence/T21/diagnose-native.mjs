import fs from 'node:fs';
import {parseEnv} from 'node:util';
import pg from 'pg';
const e=parseEnv(fs.readFileSync('.env.local','utf8'));
const pool=new pg.Pool({connectionString:e.DATABASE_URL,connectionTimeoutMillis:5000});
try{console.log((await pool.query("SELECT state,wait_event_type,wait_event,left(query,160) query FROM pg_stat_activity WHERE query LIKE '%t21%' OR state <> 'idle' ORDER BY pid")).rows);}finally{await pool.end();}
