import assert from 'node:assert/strict';import {expect} from '@playwright/test';import {createNativeHarness} from './native-harness.mjs';
const h=await createNativeHarness();
try{
for(let i=0;i<60;i++){const suffix=String(i).padStart(2,'0'),id=`native-pagination-${suffix}`;await h.pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[id,`Bạn phân trang ${suffix}`,`${id}@example.test`]);await h.pool.query("INSERT INTO profiles(user_id,display_name,custom_status) VALUES($1,$2,'JUST_CHATTING')",[id,`Bạn phân trang ${suffix}`]);await h.pool.query('INSERT INTO friendships(id,user1_id,user2_id,created_at) VALUES($1,LEAST($2::text,$3::text),GREATEST($2::text,$3::text),now()-($4::int*interval \'1 second\'))',[`friend-pagination-${suffix}`,'native-a',id,i]);}
const a=await h.context('native-a');const initial=await a.request.get(`${h.base}/api/v1/friends`);assert.equal(initial.status(),200);const first=await initial.json();assert.equal(first.items.length,50);assert.equal(first.hasMore,true);assert(first.nextCursor);
const p=await a.newPage();const requestPages=[];p.on('request',r=>{const u=new URL(r.url());if(u.pathname==='/api/v1/friends'&&r.method()==='GET')requestPages.push({cursorPresent:u.searchParams.has('cursor')});});await p.goto(h.base);const opener=p.getByRole('button',{name:'Bạn bè',exact:true});await expect(opener).toBeEnabled();await opener.click();const dialog=p.getByTestId('friends-modal');const rows=dialog.getByText(/^Bạn phân trang [0-9]{2}$/);await expect.poll(()=>rows.count(),{timeout:15000}).toBeGreaterThanOrEqual(50);
if(await rows.count()<60){const more=dialog.getByRole('button',{name:'Tải thêm',exact:true});await expect(more).toBeEnabled();await more.click();}
await expect(rows).toHaveCount(60,{timeout:15000});assert(requestPages.some(r=>r.cursorPresent),'UI never requested actual next cursor');assert.equal(new Set(await rows.allTextContents()).size,60);
p.on('dialog', d=>d.accept());
const victim=dialog.getByText('Bạn phân trang 59',{exact:true}).locator('..').locator('..').locator('..');
const remove=victim.getByTestId('btn-remove-friend'); await expect(remove).toBeEnabled({timeout:15000});
const removed=p.waitForResponse(r=>r.request().method()==='DELETE'&&r.url().endsWith('/api/v1/friends/native-pagination-59'));
await remove.click(); assert.equal((await removed).status(),200);
assert.equal((await h.pool.query('SELECT count(*)::int AS count FROM friendships')).rows[0].count,59);
await expect(dialog.getByText('Bạn phân trang 59',{exact:true})).toHaveCount(0,{timeout:15000});
await expect(rows).toHaveCount(59,{timeout:15000});
console.log('After loading all60, real DELETE updates SQL and removes only the selected row.');
console.log(JSON.stringify({realPostgres:true,realCompiledApi:true,realBuiltWeb:true,checks:['API first50 has real next cursor; UI obtains all60 distinct friends using subsequent cursor'],requestPages}));
}finally{await h.cleanup();console.log('Owned pagination fixture cleaned.');}

