import fs from 'node:fs';import assert from 'node:assert/strict';
const source=fs.readFileSync('quality/evidence/CHATCRYPTO-FE/active-membership-headed-source.mjs','utf8').replaceAll('\r\n','\n');
const cutoff=source.indexOf("  const created=await request(a,'rooms'");assert(cutoff>5000);
const suffix=source.slice(source.indexOf('} finally {\n  await browser?.close();'));
assert(suffix.length>100);
const body=`
  const created=await request(a,'rooms','POST',{name:'Native late response boundary',gameId:games[0].id,gameTitle:games[0].title,visibility:'PRIVATE',invitePolicy:'OWNER_APPROVAL',playerCapacity:5});assert.equal(created.status,200);const room=created.body;assert.notEqual(room.conversationId,'headed-dm');
  let release,blockedResolve;const held=new Promise(resolve=>{release=resolve;}),blocked=new Promise(resolve=>{blockedResolve=resolve;});
  await a.route('**/api/v1/crypto/conversations/headed-dm/messages',async route=>{
    if(route.request().method()!=='POST'){await route.continue();return;}
    const response=await route.fetch();assert.equal(response.status(),201);blockedResolve();await held;await route.fulfill({response});
  });
  await a.bringToFront();await a.getByLabel('Tin nhắn riêng mã hóa',{exact:true}).fill(privateBody);await a.getByRole('button',{name:'Gửi mã hóa',exact:true}).click();
  await Promise.race([blocked,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Actual native POST did not reach held response')),30000))]);
  const posted=(await pool.query("SELECT id,content,crypto_envelope FROM messages WHERE conversation_id='headed-dm'")).rows;assert.equal(posted.length,1);assert.equal(posted[0].content,'');assert.equal(JSON.stringify(posted[0]).includes(privateBody),false);
  await a.evaluate(path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));},'/rooms/'+room.id);
  const draft=a.getByLabel('Tin nhắn riêng mã hóa',{exact:true});await expect(draft).toBeVisible();await draft.fill('New conversation draft must survive late old response');
  release();await a.unroute('**/api/v1/crypto/conversations/headed-dm/messages');
  await expect(draft).toHaveValue('New conversation draft must survive late old response');await expect(a.getByText(privateBody,{exact:true})).toHaveCount(0);
  await expect.poll(async()=>Number((await pool.query('SELECT count(*) FROM messages WHERE conversation_id=$1',[room.conversationId])).rows[0].count)).toBe(0);
  await a.bringToFront();await a.evaluate(()=>{history.pushState(null,'','/lobby');dispatchEvent(new PopStateEvent('popstate'));});await chat(a,users[1]);
  await expect(a.getByText(privateBody,{exact:true})).toBeVisible();await expect(a.getByText(privateBody,{exact:true})).toHaveCount(1);
  assert.deepEqual(legacy,[]);for(const file of buildFiles)assert.equal(hash(file),buildHashes[path.relative(process.cwd(),file).replaceAll(String.fromCharCode(92),'/')]);
  fs.writeFileSync('quality/evidence/CHATCRYPTO-FE/headed-chat-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),headed:true,buildHashes,actualNativeLateResponse:true,oldConversationCommitEncrypted:true,newConversationDraftPreserved:true,noWrongConversationPlaintext:true,originalConversationNativeRead:true,mainMutation:false},null,2)+String.fromCharCode(10),{flag:'wx'});
  console.log(JSON.stringify({headed:true,actualNativeLateResponse:true,newConversationDraftPreserved:true,noWrongConversationPlaintext:true,originalConversationNativeRead:true,mainMutation:false}));
  await contextB.close();await context.close();
`;
fs.writeFileSync('quality/evidence/CHATCRYPTO-FE/headed-late-response.mjs',source.slice(0,cutoff)+body+suffix,{flag:'wx'});
