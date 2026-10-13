import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir='quality/evidence/CHATCRYPTO-FE';
const source=fs.readFileSync(`${dir}/headed-private-chat.mjs`,'utf8');
const marker='  // Commit actual encrypted write, then lose response at the browser boundary.';
assert.equal(source.split(marker).length,2);
const prefix=source.slice(0,source.indexOf(marker));
const cleanup=source.slice(source.lastIndexOf('} finally {\n  await browser?.close();'));
assert(cleanup.startsWith('} finally'));
const body=String.raw`
  async function request(page, endpoint, method='GET', data) {
    return page.evaluate(async ({endpoint,method,data}) => {
      const response=await fetch('/api/v1/'+endpoint,{method,credentials:'include',headers:{Accept:'application/json',...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});
      return {status:response.status,body:await response.json()};
    },{endpoint,method,data});
  }
  const created=await request(a,'rooms','POST',{name:'Native membership group',gameId:games[0].id,gameTitle:games[0].title,visibility:'PRIVATE',invitePolicy:'OWNER_APPROVAL',playerCapacity:5});
  assert.equal(created.status,201,JSON.stringify(created));
  const room=created.body,conversation=room.conversationId;
  assert.equal(typeof conversation,'string');
  async function navigate(page,path) {
    await page.bringToFront();
    await page.evaluate(path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));},path);
  }
  async function openRoom(page) {
    await navigate(page,'/rooms/'+room.id);
    await expect(page.getByLabel('Tin nhắn riêng mã hóa',{exact:true})).toBeVisible();
  }
  async function send(page,text) {
    await page.bringToFront();
    await page.getByLabel('Tin nhắn riêng mã hóa',{exact:true}).fill(text);
    await page.getByRole('button',{name:'Gửi mã hóa',exact:true}).click();
    await expect(page.getByLabel('Tin nhắn riêng mã hóa',{exact:true})).toHaveValue('');
    await expect(page.getByText(text,{exact:true})).toBeVisible();
  }
  async function admit() {
    const invite=await request(a,'invitations','POST',{targetType:'ROOM',receiverId:users[1],roomId:room.id});
    assert.equal(invite.status,201,JSON.stringify(invite));
    const accepted=await request(b,'invitations/'+invite.body.id+'/respond','PATCH',{action:'ACCEPT'});
    assert.equal(accepted.status,200,JSON.stringify(accepted));
    assert.equal((await pool.query('SELECT count(*) FROM room_members WHERE room_id=$1 AND user_id=$2',[room.id,users[1]])).rows[0].count,'1');
  }
  const beforeJoin='Native group before join', joined='Native group joined interval', excluded='Native group excluded interval', rejoined='Native group rejoined interval';
  await openRoom(a); await send(a,beforeJoin);
  await admit();
  await navigate(a,'/crypto'); await openRoom(a); await openRoom(b);
  await expect(b.getByText(beforeJoin,{exact:true})).not.toBeVisible();
  await send(a,joined); await b.bringToFront(); await expect(b.getByText(joined,{exact:true})).toBeVisible();
  await a.bringToFront();
  const bobRow=a.locator('.fg-room-member-settings-item').filter({hasText:'Native Bob'});
  await bobRow.getByRole('button',{name:'Xóa',exact:true}).click();
  await expect(bobRow).toHaveCount(0);
  await b.bringToFront();
  await expect(b.getByText('Không có quyền truy cập',{exact:true})).toBeVisible();
  await expect(b.getByText(joined,{exact:true})).not.toBeVisible();
  await send(a,excluded);
  await admit();
  // Explicitly leave the revoked route before opening the newly admitted room.
  await navigate(b,'/crypto'); await openRoom(b);
  await navigate(a,'/crypto'); await openRoom(a);
  await expect(b.getByText(beforeJoin,{exact:true})).not.toBeVisible();
  await expect(b.getByText(excluded,{exact:true})).not.toBeVisible();
  await send(a,rejoined); await b.bringToFront(); await expect(b.getByText(rejoined,{exact:true})).toBeVisible();
  const history=await request(b,'crypto/conversations/'+conversation+'/history?limit=100');
  assert.equal(history.status,200,JSON.stringify(history));
  const rows=(await pool.query('SELECT id,content FROM messages WHERE conversation_id=$1 ORDER BY created_at,id',[conversation])).rows;
  assert.equal(rows.length,4); assert(rows.every(row=>row.content===''));
  assert.equal(JSON.stringify(history.body).includes(rows[0].id),false);
  assert.equal(JSON.stringify(history.body).includes(rows[2].id),false);
  const intervals=(await pool.query('SELECT start_revision,end_revision FROM chat_crypto_membership_intervals WHERE conversation_id=$1 AND user_id=$2 ORDER BY start_revision',[conversation,users[1]])).rows;
  assert.equal(intervals.length,2); assert(intervals[0].end_revision!==null); assert.equal(intervals[1].end_revision,null);
  assert(Number(intervals[1].start_revision)>Number(intervals[0].end_revision));
  await b.setViewportSize({width:360,height:900});
  await b.getByTestId('mobile-tab-chat').click();
  assert(await b.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
  await b.screenshot({path:'quality/evidence/CHATCRYPTO-FE/group-360-'+owned+'.png'});
  assert.deepEqual(legacy,[]);
  for(const file of buildFiles) assert.equal(hash(file),buildHashes[path.relative(process.cwd(),file).replaceAll('\\','/')]);
  fs.writeFileSync('quality/evidence/CHATCRYPTO-FE/headed-group-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),headed:true,buildHashes,realRoomCreateAndInvitationAdmission:true,actualUiKick:true,nativeBilateralSas:true,newMemberNoOldHistory:true,rejoinNoExcludedHistory:true,databaseNoPlaintext:true,mobile360:true,mainMutation:false},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({headed:true,actualGroupMembership:true,uiKick:true,newMemberNoOldHistory:true,rejoinNoExcludedHistory:true,nativeGroupEpochs:true,mobile360:true,mainMutation:false}));
  await contextB.close(); await context.close();
`;
fs.writeFileSync(`${dir}/headed-group.mjs`,prefix+body+cleanup,{flag:'wx'});
console.log('Prepared owned headed group fixture with real room/invitation producers and UI kick.');
