import fs from 'node:fs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();const checks=[];
const dir=`quality/evidence/T17-FE/screenshots/${h.schema}`;fs.mkdirSync(dir,{recursive:true});
try{
 const a=await h.context('native-a');const b=await h.context('native-b');
 const p=await a.newPage();await p.goto(`${h.base}/users/native-b/profile`);
 await expect(p.getByRole('heading',{name:'Linh',exact:true})).toBeVisible();
 await expect(p.getByTestId('btn-open-dm')).toBeEnabled();await p.getByTestId('btn-open-dm').click();
 await expect(p.getByTestId('direct-messages-panel')).toBeVisible();
 assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM friendships')).rows[0].n,0);
 const dm=(await h.pool.query("SELECT id FROM conversations WHERE kind='DM'")).rows[0];assert(dm);
 assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM conversation_members WHERE conversation_id=$1',[dm.id])).rows[0].n,2);
 checks.push('Actual profile DM entry opens panel without friendship; SQL one DM/two members');
 const composer=p.getByTestId('direct-messages-panel').getByRole('textbox');
 await composer.fill('Tin nhắn thật trước khi chặn');
 await p.getByTestId('direct-messages-panel').getByRole('button',{name:'Gửi tin nhắn',exact:true}).click();
 await expect(p.getByTestId('dm-message-list').getByText('Tin nhắn thật trước khi chặn',{exact:true})).toBeVisible();
 await expect(composer).toHaveValue('');checks.push('Actual composer posts persisted DM and clears only on success');
 const denied=await b.request.post(`${h.base}/api/v1/blocks`,{headers:{Origin:h.base},data:{blockedId:'native-a'}});assert.equal(denied.status(),200);
 const before=(await h.pool.query('SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1',[dm.id])).rows[0].n;
 await composer.fill('Phải giữ lại khi gửi lỗi');
 const deniedSendPromise=p.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(`/api/v1/conversations/${dm.id}/messages`));
 await p.getByTestId('direct-messages-panel').getByRole('button',{name:'Gửi tin nhắn',exact:true}).click();
 const deniedSend=await deniedSendPromise;assert.equal(deniedSend.status(),403);
 const failedClientId=deniedSend.request().postDataJSON().clientMessageId;assert(failedClientId,'Failed send lacks idempotent client ID');
 await expect(composer).toHaveValue('Phải giữ lại khi gửi lỗi');
 await expect(p.getByTestId('direct-messages-panel').getByRole('alert').first()).toBeVisible();
 assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1',[dm.id])).rows[0].n,before);
 await expect(p.getByTestId('dm-message-list').getByText('Tin nhắn thật trước khi chặn',{exact:true})).toBeVisible();checks.push('Real reverse block403 preserves failed draft and historical message; zero persisted new message');
 const unblocked=await b.request.delete(`${h.base}/api/v1/blocks/native-a`,{headers:{Origin:h.base}});assert.equal(unblocked.status(),200);
 const retryPromise=p.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(`/api/v1/conversations/${dm.id}/messages`));
 await p.getByTestId('direct-messages-panel').getByRole('button',{name:'Gửi tin nhắn',exact:true}).click();
 const retry=await retryPromise;assert.equal(retry.status(),201);assert.equal(retry.request().postDataJSON().clientMessageId,failedClientId,'Retry changed clientMessageId');
 await expect(p.getByTestId('dm-message-list').getByText('Phải giữ lại khi gửi lỗi',{exact:true})).toBeVisible();
 await expect(composer).toHaveValue('');checks.push('Real unblock restores retry success');
 for(const size of [{width:1440,height:900},{width:1280,height:800},{width:390,height:844},{width:360,height:800}]){
  await p.setViewportSize(size);await p.screenshot({path:`${dir}/dm-${size.width}x${size.height}.png`,fullPage:true});
  assert(await p.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth),'Horizontal page overflow');
  for(const control of [p.getByLabel('Tin nhắn Lobby'),p.getByLabel('Gửi tin nhắn')]){
   await expect(control).toBeVisible();
   const bounds=await control.boundingBox();assert(bounds,'Composer control has no visible bounds');
   assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=size.width&&bounds.y+bounds.height<=size.height,`Composer control clipped at ${size.width}x${size.height}`);
   assert(await control.evaluate(el=>{const r=el.getBoundingClientRect();return [[r.x+2,r.y+r.height/2],[r.right-2,r.y+r.height/2],[r.x+r.width/2,r.y+2],[r.x+r.width/2,r.bottom-2],[r.x+r.width/2,r.y+r.height/2]].every(([x,y])=>el.contains(globalThis.document.elementFromPoint(x,y)));}),`Composer control clipped or obscured at ${size.width}x${size.height}`);
  }
 }
 console.log(JSON.stringify({realCompiledApi:true,realBuiltWeb:true,realPostgres:true,checks,screenshots:dir}));
}finally{await h.cleanup();console.log('Owned native social fixture cleaned.');}
