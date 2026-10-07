import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(item=>item.id==='T02-OAUTH-FIX1');
assert.equal(checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),8);
const allow=file=>task.writeAllowlist.some(pattern=>pattern.endsWith('/**')?file.startsWith(pattern.slice(0,-2)):file===pattern);
const latest=new Map();for(const previous of ledger.tasks.slice(0,ledger.tasks.indexOf(task))){assert.equal(previous.status,'PASS');for(const [file,sha] of Object.entries(previous.outputsHash?.files??{}))latest.set(file,sha);}
let frozen=0;for(const [file,sha] of latest)if(!allow(file)){assert.equal(hash(file),sha,file);frozen++;}
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
assert.equal(env.PUBLIC_ORIGIN,'http://localhost:18080');assert.equal(env.BETTER_AUTH_URL,env.PUBLIC_ORIGIN);
const other=Object.fromEntries(Object.entries(env).filter(([key])=>!['PUBLIC_ORIGIN','BETTER_AUTH_URL'].includes(key)));
assert.equal(createHash('sha256').update(JSON.stringify(other)).digest('hex'),task.inputsHash.otherEnvFields,'Other secret/service/admin values changed');
const sensitive=Object.entries(env).filter(([key,value])=>/(SECRET|PASSWORD|PRIVATE_KEY)/.test(key)&&value&&value.length>=8).map(([,value])=>value);
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${directory}/${entry.name}`):[`${directory}/${entry.name}`]);
for(const file of [...walk('quality/evidence/T02-OAUTH-FIX1'),'quality/provider-config-confirmation.json','apps/web/vite.config.ts','scripts/smoke-services.mjs'])assert(!sensitive.some(value=>fs.readFileSync(file).includes(Buffer.from(value))),'Private value leaked;path omitted');
console.log(JSON.stringify({baselines:8,frozenOutsideOwnerFiles:frozen,localOriginConsistent:true,otherPrivateFieldsPreserved:true,privateValuesLeaked:false}));
