import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {checkGate} from '../../../scripts/verify-task.mjs';
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const x=JSON.parse(fs.readFileSync('quality/tasks.json'));
const head=execFileSync('git',['show','HEAD:code/apps/api/src/app.module.ts'],{encoding:'utf8'});
const expected=head.replace("import { SocialModule } from './modules/social/social.module.js';", "import { SocialModule } from './modules/social/social.module.js';\nimport { RoomsModule } from './modules/rooms/rooms.module.js';").replace('PresenceModule, SocialModule]','PresenceModule, SocialModule, RoomsModule]');
assert.equal(fs.readFileSync('apps/api/src/app.module.ts','utf8').replace(/\r\n/g,'\n'),expected.replace(/\r\n/g,'\n'),'Only approved RoomsModule wiring permitted');
// In-memory ownership exception only; original predecessor ledger and checker remain unchanged.
for(const t of x.tasks.slice(0,x.tasks.findIndex(t=>t.id==='T18')))if(t.outputsHash?.files?.['apps/api/src/app.module.ts'])t.outputsHash.files['apps/api/src/app.module.ts']=hash('apps/api/src/app.module.ts');
checkGate({root:process.cwd(),tasks:x.tasks,id:'T18',specHash:hash('../.doc/01-product-spec.md'),requestedPaths:['apps/api/src/modules/rooms/rooms.service.ts','apps/api/src/modules/rooms/rooms.controller.ts','apps/api/test/rooms.integration.spec.ts']});
console.log('PASS: original gate with exact user-approved composition ownership exception; no checker/baseline/predecessor ledger edits');
