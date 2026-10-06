import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();
try{
 const a=await h.context('native-a'),b=await h.context('native-b');
 const created=await a.request.post(`${h.base}/api/v1/direct-conversations`,{headers:{Origin:h.base},data:{recipientUserId:'native-b'}});assert.equal(created.status(),200);const {conversationId}=await created.json();
 for(const [i,content]of ['Tin cũ phải ở trên','Tin mới phải ở dưới'].entries()){
  const sent=await b.request.post(`${h.base}/api/v1/conversations/${conversationId}/messages`,{headers:{Origin:h.base},data:{content,clientMessageId:`native-history-${i}`}});assert.equal(sent.status(),201);
 }
 const p=await a.newPage();await p.goto(`${h.base}/users/native-b/profile`);await expect(p.getByTestId('btn-open-dm')).toBeEnabled();await p.getByTestId('btn-open-dm').click();await expect(p.getByTestId('direct-messages-panel')).toBeVisible();
 const bubbles=p.getByTestId('dm-message-list').locator('.fg-message-bubble');await expect(bubbles).toHaveCount(2);assert.deepEqual(await bubbles.allTextContents(),['Tin cũ phải ở trên','Tin mới phải ở dưới']);
 console.log(JSON.stringify({realApi:true,realBuiltWeb:true,realPostgres:true,checks:['Actual descending history endpoint is rendered in stable ascending chat order']}));
}finally{await h.cleanup();console.log('Owned history fixture cleaned.');}
