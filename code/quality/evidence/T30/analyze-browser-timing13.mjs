import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T30',b=d+'/t30-native-4cb56ca3e22841e2964400170d6611a1';const rows=n=>fs.readFileSync(b+'/'+n,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),j=n=>JSON.parse(fs.readFileSync(b+'/'+n));
const health=j('pg-blocking-health.json');assert.equal(health.failureCount,0);assert.equal(health.droppedCount,0);assert(health.actualClientEnded&&health.readonly&&health.timerStopped);
const timings=rows('owned-room-timing.jsonl'),owner=new Map();for(const r of timings.filter(x=>x.type==='pool'))for(const pid of r.pids)owner.set(pid,r.service);
const lines=fs.readFileSync(b+'/media-diagnostics.txt','utf8').split('\n'),prefix='[FG_GATEWAY_OBSERVER] ',pg=lines.filter(l=>l.startsWith(prefix)).map(l=>JSON.parse(l.slice(prefix.length)));for(const r of pg)if(r.backendPid)owner.set(r.backendPid,'SignalingGateway');
const blocks=rows('pg-blocking.jsonl').flatMap(s=>s.rows.map(r=>({...r,at:s.at,owner:owner.get(r.pid)||'Unmapped',blockerOwners:r.blockers.map(pid=>({pid,owner:owner.get(pid)||'Unmapped'}))})));const blocked=blocks.filter(x=>x.blockers.length);
const pairs={};for(const r of blocked)for(const bo of r.blockerOwners){const key=r.owner+' <- '+bo.owner;const x=pairs[key]??={count:0,maxTransactionMs:0};x.count++;x.maxTransactionMs=Math.max(x.maxTransactionMs,r.transactionMs||0);}
const firstFailures=pg.filter(x=>x.ok===false).slice(0,12),failureWindow=blocks.filter(x=>x.at>='2026-10-13T03:12:40Z'&&x.at<'2026-10-13T03:13:25Z');
const result={at:new Date().toISOString(),health,pairs,firstFailures,failureWindow,slowMethods:timings.filter(x=>x.type==='finish'&&x.durationMs>2000),ownerPids:Object.fromEntries(owner)};
fs.writeFileSync(d+'/browser-timing13-lock-analysis1.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({pairs,firstFailures,window:failureWindow.filter(x=>x.blockers.length).slice(0,25)},null,2));
