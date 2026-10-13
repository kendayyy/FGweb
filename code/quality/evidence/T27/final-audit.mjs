import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T27',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function audit(){
 const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='T27'),before=JSON.parse(fs.readFileSync(`${dir}/before.json`)),seal=JSON.parse(fs.readFileSync(`${dir}/entry-seal.json`));
 assert.equal(task.status,'IN_PROGRESS');assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,'T27');
 checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))});
 const allowed=p=>task.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
 for(const [p,h]of Object.entries(before.readonly))if(!allowed(p))assert.equal(hash(p),h,`Readonly changed: ${p}`);
 for(const [p,h]of Object.entries(seal.paths))assert.equal(hash(p),h,`Opening evidence changed: ${p}`);
 const latest=new Map();for(const old of before.historical){assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old);for(const [p,h]of Object.entries(old.outputsHash?.files??{}))latest.set(p,h);}
 for(const [p,h]of latest)if(!allowed(p))assert.equal(hash(p),h,`Prior output changed: ${p}`);
 const child=ledger.followups.find(t=>t.id==='T01-FIX3');assert.equal(child.status,'PASS');for(const [p,h]of Object.entries(child.outputsHash.files))assert.equal(hash(p),h);
 assert.equal(hash('.env.local'),before.configuration.env);
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p)&&p!=='quality/tasks.json'&&!p.startsWith('.runtime/')&&!p.startsWith('.cache/'));
 for(const p of files.filter(p=>!allowed(p)))assert(Object.hasOwn(before.readonly,p),`New outside scope: ${p}`);
 for(const p of fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p))){const r=JSON.parse(fs.readFileSync(`${dir}/${p}`));assert.equal(hash(r.evidencePath),r.evidenceSha256,`Evidence changed: ${p}`);}
 const rtc=JSON.parse(fs.readFileSync(`${dir}/gateway-rtc-1/result.json`));
 for(const k of ['headed','privateSfuSignaling','senderConnected','receiverConnected','nativeAudioTrack','reconnectSameIdentity','reconnectSingleSeat','revokedDisconnected','replayBlocked','newAdmissionConnected','webRTCVerified','ownedSchemaRemoved','containersRemoved'])assert.equal(rtc[k],true,k);
 assert(rtc.inboundAudioBytes>0);assert.equal(rtc.playSlots,0);
 const privateValues=Object.entries(parseEnv(fs.readFileSync('.env.local','utf8'))).filter(([name,value])=>/(SECRET|PASSWORD|TOKEN|DATABASE_URL|REDIS_URL|SMTP_USER|SMTP_FROM)/i.test(name)&&value.length>=8).map(([,value])=>value);
 const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${p}/${e.name}`):[`${p}/${e.name}`]);
 for(const p of [...walk(dir),...files.filter(p=>allowed(p)&&p.startsWith('apps/api/src/'))])for(const v of privateValues)assert(!fs.readFileSync(p).includes(Buffer.from(v)),`Secret in ${p}`);
 const fixtures=fs.readdirSync('.runtime/t27').filter(n=>n.startsWith('gateway-')).map(n=>`.runtime/t27/${n}`);
 for(const p of fixtures){assert(fs.existsSync(`${p}/cleanup.json`),`Fixture cleanup missing: ${p}`);const c=JSON.parse(fs.readFileSync(`${p}/cleanup.json`));assert.equal(c.containersRemoved,true);assert.equal(c.networkRemoved,true);}
 return {recordedAt:new Date().toISOString(),task:'T27',readonlyFiles:Object.keys(before.readonly).length,historicalPassRecords:before.historical.length,baselineHashesUnchanged:8,environmentUnchanged:true,secretsScan:'PASS',ownedFixturesCleaned:fixtures.length,headedWebRTC:true,inboundAudioBytes:rtc.inboundAudioBytes,reconnectSameIdentity:true,reconnectSingleSeat:true,mediaLoad1000Verified:false,audibleQualityVerified:false,productionTurnTlsVerified:false};
}
if(process.argv[1]?.endsWith('final-audit.mjs')){const report=audit();fs.writeFileSync(`${dir}/final-audit.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
