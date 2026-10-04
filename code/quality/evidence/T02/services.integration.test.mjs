import test from 'node:test';import assert from 'node:assert/strict';import{spawnSync}from'node:child_process';
test('configured services authenticate using compatible provider endpoints',()=>{const r=spawnSync(process.execPath,['scripts/smoke-services.mjs'],{encoding:'utf8',timeout:120000});assert.equal(r.status,0,(r.stdout||'')+(r.stderr||''));});
