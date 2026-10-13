import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const d='quality/evidence/T30',p=process.argv[2];
assert(p?.startsWith(d+'/') && p.endsWith('.cjs'));
const source=fs.readFileSync(p,'utf8'),checks=[];
function run(failStage=null,writeMode='complete') {
 const writes=[],calls=[],sentinel=Object.assign(new Error('PRIVATE_ERROR_URL_TOKEN'),{code:'PRIVATE_ERROR_CODE'});
 let now=100, thrown=null;
 const originalArgv=['node','/gateway/startup-entry.cjs','/gateway/input.json'];
 const context={Buffer,Date,process:{argv:originalArgv},require(target){
  if(target==='node:fs')return {writeSync(fd,bytes,offset=0,length=bytes.length){assert.equal(fd,1);const b=Buffer.from(bytes).subarray(offset,offset+length);if(writeMode==='zero')return 0;if(writeMode==='partial'){writes.push(b.subarray(0,1).toString());return 1;}writes.push(b.toString());return b.length;}};
  if(target==='node:perf_hooks')return {performance:{now(){return now+=1;}}};
  assert(['/gateway/preload.cjs','/gateway/app/gateway-main.js'].includes(target),'Unexpected import');calls.push(target);assert.equal(originalArgv[2],'/gateway/input.json');
  if(target===failStage)throw sentinel;
  return {};
 }};
 try{vm.runInNewContext(source,context,{timeout:1000});}catch(e){thrown=e;}
 const output=writes.join(''),rows=[];let parseComplete=true;for(const line of output.split(/\r?\n/).filter(Boolean)){try{assert(line.startsWith('[FG_GATEWAY_STARTUP] '));rows.push(JSON.parse(line.slice('[FG_GATEWAY_STARTUP] '.length)));}catch{parseComplete=false;}}if(!thrown)assert(parseComplete);
 assert(!output.includes('PRIVATE_ERROR_URL_TOKEN')&&!output.includes('PRIVATE_ERROR_CODE')&&!output.includes('/gateway/input.json'));
 assert(rows.length<=8);for(const line of output.split('\n'))assert(Buffer.byteLength(line)<=1024);
 return {calls,rows,thrown,sentinel,output,parseComplete};
}
const good=run();assert.equal(good.thrown,null);assert.deepEqual(good.calls,['/gateway/preload.cjs','/gateway/app/gateway-main.js']);assert(!good.output.includes('Private media admission gateway ready'));checks.push('original preload then main exact imports and argv2; no fabricated readiness');
for(const stage of ['/gateway/preload.cjs','/gateway/app/gateway-main.js']){const r=run(stage);assert.equal(r.thrown,r.sentinel);assert.equal(r.calls.at(-1),stage);if(stage.endsWith('preload.cjs'))assert.equal(r.calls.length,1);checks.push(stage.endsWith('preload.cjs')?'preload error identity preserved; main never invoked':'main error identity preserved');}
const zero=run(null,'zero');assert(zero.thrown);assert.equal(zero.calls.length,0);checks.push('zero-byte diagnostic output fails before any original import');
// Partial output must terminate with a diagnostic error or finish complete JSON;
// a bounded loop may finish at most 8 KiB within VM deadline.
const partial=run(null,'partial');assert(partial.thrown===null||typeof partial.thrown==='object');if(partial.thrown===null){assert.equal(partial.calls.length,2);assert(partial.rows.length>0&&partial.parseComplete);}else assert.equal(partial.calls.length,0);checks.push('partial write is bounded and never accepted as malformed complete JSON');
const proof={reviewedAt:new Date().toISOString(),source:{path:p,sha256:createHash('sha256').update(source).digest('hex')},checks,simulatedOnly:true,realGatewayReadiness:false,nativeAcceptance:false};
fs.writeFileSync(d+'/startup-entry-controls-review1.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(proof));
