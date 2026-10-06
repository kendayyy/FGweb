import fs from 'node:fs';
const f='quality/evidence/T20/closeout.mjs';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replaceAll('regression-2','regression-3'));
