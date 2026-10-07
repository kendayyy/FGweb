import fs from 'node:fs';
const source=fs.readFileSync('quality/evidence/T23/native-harness.mjs','utf8').replaceAll('T23','T24').replaceAll('t23_','t24_').replaceAll('t23-','t24-').replaceAll('createInvitationsHarness','createPlaySessionsHarness');
fs.writeFileSync('quality/evidence/T24/native-harness.mjs',source);
