import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
export function safeEncoderRows(raw){
 const numeric=['timestamp','framesEncoded','framesSent','framesPerSecond','frameWidth','frameHeight','totalEncodeTime','totalPacketSendDelay','bytesSent','packetsSent','targetBitrate','qpSum'];
 return (Array.isArray(raw)?raw:[]).slice(0,48).map(r=>({
  ...Object.fromEntries(numeric.map(k=>[k,typeof r[k]==='number'&&Number.isFinite(r[k])&&r[k]>=0?r[k]:null])),
  mimeType:/^video\/[A-Za-z0-9-]{1,24}$/.test(r.mimeType??'')?r.mimeType:null,
  encoderImplementation:typeof r.encoderImplementation==='string'&&/^[A-Za-z0-9_. /()+-]{1,96}$/.test(r.encoderImplementation)?r.encoderImplementation:null,
  powerEfficientEncoder:typeof r.powerEfficientEncoder==='boolean'?r.powerEfficientEncoder:null,
  qualityLimitationReason:['none','cpu','bandwidth','other'].includes(r.qualityLimitationReason)?r.qualityLimitationReason:null,
  qualityLimitationDurations:Object.fromEntries(['none','cpu','bandwidth','other'].map(k=>[k,typeof r.qualityLimitationDurations?.[k]==='number'&&Number.isFinite(r.qualityLimitationDurations[k])&&r.qualityLimitationDurations[k]>=0?r.qualityLimitationDurations[k]:null]))
 }));
}
export async function captureEncoderStats(windows,evidence,phase){
 assert(['share','failure','complete'].includes(phase));const base=path.resolve('quality/evidence/T30'),target=path.resolve(evidence);assert(target.startsWith(base+path.sep));
 for(const [actor,{page}]of windows){assert(['sender','receiver','viewer','third','fourth','denied'].includes(actor));let raw=[],failure=false;
  try{raw=await page.evaluate(async()=>{const rows=[];for(const pc of (window.t30Peers??[])){if(pc.connectionState==='closed')continue;const report=await pc.getStats();report.forEach(s=>{if(s.type==='outbound-rtp'&&(s.kind??s.mediaType)==='video'){const row={};for(const k of ['timestamp','framesEncoded','framesSent','framesPerSecond','frameWidth','frameHeight','totalEncodeTime','totalPacketSendDelay','bytesSent','packetsSent','targetBitrate','qpSum','encoderImplementation','powerEfficientEncoder','qualityLimitationReason','qualityLimitationDurations'])row[k]=s[k];row.mimeType=report.get(s.codecId)?.mimeType;rows.push(row);}});}return rows;});}catch{failure=true;}
  fs.appendFileSync(path.join(target,'browser-encoder-observation.jsonl'),JSON.stringify({at:new Date().toISOString(),phase,actor,failure,rows:safeEncoderRows(raw)})+'\n');
 }
}
