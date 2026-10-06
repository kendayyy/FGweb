import fs from 'node:fs';
const f='quality/evidence/T20/audit.mjs';
let src=fs.readFileSync(f,'utf8');
src+=`
const oldModule=execFileSync('git',['show','HEAD:code/apps/api/src/app.module.ts'],{encoding:'utf8'}).replaceAll('\\r\\n','\\n');
const expected=oldModule.replace("import { RoomsModule } from './modules/rooms/rooms.module.js';","import { RoomsModule } from './modules/rooms/rooms.module.js';\\nimport { RecruitmentsModule } from './modules/recruitments/recruitments.module.js';").replace('SocialModule, RoomsModule]','SocialModule, RoomsModule, RecruitmentsModule]');
assert.equal(fs.readFileSync('apps/api/src/app.module.ts','utf8').replaceAll('\\r\\n','\\n'),expected,'Only approved AppModule wiring allowed');
console.log('Approved AppModule two-line-only wiring verified.');
`;
fs.writeFileSync(f,src);
