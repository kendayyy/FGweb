import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const source='quality/evidence/CHATCRYPTO-FE/web-late-response-headed-source.mjs',dir='quality/evidence/CHATCRYPTO-QA';
const original=fs.readFileSync(source,'utf8'),cut=original.indexOf('  async function request(page, endpoint');assert(cut>0);
let prefix=original.slice(0,cut).replaceAll('crypto_fe_','crypto_qa_').replaceAll('.runtime/chatcrypto-fe','.runtime/chatcrypto-qa').replaceAll('quality/evidence/CHATCRYPTO-FE','quality/evidence/CHATCRYPTO-QA');
const tail=original.slice(original.lastIndexOf('} finally {')).replaceAll('crypto_fe_','crypto_qa_').replaceAll('.runtime/chatcrypto-fe','.runtime/chatcrypto-qa');
const body=String.raw`
  const marker='qa-xss-'+owned;
  const attack='<img src=x onerror="window.__qaXssExecution=1"><svg onload="window.__qaXssExecution=2"></svg><script>window.__qaXssExecution=3</script>'+marker;
  for(const page of [a,b])await page.evaluate(()=>{window.__qaXssExecution=0;});
  await a.bringToFront();await a.getByLabel('Tin nhắn riêng mã hóa',{exact:true}).fill(attack);await a.getByRole('button',{name:'Gửi mã hóa',exact:true}).click();
  for(const page of [a,b]){await page.bringToFront();await expect(page.getByText(attack,{exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>window.__qaXssExecution),0);assert.equal(await page.locator('[data-message-id] img[src="x"]').count(),0);const stored=await page.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage)),session:Object.fromEntries(Object.entries(sessionStorage))}));assert.equal(JSON.stringify(stored).includes(marker),false);}
  assert(payloads.length>0);for(const payload of payloads)assert.equal(JSON.stringify(payload).includes(marker),false);
  const rows=(await pool.query("SELECT content,crypto_envelope FROM messages WHERE conversation_id='headed-dm'")).rows;assert.equal(rows.length,1);assert.equal(rows[0].content,'');assert.equal(JSON.stringify(rows).includes(marker),false);
  const opaque=fs.existsSync(path.join(storage,'opaque'))?fs.readdirSync(path.join(storage,'opaque')):[];assert.deepEqual(opaque,[]);
  const viewportShots=[];for(const [width,height]of [[1440,900],[1280,800],[390,844],[360,800]]){await b.setViewportSize({width,height});await expect(b.getByText(attack,{exact:true})).toBeVisible();assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);const file='quality/evidence/CHATCRYPTO-QA/xss-'+width+'x'+height+'-'+owned+'.png';await b.screenshot({path:file});viewportShots.push({width,height,path:file,sha256:hash(file)});}
  await a.bringToFront();await a.getByLabel('Tin nhắn riêng mã hóa',{exact:true}).fill('qa-unsent-memory-draft-'+owned);
  const beforeLogout=(await pool.query("SELECT count(*) FROM messages WHERE conversation_id='headed-dm'")).rows[0].count;
  await a.getByRole('button',{name:'Đăng xuất',exact:true}).click();
  await expect(a.getByText(attack,{exact:true})).toHaveCount(0);await expect(a.getByLabel('Tin nhắn riêng mã hóa',{exact:true})).toHaveCount(0);
  assert.equal((await pool.query("SELECT count(*) FROM messages WHERE conversation_id='headed-dm'")).rows[0].count,beforeLogout);
  assert.deepEqual(legacy,[]);for(const file of buildFiles)assert.equal(hash(file),buildHashes[path.relative(process.cwd(),file).replaceAll(String.fromCharCode(92),'/')]);
  fs.writeFileSync('quality/evidence/CHATCRYPTO-QA/headed-security-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),headed:true,buildHashes,nativeSasAndMegolm:true,actualEncryptedMarkupAsText:true,noMarkupExecution:true,noPlaintextTransportDbOrWebStorage:true,logoutClearsContentAndDraft:true,viewportShots,mainMutation:false},null,2)+String.fromCharCode(10),{flag:'wx'});
  console.log(JSON.stringify({headed:true,nativeSasAndMegolm:true,actualEncryptedMarkupAsText:true,noMarkupExecution:true,noPlaintextTransportDbOrWebStorage:true,logoutClearsContentAndDraft:true,mainMutation:false}));
  await contextB.close();await context.close();
`;
fs.writeFileSync(dir+'/headed-security.mjs',prefix+body+tail,{flag:'wx'});
fs.writeFileSync(dir+'/headed-security-source-review.json',JSON.stringify({recordedAt:new Date().toISOString(),source,beforeSha256:createHash('sha256').update(original).digest('hex'),fixture:dir+'/headed-security.mjs',fixtureSha256:createHash('sha256').update(prefix+body+tail).digest('hex'),actualNativeSetupRetained:true,qaOwnedSchemaRuntimeEvidence:true,newIndependentAssertions:['native encrypted XSS inert rendering','actual transport/database/web storage no plaintext','logout clears private content and unsent draft','four actual viewport sizes'],noSdkAuthOrDecryptMock:true},null,2)+'\n',{flag:'wx'});
