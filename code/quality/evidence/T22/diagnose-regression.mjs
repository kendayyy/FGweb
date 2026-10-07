import fs from 'node:fs';
import {parseEnv} from 'node:util';
import pg from 'pg';
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const pool=new pg.Pool({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000});
try{console.log((await pool.query("SELECT pid,state,wait_event_type,wait_event,left(query,100) AS query FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() ORDER BY pid")).rows);}finally{await pool.end();}
