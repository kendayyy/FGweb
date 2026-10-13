import fs from 'node:fs';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {parseEnv} from 'node:util';import {createHash} from 'node:crypto';
const d='quality/evidence/T30',env=parseEnv(fs.readFileSync('.env.local','utf8')),privateValues=Object.entries(env).filter(([k,v])=>/SECRET|TOKEN|PASSWORD|KEY|DATABASE_URL/.test(k)&&v.length>7).map(([,v])=>v);const url=new URL(env.DATABASE_URL);if(url.password)privateValues.push(decodeURIComponent(url.password));privateValues.push('T30_API_SPANS_PRIVATE_SENTINEL');
const modes=[];
for(const mode of ['normal','write-io','short-write','buffer-drop','final-health-io']){
 const child=spawn(process.execPath,[d+'/probe-api43-full1-cjs.mjs',mode],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',s=>{stdout+=s;});child.stderr.on('data',s=>{stderr+=s;});
 const timeout=setTimeout(()=>child.kill(),20000);const exitCode=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('close',code=>resolve(code??1));});clearTimeout(timeout);
 let reviewed;
 try{
  assert.equal(exitCode,0);assert.equal(stderr,'');for(const value of privateValues)assert(!stdout.includes(value));assert(!stdout.includes('SELECT ')&&!stdout.includes('pg_sleep'));
  const lines=stdout.trim().split(/\r?\n/),controls=lines.filter(s=>s.startsWith('[FG_CONTROL_RESULT] ')).map(s=>JSON.parse(s.slice('[FG_CONTROL_RESULT] '.length))),healths=lines.filter(s=>s.startsWith('[FG_API_SPANS_HEALTH] ')).map(s=>JSON.parse(s.slice('[FG_API_SPANS_HEALTH] '.length)));assert.equal(controls.length,1);assert.equal(healths.length,1);const control=controls[0],health=healths[0];assert.equal(control.ok,true);assert.equal(control.poolEnded,true);assert(control.checks.includes('actual PG SDK service after stop leave spans and sampler unchanged'));assert(control.checks.includes('concurrent distinct real PG service contexts and nested inner parent/promise/args/this identities'));
  assert(health.sampleCount>0&&health.timerStopped&&health.histogramDisabled);assert.equal(health.observationComplete,mode==='normal');if(mode==='normal')assert(health.failureCount===0&&health.droppedCount===0);else if(mode==='buffer-drop')assert(health.droppedCount>0);else assert(health.failureCount>0);
  const spans=d+'/api43-full-controls1-cjs/control-'+mode+'/api-lock-spans.jsonl';if(mode==='normal'){const bytes=fs.readFileSync(spans,'utf8');for(const value of privateValues)assert(!bytes.includes(value));assert(!bytes.includes('SELECT ')&&!bytes.includes('pg_sleep'));for(const line of bytes.trim().split(/\r?\n/))JSON.parse(line);}
  reviewed={mode,exitCode,health,checks:control.checks,poolEnded:true,privacyReviewed:true};
 }catch{reviewed={mode,exitCode,controlAccepted:false,reason:'Controlled output, identity, privacy, health or cleanup assertion failed'};process.exitCode=1;}
 modes.push(reviewed);if(process.exitCode)break;
}
const review={recordedAt:new Date().toISOString(),modes,helperSha256:createHash('sha256').update(fs.readFileSync(d+'/api43-observer-reviewed1.mjs')).digest('hex'),nativeAcceptance:false};fs.writeFileSync(d+'/api43-full-controls-review1-cjs.json',JSON.stringify(review,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(review));
