import fs from 'node:fs';
const d='quality/evidence/T36';
fs.writeFileSync(d+'/scan-staged-public2.mjs',fs.readFileSync(d+'/scan-staged-public1.mjs','utf8').replaceAll('public-staged-scan1.json','public-staged-scan2.json'),{flag:'wx'});
let stage=fs.readFileSync('quality/evidence/T35/stage-receipt-followup1.mjs','utf8').replaceAll('T35','T36').replaceAll('T34','T35');
stage=stage.replace(".filter(Boolean))];", ".filter(p=>p&&!p.startsWith(d+'/codex-t36-receipt-stage-')))];");
fs.writeFileSync(d+'/stage-receipt-followup1.mjs',stage,{flag:'wx'});
console.log('Prepared bounded receipt staging and separate final staged-blob scanner.');
