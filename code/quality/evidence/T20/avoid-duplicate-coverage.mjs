import fs from 'node:fs';
const f='quality/evidence/T20/closeout.mjs';let s=fs.readFileSync(f,'utf8');s=s.replace("fs.appendFileSync('quality/spec-coverage.md'","if(!fs.readFileSync('quality/spec-coverage.md','utf8').includes('| T20 |14 real PostgreSQL/API tests;166 API regression'))fs.appendFileSync('quality/spec-coverage.md'");fs.writeFileSync(f,s);
