import fs from 'node:fs';
const dir='quality/evidence/T22';
fs.writeFileSync(`${dir}/native-harness.mjs`,fs.readFileSync('quality/evidence/T20/native-harness.mjs','utf8').replaceAll('t20','t22'));
let audit=fs.readFileSync(`${dir}/audit.mjs`,'utf8');
const extra="\nconst base=execFileSync('git',['show','fcd4161:code/apps/api/src/app.module.ts'],{encoding:'utf8'});\nconst expected=base.replace(\"import { RecruitmentsModule } from './modules/recruitments/recruitments.module.js';\",\"import { RecruitmentsModule } from './modules/recruitments/recruitments.module.js';\\nimport { TeamsModule } from './modules/teams/teams.module.js';\").replace('RoomsModule, RecruitmentsModule]','RoomsModule, RecruitmentsModule, TeamsModule]');\nassert.equal(fs.readFileSync('apps/api/src/app.module.ts','utf8'),expected,'Only approved TeamsModule wiring');\n";
fs.writeFileSync(`${dir}/audit.mjs`,audit+extra);
let notes=fs.readFileSync(`${dir}/verification-notes.md`,'utf8').replace('NodeNext/multer','ESNext+Bundler/multer');
notes+='\nReview regression16 exposed actor session expiry while waiting on locked play session: expected401, received201. Root cause was auth check before the wait only. Source now rechecks live actor with clock_timestamp after acquiring play/request locks and after mutation/outbox before commit, ensuring rollback if expiry crosses a blocking operation. Original assertion retained. No scope expansion.\n';fs.writeFileSync(`${dir}/verification-notes.md`,notes);
