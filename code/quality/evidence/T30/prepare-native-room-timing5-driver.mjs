import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T30';let s=fs.readFileSync(d+'/prepare-native-room-timing4.mjs','utf8');
s=s.replaceAll("PlaySessionsService:['listRoom','get']","PlaySessionsService:['listRoom']").replaceAll('timing4','timing5').replaceAll('timing-4','timing-5').replaceAll('resource101','resource102').replaceAll('stop-101','stop-102').replaceAll('restore-101','restore-102');
assert(!fs.existsSync(d+'/prepare-native-room-timing5.mjs'));fs.writeFileSync(d+'/prepare-native-room-timing5.mjs',s,{flag:'wx'});
