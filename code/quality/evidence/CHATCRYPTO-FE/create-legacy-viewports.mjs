import fs from 'node:fs';
const d='quality/evidence/CHATCRYPTO-FE/';
let s=fs.readFileSync(d+'headed-legacy-recovery.mjs','utf8');
const anchor='  await contextC.close();';
if(!s.includes(anchor))throw Error('Missing context cleanup anchor');
s=s.replace(anchor,`  const viewportProof=[];
  for(const [width,height] of [[1440,900],[1280,800],[390,844],[360,800]]){
    await c.setViewportSize({width,height});
    await expect(cRow.getByRole('img')).toBeVisible();
    await expect(c.getByText(oldBody,{exact:true})).toBeVisible();
    assert.equal(await c.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
    const shot='quality/evidence/CHATCRYPTO-FE/legacy-viewport-'+width+'x'+height+'-'+owned+'.png';
    await c.screenshot({path:shot});viewportProof.push({width,height,path:shot,sha256:hash(shot)});
  }
  fs.writeFileSync('quality/evidence/CHATCRYPTO-FE/legacy-viewport-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),headed:true,buildHashes,actualNativeRecoveredHistory:true,viewports:viewportProof,mainMutation:false},null,2)+'\n',{flag:'wx'});
`+anchor);
fs.writeFileSync(d+'headed-legacy-viewports.mjs',s,{flag:'wx'});
fs.writeFileSync(d+'legacy-current-ownership-review.md','Current build25 recovery4 exit0 verifies actual native imported text/image, source archive restore/operator activation, explicit legacy report consent, independent recovery and original encrypted IndexedDB store reload without inherited trust. Original failed TLS initializations2/3 preserved; archive helper original retained before bounded sys/init timeout60s (other APIs10s); no TLS/role/assertion relaxation. Index bytes unchanged from reviewed image allocation build25; append current proof while retaining every previous ownership transition/evidence and historical row. Native final2 underway; viewport-specific headed proof and complete FE review pending. Outside-scope contracts proposal remains pending, no PASS/QA/main/production.\n',{flag:'wx'});
