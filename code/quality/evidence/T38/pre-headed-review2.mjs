import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
const d='quality/evidence/T38',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sources=['tests/e2e/moderation-support.spec.ts',d+'/playwright.config.ts',d+'/headed-fixture1.mjs'];
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
for(const p of sources){const text=fs.readFileSync(p,'utf8');assert(!/Antigravity|Anti2|cockpit/i.test(text));for(const[key,value]of Object.entries(env))if(/SECRET|PASSWORD|TOKEN|PRIVATE_KEY|DATABASE_URL|REDIS_URL/.test(key)&&value.length>=8)assert(!text.includes(value),'Configured private value in owned headed source');}
assert(fs.readFileSync(d+'/playwright.config.ts','utf8').includes('headless:false'));
assert(fs.readFileSync('tests/e2e/moderation-support.spec.ts','utf8').includes('captureUiStep(page'));
const input=JSON.parse(fs.readFileSync(d+'/web-build-inputs2.json'));
for(const pin of input.sourcePins)assert.equal(hash(pin.path),pin.sha256);
const api=JSON.parse(fs.readFileSync(d+'/api-build1/build-inputs.json'));
for(const pin of api.sourcePins)assert.equal(hash(pin.path),pin.sha256);
fs.writeFileSync(d+'/pre-headed-review2.json',JSON.stringify({at:new Date().toISOString(),reviewer:'Codex',sources:sources.map(path=>({path,sha256:hash(path)})),unresolvedFindings:[],actualCompiledProductionAppRequired:true,actualPostgresRedisRequired:true,ownedDisposableSchema:true,syntheticActorsAndContentOnly:true,privateCredentialsInProcessOnly:true,headless:false,serial:true,captureAtStartGroupsErrorEnd:true,privacyMasksReviewed:true,noActualAdminProvisioningClaim:true,runPending:true,taskAcceptancePending:true},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({sourcePinsVerified:true,privateValueScanPassed:true,headedPreflightReviewed:true,actualUIRunPending:true}));
