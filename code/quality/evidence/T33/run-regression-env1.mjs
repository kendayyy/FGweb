import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const tests=process.argv.slice(2);assert(tests.length&&tests.every(p=>/^apps\/api\/test\/[a-z0-9.-]+\.spec\.ts$/.test(p)));
const env={...process.env,...parseEnv(fs.readFileSync('.env.local','utf8')),
 FG_CRYPTO_TRANSPORT_MAX_ROWS_PER_USER:'10000',FG_CRYPTO_TRANSPORT_MAX_PAYLOAD_BYTES_PER_USER:'100000000'};
// Current AUTH02 SMTP configuration and approved QA synthetic transport budgets.
// No mail is sent by these domain regressions; no config values are printed.
assert(env.SMTP_HOST&&['465','587'].includes(env.SMTP_PORT)&&env.SMTP_USER&&env.SMTP_PASSWORD&&env.SMTP_FROM,'Current auth configuration unavailable');
const child=spawn(process.execPath,['--experimental-vm-modules','node_modules/jest/bin/jest.js','--config','apps/api/jest.config.js','--runInBand',...tests],{env,stdio:'inherit',windowsHide:true});
process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code??1));});
