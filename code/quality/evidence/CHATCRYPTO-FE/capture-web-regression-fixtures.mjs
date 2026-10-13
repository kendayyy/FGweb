import fs from 'node:fs';import {createHash} from 'node:crypto';
const dir='quality/evidence/CHATCRYPTO-FE',files=['apps/web/test/social.test.tsx','apps/web/test/rooms.test.tsx','apps/web/test/call-controls.test.tsx'];
const before={recordedAt:new Date().toISOString(),files:{},rows:{}};
for(const file of files){const bytes=fs.readFileSync(file),original=dir+'/web-regression-original-'+file.split('/').at(-1);fs.writeFileSync(original,bytes,{flag:'wx'});before.files[file]={sha256:createHash('sha256').update(bytes).digest('hex'),original};}
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8'));for(const row of ledger.tasks.filter(t=>t.id!=='CHATCRYPTO-FE'))before.rows[row.id]=createHash('sha256').update(JSON.stringify(row)).digest('hex');
fs.writeFileSync(dir+'/web-regression-before.json',JSON.stringify(before,null,2)+'\n',{flag:'wx'});
