import fs from 'node:fs';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const d='quality/evidence/T30',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const build=JSON.parse(fs.readFileSync(d+'/api-build-11-review.json','utf8'));for(const change of build.compiledChanges)assert.equal(hash(change.path),change.afterSha256);
const cascade=JSON.parse(fs.readFileSync(d+'/codex-t30-cascade-empty-call-green-4.json','utf8'));assert.equal(cascade.exitCode,0);
const steps=[
 {label:'t30-frame-lease-policy-green-2',args:['node',d+'/run-frame-lease-policy3.mjs'],tests:11,headed:false},
 {label:'t30-frozen-call-regressions-8',args:['node',d+'/run-backend-regressions.mjs','call-admission','call-gateway','call-controls'],tests:39,headed:false},
 {label:'t30-frozen-publishing-regressions-6',args:['node',d+'/run-backend-regressions-with-team-play.mjs','publishing','publishing-gateway'],tests:27,headed:true}
];
for(const step of steps){
 fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — build11 sequential guard entry '+new Date().toISOString()+': '+step.label+'; original immutable guard suite, actual current source/build11, headed='+step.headed+'; publishing browser synthetic SDK photos/Telegram required and separate from native getDisplayMedia acceptance. No parallel tests/no Anti2/no T31/IN_PROGRESS.\n');
 const child=spawn(process.execPath,[d+'/record.mjs',step.label,...step.args],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','inherit','inherit']});
 const exitCode=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('close',code=>resolve(code??1));});
 const record=JSON.parse(fs.readFileSync(d+'/codex-'+step.label+'.json','utf8'));assert.equal(record.exitCode,exitCode);assert.equal(hash(record.evidencePath),record.evidenceSha256);
 const log=fs.readFileSync(record.evidencePath,'utf8'),countVerified=exitCode===0&&log.includes(step.tests+' passed, '+step.tests+' total');
 fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — build11 sequential guard result '+new Date().toISOString()+': '+record.startedAt+'–'+record.completedAt+' exit'+exitCode+', expected'+step.tests+'tests countVerified='+countVerified+'. Evidence code/'+d+'/codex-'+step.label+'.json; new headed publishing photo/root/Telegram/cleanup review separately required, no fullnativePASS/IN_PROGRESS/80priorPASS unchanged/no Anti2/no T31.\n');
 assert.equal(exitCode,0,'Actual guard failure; stop sequential queue');assert(countVerified,'Unexpected test count');
}
console.log('All three sequential current-build11 guard suites exited0; publishing photo review pending.');
