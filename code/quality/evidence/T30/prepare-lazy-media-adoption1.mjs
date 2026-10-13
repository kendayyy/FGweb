import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const d='quality/evidence/T30', p='apps/web/src/features/calls/CallPanel.tsx';
const old=fs.readFileSync(p,'utf8');
const changes=[
 ["import {createMediaSession,type MediaSession,type MediaState} from './media.js';", "import type {MediaSession,MediaState} from './media.js';\nimport {loadMediaSessionFactory} from './media-loader.js';"],
 ['   const grant=await joinCall(id);','   const createMediaSession=await loadMediaSessionFactory();\n   if(!alive.current)return;\n   const grant=await joinCall(id);']
];
let next=old; for(const [before,after] of changes){assert.equal(next.split(before).length,2);next=next.replace(before,after);}
let reverse=next;for(const [before,after] of changes)reverse=reverse.replace(after,before);assert.equal(reverse,old);
const loader="export async function loadMediaSessionFactory(){\n return (await import('./media.js')).createMediaSession;\n}\n";
const hash=s=>createHash('sha256').update(s).digest('hex');
const drafts=[{path:p,proposed:d+'/call-panel-lazy-media-reviewed1.tsx',beforeSha256:hash(old),afterSha256:hash(next),body:next},{path:'apps/web/src/features/calls/media-loader.ts',proposed:d+'/media-loader-reviewed1.ts',beforeSha256:null,afterSha256:hash(loader),body:loader}];
for(const f of drafts)fs.writeFileSync(f.proposed,f.body,{flag:'wx'});
const red=JSON.parse(fs.readFileSync(d+'/codex-t30-lazy-media-red-1.json','utf8'));assert.equal(red.exitCode,1);const log=fs.readFileSync(d+'/codex-t30-lazy-media-red-1.txt','utf8');assert.match(log,/3 failed \| 24 passed/);
fs.writeFileSync(d+'/lazy-media-adoption-plan1.json',JSON.stringify({reviewer:'Codex',unresolvedSourceFindings:[],reason:'T30 meaningful RED3/27: load SDK on explicit join before reservation/device permission; ignore late loader after disposal. Original24 call controls and all UI/permission/release paths retained.',files:drafts.map(({body,...f})=>f)},null,2)+'\n',{flag:'wx'});
fs.appendFileSync('../.doc/history.md',`\n- Coding and build 2 — T30 — ${red.startedAt}–${red.completedAt} exit1: lazy media RED actual3 failed/24passed, expected eager import/loader bypass; bounded2-source draft reverse exact outside2anchors, no layout/deadline/security changes. Evidence code/${d}/codex-t30-lazy-media-red-1.json and lazy-media-adoption-plan1.json. IN_PROGRESS/noT31/noCockpit.\n`);
console.log('Reviewed lazy loader draft, source gate adoption pending.');
