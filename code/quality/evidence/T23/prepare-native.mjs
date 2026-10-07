import fs from 'node:fs';
const dir='quality/evidence/T23';
fs.writeFileSync(`${dir}/native-harness.mjs`,fs.readFileSync('quality/evidence/T22/native-harness.mjs','utf8').replaceAll('t22','t23').replaceAll('T22','T23').replaceAll('createRecruitmentsHarness','createInvitationsHarness'));
const exact=`
const priorApp=execFileSync('git',['show','HEAD:code/apps/api/src/app.module.ts'],{encoding:'utf8'});
const expectedApp=priorApp.replace("import { TeamsModule } from './modules/teams/teams.module.js';","import { TeamsModule } from './modules/teams/teams.module.js';\\nimport { InvitationsModule } from './modules/invitations/invitations.module.js';").replace('RecruitmentsModule, TeamsModule]','RecruitmentsModule, TeamsModule, InvitationsModule]');
assert.equal(fs.readFileSync('apps/api/src/app.module.ts','utf8'),expectedApp,'Exact approved InvitationsModule wiring only');
`;
fs.appendFileSync(`${dir}/audit.mjs`,exact);
