import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const dir='quality/evidence/AUTH02-FE',file='apps/web/test/auth-email.test.tsx';
const old="it('clears password inputs when the account identity changes on the same settings route',async()=>{vi.spyOn(globalThis,'fetch').mockResolvedValue(respond({hasPassword:true}));";
const replacement="it('clears password inputs when the account identity changes on the same settings route',async()=>{vi.spyOn(globalThis,'fetch').mockImplementation(async()=>respond({hasPassword:true}));";
const text=fs.readFileSync(file,'utf8');assert(text.includes(old));fs.writeFileSync(file,text.replace(old,replacement));
const app='apps/web/src/App.tsx',fixed=fs.readFileSync(app),original=fixed.toString().replace("<PasswordSettingsPage key={user?.id??'guest'} />",'<PasswordSettingsPage />');assert(original!==fixed.toString());
let result;try{fs.writeFileSync(app,original);result=spawnSync(process.execPath,[`${dir}/record.mjs`,'red-4','node','node_modules/vitest/vitest.mjs','run','--root','apps/web','test/auth-email.test.tsx','-t','account identity changes','--maxWorkers','1'],{stdio:'inherit'});}finally{fs.writeFileSync(app,fixed);}
assert.equal(result.status,1);assert(fs.readFileSync(`${dir}/codex-red-4.txt`,'utf8').includes('previous private input'),'RED must show the retained prior input');
const verify=`${dir}/verify-last.mjs`;fs.writeFileSync(verify,fs.readFileSync(verify,'utf8').replace("'regression-4'","'regression-5'"));
console.log('Fresh response per request in fixture; genuine account-input RED confirmed; production fix restored byte-exact.');
