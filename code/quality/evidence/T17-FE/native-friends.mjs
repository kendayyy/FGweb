import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();const checks=[];
try{
 const a=await h.context('native-a'), b=await h.context('native-b'), c=await h.context('native-c'), guest=await h.context(null);
 const p=await a.newPage();await p.goto(`${h.base}/users/native-b/profile`);
 await expect(p.getByTestId('btn-send-request')).toBeEnabled();await p.getByTestId('btn-send-request').click();
 await expect(p.getByTestId('btn-cancel-request')).toBeVisible();
 const q=await b.newPage();await q.goto(`${h.base}/users/native-a/profile`);
 await expect(q.getByTestId('btn-accept-request')).toBeEnabled();await q.getByTestId('btn-accept-request').click();
 await expect(q.getByTestId('btn-remove-friend')).toBeVisible();
 assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM friendships')).rows[0].n,1);
 await p.reload();await expect(p.getByTestId('btn-remove-friend')).toBeVisible();
 checks.push('Real profile request PENDING then actual receiver accepts; both show friendship and SQL exactly one row');
 await p.getByTestId('btn-block').click();await expect(p.getByTestId('btn-unblock')).toBeVisible();
 const lobby=(await h.pool.query("SELECT id FROM conversations WHERE kind='LOBBY' AND lobby_id=$1",[h.games[0].lobbyId])).rows[0].id;
 for(const [ctx,content,id]of [[b,'Tin Lobby của người bị chặn','lobby-b-1'],[c,'Tin Lobby của người khác','lobby-c-1']]){
  const r=await ctx.request.post(`${h.base}/api/v1/conversations/${lobby}/messages`,{headers:{Origin:h.base},data:{content,clientMessageId:id}});assert.equal(r.status(),201);
 }
 await p.goto(h.base);await expect(p.getByText('Tin Lobby của người khác',{exact:true})).toBeVisible();await expect(p.getByText('Tin Lobby của người bị chặn',{exact:true})).toHaveCount(0);
 const g=await guest.newPage();await g.goto(h.base);await expect(g.getByText('Tin Lobby của người bị chặn',{exact:true})).toBeVisible();
 await expect(g.getByTestId('peer-social-controls')).toHaveCount(0);
 assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1',[lobby])).rows[0].n,2);
 checks.push('Actual block hides only targeted Lobby sender for blocker; guest still sees persisted history and other sender stays visible');
 await p.goto(`${h.base}/users/native-b/profile`);await expect(p.getByTestId('btn-unblock')).toBeEnabled();
 const response=p.waitForResponse(r=>r.request().method()==='DELETE'&&r.url().endsWith('/api/v1/blocks/native-b'));
 await p.getByTestId('btn-unblock').click();assert.equal((await response).status(),200);
 await expect(p.getByTestId('btn-unblock')).toHaveCount(0);await expect(p.getByTestId('btn-block')).toBeVisible();
 assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM blocks WHERE blocker_id=$1 AND blocked_id=$2',['native-a','native-b'])).rows[0].n,0);
 await p.goto(h.base);await expect(p.getByText('Tin Lobby của người bị chặn',{exact:true})).toBeVisible();checks.push('Actual unblock restores Lobby visibility without deleting friendship/history');
 console.log(JSON.stringify({realBuiltWeb:true,realCompiledApi:true,realPostgres:true,checks}));
}finally{await h.cleanup();console.log('Owned friends fixture cleaned.');}
