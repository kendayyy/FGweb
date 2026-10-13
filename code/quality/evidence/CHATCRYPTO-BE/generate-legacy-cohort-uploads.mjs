import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
assert(!fs.existsSync('packages/database/migrations/0019_chat_crypto_cohort_uploads.sql'));
const result=spawnSync(process.execPath,['../../node_modules/drizzle-kit/bin.cjs','generate','--name','chat_crypto_cohort_uploads'],{cwd:'packages/database',windowsHide:true,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status===0){assert(fs.existsSync('packages/database/migrations/0019_chat_crypto_cohort_uploads.sql'),'Generator returned zero but did not produce the requested migration');assert(fs.existsSync('packages/database/migrations/meta/0019_snapshot.json'),'Generated snapshot missing');}
process.exitCode=result.status??1;
