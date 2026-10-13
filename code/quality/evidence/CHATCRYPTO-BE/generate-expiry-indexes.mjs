import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
assert(!fs.existsSync('packages/database/migrations/0021_chat_crypto_expiry_indexes.sql'));
const result=spawnSync(process.execPath,['../../node_modules/drizzle-kit/bin.cjs','generate','--name','chat_crypto_expiry_indexes'],{cwd:'packages/database',windowsHide:true,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status===0){assert(fs.existsSync('packages/database/migrations/0021_chat_crypto_expiry_indexes.sql'));assert(fs.existsSync('packages/database/migrations/meta/0021_snapshot.json'));}
process.exitCode=result.status??1;
