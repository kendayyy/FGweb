import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();
try{
 const a=await h.context('native-a'), b=await h.context('native-b');
 const created=await a.request.post(`${h.base}/api/v1/direct-conversations`,{headers:{Origin:h.base},data:{recipientUserId:'native-b'}});assert.equal(created.status(),200);
 const {conversationId}=await created.json();
 const p=await a.newPage(),q=await a.newPage();
 for(const page of [p,q]){await page.goto(h.base);await page.getByRole('button',{name:'Tin nhắn',exact:true}).click();await expect(page.getByTestId(`dm-conv-item-${conversationId}`)).toBeVisible();}
 const sent=await b.request.post(`${h.base}/api/v1/conversations/${conversationId}/messages`,{headers:{Origin:h.base},data:{content:'Tin chưa đọc thực tế',clientMessageId:'native-unread-message-1'}});assert.equal(sent.status(),201);
 for(const page of [p,q])await expect(page.getByTestId(`dm-conv-item-${conversationId}`).getByText('1',{exact:true})).toBeVisible({timeout:15000});
 await p.getByTestId(`dm-conv-item-${conversationId}`).click();
 await expect(p.getByTestId('dm-message-list').getByText('Tin chưa đọc thực tế',{exact:true})).toBeVisible();
 await expect(q.getByTestId(`dm-conv-item-${conversationId}`).getByText('1',{exact:true})).toHaveCount(0);
 assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1',[conversationId])).rows[0].n,1);
 for(const page of [p,q]){await page.getByTestId('direct-messages-panel').getByRole('button',{name:'Đóng tin nhắn',exact:true}).first().click();await expect(page.getByTestId('direct-messages-panel')).toHaveCount(0);}
 const second=await b.request.post(`${h.base}/api/v1/conversations/${conversationId}/messages`,{headers:{Origin:h.base},data:{content:'Tin đến sau khi đóng panel',clientMessageId:'native-unread-message-2'}});assert.equal(second.status(),201);
 for(const page of [p,q])await expect(page.getByTestId('dm-unread-badge')).toHaveText('1',{timeout:15000});
 await q.getByRole('button',{name:/^Tin nhắn(?:\s*\d+)?$/}).click();await q.getByTestId(`dm-conv-item-${conversationId}`).click();
 await expect(q.getByTestId('dm-message-list').getByText('Tin đến sau khi đóng panel',{exact:true})).toBeVisible();
 await expect(p.getByTestId('dm-unread-badge')).toHaveCount(0);
 assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1',[conversationId])).rows[0].n,2);
 const third=await b.request.post(`${h.base}/api/v1/conversations/${conversationId}/messages`,{headers:{Origin:h.base},data:{content:'Tin trực tiếp khi đang mở hội thoại',clientMessageId:'native-unread-message-3'}});assert.equal(third.status(),201);
 await expect(q.getByTestId('dm-message-list').getByText('Tin trực tiếp khi đang mở hội thoại',{exact:true})).toBeVisible({timeout:15000});
 await expect(p.getByTestId('dm-unread-badge')).toHaveCount(0);
 assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1',[conversationId])).rows[0].n,3);
 console.log(JSON.stringify({realTwoTabs:true,realCompiledApi:true,realPostgres:true,checks:['One actual persisted peer message yields unread1 in both same-actor tabs','Actual read in one tab clears other tab unread','After both panels close a new actual message increments both header badges once','Reopening and reading clears the other closed tab header','Active thread receives new actual peer message and clears other closed tab unread']}));
}finally{await h.cleanup();console.log('Owned unread fixture cleaned.');}
