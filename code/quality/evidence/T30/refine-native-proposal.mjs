import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const source='quality/evidence/T30/screen-share-native.proposed.ts',target='quality/evidence/T30/screen-share-native-v2.proposed.ts',original=fs.readFileSync(source,'utf8');
let s=original;
function replace(before,after){assert(s.includes(before));s=s.replace(before,after);}
replace("code===0?resolve():reject(Error('Owned fixture cleanup failed'));","if(code===0)resolve();else reject(Error('Owned fixture cleanup failed'));");
replace("value.failed?reject(Error('Native observation failed')):resolve(value);","if(value.failed)reject(Error('Native observation failed'));else resolve(value);");
replace("const shapedPolicy={bitsPerSecond:640000,delayMs:25};","const transportBefore=await ask('shaping-stats');const baselineAudio=delta(before,baseline).filter(r=>r.kind==='audio'&&r.packetsDelta>100);expect(baselineAudio.length).toBeGreaterThan(0);const shapedPolicy={bitsPerSecond:640000,delayMs:25};");
replace("const transport=await ask('shaping-stats');fs.writeFileSync", "const transport=await ask('shaping-stats');expect(shaped.at-baseline.at).toBeGreaterThanOrEqual(19000);expect(transport.settings).toEqual(shapedPolicy);const sumBytes=(value:Record<string,unknown>)=>(value.peers as Array<{toBrowserBytes:number}>).reduce((sum,p)=>sum+p.toBrowserBytes,0);expect(sumBytes(transport)).toBeGreaterThan(sumBytes(transportBefore));fs.writeFileSync");
replace('shaped:shapedRows,transport,physicalAudibilityMeasured:', 'shaped:shapedRows,transportBefore,transport,physicalAudibilityMeasured:');
replace("await receiveOne(viewer);await checkpoint(viewer,'Hai nguồn capture thật'", "await receiveOne(viewer);expect(await viewer.locator('.fg-live-viewer').evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('.fg-call-people')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);await expect(viewer.locator('.fg-call-actions')).toContainText('Chia sẻ màn hình');await checkpoint(viewer,'Hai nguồn capture thật'");
fs.writeFileSync(target,s,{flag:'wx'});
const hash=x=>createHash('sha256').update(x).digest('hex');fs.writeFileSync('quality/evidence/T30/native-proposal-review-2.json',JSON.stringify({recordedAt:new Date().toISOString(),reviewer:'Codex',source,sourceSha256:hash(original),target,targetSha256:hash(s),reason:'Fix exactly two ESLint ternary expression errors; strengthen real shaper byte/policy/time and baseline-audio observations and approved stage/avatar/control order. Existing native capture, subscriptions/quota/ended/visual/audio assertions retained.',executionPending:true},null,2)+'\n',{flag:'wx'});
console.log('Native proposal v2 retained all existing assertions; not yet executed.');
