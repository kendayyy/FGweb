import fs from 'node:fs';import assert from 'node:assert/strict';
const dir='quality/evidence/CHATCRYPTO-QA';let text=fs.readFileSync(dir+'/headed-security-green-3-source.mjs','utf8');
const anchor='  const viewportShots=[];';assert(text.includes(anchor));
const assertions=String.raw`
  const actualPayload=structuredClone(payloads[0]);
  async function postAs(page,payload){return page.evaluate(async payload=>{const response=await fetch('/api/v1/crypto/conversations/headed-dm/messages',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});return{status:response.status,body:await response.json()};},payload);}
  const originalId=(await pool.query("SELECT id FROM messages WHERE conversation_id='headed-dm'")).rows[0].id;
  const replay=await postAs(a,actualPayload);assert.equal(replay.status,201);assert.equal(replay.body.id,originalId);
  const modified=structuredClone(actualPayload);const ciphertext=Buffer.from(modified.envelope.event.ciphertext,'base64');ciphertext[Math.floor(ciphertext.length/2)]^=1;modified.envelope.event.ciphertext=ciphertext.toString('base64');ciphertext.fill(0);
  assert.equal((await postAs(a,modified)).status,409);
  assert.equal((await postAs(a,{...actualPayload,membershipRevision:actualPayload.membershipRevision+1})).status,409);
  assert.equal((await postAs(b,actualPayload)).status,403);
  const guest=await browser.newContext();try{assert.equal((await guest.request.get(origin+'/api/v1/crypto/conversations/headed-dm/messages?deviceId='+encodeURIComponent(actualPayload.deviceId))).status(),401);}finally{await guest.close();}
  const retained=(await pool.query("SELECT id,content,crypto_envelope FROM messages WHERE conversation_id='headed-dm'")).rows;assert.equal(retained.length,1);assert.equal(retained[0].id,originalId);assert.equal(retained[0].content,'');assert.equal(JSON.stringify(retained).includes(marker),false);
`;
text=text.replace(anchor,assertions+anchor).replaceAll('headed-security-proof-','headed-protocol-proof-').replaceAll('nativeSasAndMegolm:true,','nativeSasAndMegolm:true,actualRelayReplayDedup:true,changedCipherRetry409:true,staleRevision409:true,foreignDevice403:true,guestHistory401:true,');
fs.writeFileSync(dir+'/headed-protocol.mjs',text,{flag:'wx'});
