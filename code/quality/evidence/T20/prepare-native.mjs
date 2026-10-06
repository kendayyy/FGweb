import fs from 'node:fs';
fs.writeFileSync('quality/evidence/T20/native-harness.mjs',fs.readFileSync('quality/evidence/T18/native-harness.mjs','utf8').replaceAll('t18','t20').replaceAll('createRoomsHarness','createRecruitmentsHarness'));
