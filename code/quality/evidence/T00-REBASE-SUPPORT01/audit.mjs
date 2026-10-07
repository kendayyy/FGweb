import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T00-REBASE-SUPPORT01',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const snapshot=JSON.parse(fs.readFileSync(`${dir}/readonly.json`));for(const [f,h]of Object.entries(snapshot))assert.equal(hash(f),h,f);
assert.equal(checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),8);
const old=execFileSync('git',['show','HEAD:code/scripts/verify-task.mjs'],{encoding:'utf8'}).replaceAll('\r\n','\n'),actual=fs.readFileSync('scripts/verify-task.mjs','utf8').replaceAll('\r\n','\n');
assert.equal(actual,old.replace("mockupAuthSha256:'../.doc/mockups/04-login-desktop-mobile.png'","mockupAuthSha256:'../.doc/mockups/04-login-desktop-mobile.png',mockupAdminSha256:'../.doc/mockups/05-admin-support-desktop.png'"));
const previous=JSON.parse(fs.readFileSync(`${dir}/previous-ledger.json`)),ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));
for(const prior of previous.tasks){const current=ledger.tasks.find(t=>t.id===prior.id);for(const field of ['status','commands','evidencePaths','outputsHash','startedAt','completedAt'])assert.deepEqual(current[field],prior[field],`${prior.id} ${field}`);if(prior.status==='PASS')assert.deepEqual(current.dependencies,prior.dependencies);}
assert.equal(ledger.tasks.find(t=>t.id==='AUTH-ADMIN-SINGLE').status,'NOT_STARTED');assert.equal(ledger.tasks.find(t=>t.id==='T36-SUPPORT-DATA').status,'NOT_STARTED');
assert.deepEqual(ledger.tasks.find(t=>t.id==='LIGHT01-FE').dependencies,['AUTH-ADMIN-SINGLE']);assert.deepEqual(ledger.tasks.find(t=>t.id==='T37').dependencies,['T36-SUPPORT-DATA']);
console.log(JSON.stringify({baselines:8,readonlyCodeFiles:Object.keys(snapshot).length,historicalTasksPreserved:previous.tasks.length,checkerChangeExactlyEighthSource:true,newPolicyOrAccountOrSupportImplemented:false}));
