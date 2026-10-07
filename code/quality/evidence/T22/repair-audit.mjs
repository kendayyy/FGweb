import fs from 'node:fs';
const file='quality/evidence/T22/audit.mjs';let source=fs.readFileSync(file,'utf8');
source=source.replace("assert.equal(fs.readFileSync('apps/api/src/app.module.ts','utf8'),expected,'Only approved TeamsModule wiring');","assert.equal(fs.readFileSync('apps/api/src/app.module.ts','utf8').replaceAll('\\r\\n','\\n'),expected,'Only approved TeamsModule wiring (Git LF / Windows CRLF normalized)');");
fs.writeFileSync(file,source);
fs.appendFileSync('quality/evidence/T22/verification-notes.md','\nThe exact AppModule wiring audit initially compared Git LF with the existing Windows CRLF working copy. Only newline normalization was added for this one approved file; all frozen/readonly/spec byte hashes remain unchanged. The audit still reconstructs the exact allowed import and registration from the input commit.\n');
