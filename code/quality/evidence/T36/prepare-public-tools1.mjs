import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T36';
const replacements=[['stage-reviewed-task1.mjs','stage-reviewed-task1.mjs'],['scan-staged-public4.mjs','scan-staged-public1.mjs']];
for(const[source,target]of replacements){
 let text=fs.readFileSync('quality/evidence/T35/'+source,'utf8').replaceAll('T35','T36').replaceAll('T34','T35');
 if(target==='stage-reviewed-task1.mjs'){
  text=text.replace("!p.startsWith('.cache/')))];","!p.startsWith('.cache/')&&!p.startsWith(d+'/codex-t36-public-stage-')))];");
  assert(text.includes("!p.startsWith(d+'/codex-t36-public-stage-')"));
 }
 if(target==='scan-staged-public1.mjs'){
  text=text.replace("values.push(JSON.parse", "const active=JSON.parse(fs.readFileSync('.runtime/t36/tunnel/active-session.json'));values.push(active.controlToken,...Object.values(active.accounts).map(account=>account.password));values.push(JSON.parse");
  text=text.replaceAll('public-staged-scan4.json','public-staged-scan1.json');
  text=text.replace('Actual fresh headed synthetic native receiver photos and hashed9Telegram receipts reviewed; no private addresses, Push endpoints/keys/cookies. Real SMTP recipient remains in memory only; failed run retained.','All current T36 headed photos have synthetic actors and input/secret masks; actual sent/photo hashes reviewed. Human physical reports are text receipts with disclosed unmatched mobile provider events; no invented phone photo. No private credentials or runtime permitted.');
 }
 fs.writeFileSync(d+'/'+target,text,{flag:'wx'});
}
console.log('Prepared scope-only stage and actual staged-blob scan; private tester/control values included in detector, not output.');
