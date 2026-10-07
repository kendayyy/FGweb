import fs from 'node:fs';
const dir='quality/evidence/AUTH02-FE',fixture=`${dir}/fixture-server.mjs`;
fs.writeFileSync(fixture,fs.readFileSync(fixture,'utf8').replace('let keys=[];try','let keys;try'));
console.log('Remove redundant initial assignment in safe test diagnostic; no runtime product change.');
