import fs from 'node:fs';const p='quality/evidence/T38/headed-fixture1.mjs';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('quality/evidence/T38/web-build2','quality/evidence/T38/web-build3'));
