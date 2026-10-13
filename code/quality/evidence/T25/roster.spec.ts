import {test,expect,type Page,type BrowserContext,type APIRequestContext} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {TeamSnapshotSchema} from '@fg/contracts';
type Actor={id:string;name:string;cookie:string};
let fixture:ChildProcess,base='',actors:Record<string,Actor>,games:Array<{id:string;title:string}>,roomId='',playId='';
const pending=new Map<string,(value:Record<string,unknown>)=>void>();
const evidenceDir=process.env.FG_T25_EVIDENCE_DIR??'quality/evidence/T25/headed-1';
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{
 test.setTimeout(60000);
 const reservation=net.createServer();await new Promise<void>(r=>reservation.listen(0,'127.0.0.1',r));const port=(reservation.address() as net.AddressInfo).port;await new Promise<void>(r=>reservation.close(()=>r()));base=`http://localhost:${port}`;
 fs.mkdirSync(`${evidenceDir}/screenshots`,{recursive:true});
 fixture=spawn(process.execPath,['quality/evidence/T25/fixture-server.mjs'],{cwd:process.cwd(),env:{...process.env,FG_T25_PORT:String(port)},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
 fixture.on('message',(message:Record<string,unknown>)=>{if(typeof message.id==='string'){pending.get(message.id)?.(message);pending.delete(message.id);}});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Native API/PG/Redis fixture startup timeout')),55000);fixture.on('message',(message:Record<string,unknown>)=>{if(message.kind==='ready'){actors=message.actors as typeof actors;games=message.games as typeof games;clearTimeout(timer);resolve();}if(message.kind==='failed'){clearTimeout(timer);reject(new Error('Native fixture failed; secrets omitted'));}});fixture.once('exit',()=>{clearTimeout(timer);reject(new Error('Native fixture exited'));});});
});
test.afterAll(async()=>{if(fixture&&fixture.exitCode===null&&fixture.connected)await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{fixture.kill();reject(new Error('Owned schema cleanup timed out'));},10000);fixture.once('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error('Owned fixture cleanup failed'));});fixture.send({kind:'stop'});});});
async function inspect(){const id=randomUUID();return new Promise<Record<string,unknown>>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Fixture inspection timeout')),5000);pending.set(id,message=>{clearTimeout(timer);resolve(message);});fixture.send({kind:'inspect',id,roomId,playId});});}
async function identity(context:BrowserContext,key:string){await context.addCookies([{name:'better-auth.session_token',value:actors[key].cookie,url:base,httpOnly:true,sameSite:'Lax'}]);}
async function api(request:APIRequestContext,path:string,method='GET',body?:unknown){const result=await request.fetch(base+'/api/v1/'+path,{method,headers:{Origin:base},...(body===undefined?{}:{data:body})});expect(result.status(),`${method} ${path}`).toBeLessThan(300);return result.json();}
async function inviteSetup(sender:APIRequestContext,recipient:APIRequestContext,receiverId:string){const invite=await api(sender,'invitations','POST',{targetType:'ROOM',roomId,receiverId});await api(recipient,`invitations/${invite.id}/respond`,'PATCH',{action:'ACCEPT'});}
async function room(page:Page){await page.goto(base+`/rooms/${roomId}`);await expect(page.getByRole('region',{name:'Đội chơi trong phòng'})).toBeVisible();TeamSnapshotSchema.parse(await api(page.request,`play-sessions/${playId}`));}
async function refreshTeam(page:Page){await page.getByRole('button',{name:'Tải lại đội'}).click();}

test('native public apply, exact permissions, private roster, consent, 409, start/leave/end with persistent room',async({browser})=>{
 const contexts:BrowserContext[]=[],pages:Record<string,Page>={};
 try{
  for(const key of Object.keys(actors)){const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);await identity(context,key);pages[key]=await context.newPage();}
  const owner=pages.owner,member=pages.member,helper=pages.helper,friend=pages.friend,extra=pages.extra;
  const created=await api(owner.request,'rooms','POST',{name:'Đội bạn FG',gameId:games[0].id,gameTitle:games[0].title,visibility:'PUBLIC',invitePolicy:'OWNER_APPROVAL',playerCapacity:3});roomId=created.id;
  const card=await api(owner.request,'recruitments','POST',{roomId,gameId:games[0].id,gameTitle:games[0].title,title:'Đội cuối tuần',mode:'flex',playerCapacity:3,timingType:'scheduledAt',scheduledAt:'2099-01-01T10:00:00.000Z',idempotencyKey:randomUUID()});
  playId=(await api(owner.request,`rooms/${roomId}/play-sessions`)).items[0].id;
  await inviteSetup(owner.request,helper.request,actors.helper.id);
  await api(owner.request,`rooms/${roomId}/helpers/${actors.helper.id}`,'PUT',{permissions:['MANAGE_CALLS']});
  await test.step('public card application is pending until real owner approval',async()=>{
   await member.goto(base);const publicCard=member.getByRole('article',{name:'Đội cuối tuần'});await publicCard.getByRole('button',{name:'Xin tham gia',exact:true}).click();await expect(publicCard.getByRole('status')).toHaveText('Chờ xét duyệt');
   await room(owner);const panel=owner.getByRole('region',{name:'Đội chơi trong phòng'});await expect(panel.getByText('1/3 người',{exact:true})).toBeVisible();await panel.getByRole('button',{name:'Duyệt Linh'}).click();await expect(panel.getByText('2/3 người',{exact:true})).toBeVisible();
   const mine=await api(member.request,'recruitments/me/joins');expect(mine.find((j:{recruitmentId:string})=>j.recruitmentId===card.id).status).toBe('ACCEPTED');
  });
  await test.step('native settings preserve private CLOSED session and its stored capacity',async()=>{
   await owner.getByRole('button',{name:'Cài đặt quyền phòng'}).click();const settings=owner.getByRole('dialog');await settings.getByLabel('Quyền riêng tư').selectOption('PRIVATE');await settings.getByLabel('Sức chứa tối đa (1–10)').selectOption('10');await settings.getByRole('button',{name:'Lưu cài đặt'}).click();await expect(settings.getByText('Đã cập nhật cài đặt phòng.',{exact:true})).toBeVisible();await settings.getByRole('button',{name:'Đóng cài đặt'}).click();await expect(settings).not.toBeVisible();
   await expect(owner.getByText('2/3 người',{exact:true})).toBeVisible();const cards=await api(owner.request,'recruitments');expect(cards.items.some((c:{id:string})=>c.id===card.id)).toBe(false);
   await room(helper);await expect(helper.getByRole('button',{name:'Bắt đầu chơi'})).toHaveCount(0);await expect(helper.getByRole('region',{name:'Yêu cầu vào đội'})).toHaveCount(0);
  });
  await test.step('ROOM invitation consent waits for approval and creates no playing slot',async()=>{
   await room(member);await member.getByRole('button',{name:'Mời bạn',exact:true}).click();await member.getByLabel('Bạn muốn mời').selectOption(actors.friend.id);await member.getByRole('button',{name:'Gửi lời mời'}).click();await expect(member.getByRole('status')).toContainText('Đã gửi lời mời');
   await friend.goto(base+'/team-activity');await friend.getByRole('button',{name:'Đồng ý lời mời'}).click();await expect(friend.getByText('Đã đồng ý, chờ xét duyệt',{exact:true})).toBeVisible();await expect(friend.getByRole('link',{name:'Mở phòng'})).toHaveCount(0);
   const forbidden=await friend.request.get(base+`/api/v1/rooms/${roomId}`);expect(forbidden.status()).toBe(403);
   await owner.goto(base+'/team-activity');await owner.getByRole('button',{name:'Duyệt lời mời'}).click();await expect(owner.getByRole('button',{name:'Duyệt lời mời'})).toHaveCount(0);await friend.getByRole('button',{name:'Tải lại',exact:true}).click();await expect(friend.getByText('Đã được duyệt',{exact:true})).toBeVisible();await expect(friend.getByRole('link',{name:'Mở phòng'})).toBeVisible();const state=await api(owner.request,`play-sessions/${playId}`);expect(state.roster).toHaveLength(2);
  });
  await test.step('native capacity race returns 409 and UI refreshes instead of admitting twice',async()=>{
   await room(helper);await helper.getByRole('button',{name:'Xin vào đội'}).click();await expect(helper.getByText('Chờ xét duyệt',{exact:true})).toBeVisible();
   await room(friend);await friend.getByRole('button',{name:'Xin vào đội'}).click();await expect(friend.getByText('Chờ xét duyệt',{exact:true})).toBeVisible();
   await room(owner);await expect(owner.getByRole('button',{name:'Duyệt Quang Duy'})).toBeVisible();const queue=await api(owner.request,`play-sessions/${playId}/requests`);const competing=queue.find((j:{applicantId:string})=>j.applicantId===actors.friend.id);await api(owner.request,`play-sessions/${playId}/requests/${competing.id}/respond`,'POST',{action:'ACCEPT'});
   await owner.getByRole('button',{name:'Duyệt Quang Duy'}).click();await expect(owner.getByRole('alert').filter({hasText:'đã thay đổi'})).toBeVisible();await expect(owner.getByText('3/3 người',{exact:true})).toBeVisible();
  });
  await test.step('member leaves only the playing slot, helper needs exact grant to start',async()=>{
   await room(member);await member.getByRole('button',{name:'Rời đội chơi'}).click();await member.getByRole('dialog').getByRole('button',{name:'Rời đội',exact:true}).click();await expect(member.getByText('2/3 người',{exact:true})).toBeVisible();expect((await api(member.request,`rooms/${roomId}`)).id).toBe(roomId);
   await refreshTeam(owner);await owner.getByRole('button',{name:'Duyệt Quang Duy'}).click();await expect(owner.getByText('3/3 người',{exact:true})).toBeVisible();
   await api(owner.request,`rooms/${roomId}/helpers/${actors.helper.id}`,'PUT',{permissions:['MANAGE_CALLS','MANAGE_RECRUITMENT']});await refreshTeam(helper);await helper.getByRole('button',{name:'Bắt đầu chơi'}).click();await expect(helper.getByText('Đang chơi',{exact:true})).toBeVisible();
   await helper.getByRole('button',{name:'Rời đội chơi'}).click();await helper.getByRole('dialog').getByRole('button',{name:'Rời đội',exact:true}).click();await expect(helper.getByText('2/3 người',{exact:true})).toBeVisible();
  });
  await test.step('PLAY_SESSION invitation uses consent and native approval for membership plus roster',async()=>{
   await refreshTeam(member);await member.getByRole('button',{name:'Mời bạn',exact:true}).click();await member.getByLabel('Bạn muốn mời').selectOption(actors.extra.id);await member.getByLabel('Mời tham gia').selectOption('PLAY_SESSION');await member.getByRole('button',{name:'Gửi lời mời'}).click();await expect(member.getByRole('status')).toContainText('Đã gửi lời mời');
   await extra.goto(base+'/team-activity');await extra.getByRole('button',{name:'Đồng ý lời mời'}).click();await expect(extra.getByText('Đã đồng ý, chờ xét duyệt',{exact:true})).toBeVisible();
   await owner.goto(base+'/team-activity');await owner.getByRole('button',{name:'Duyệt lời mời'}).click();const state=await api(owner.request,`play-sessions/${playId}`);expect(state.roster).toHaveLength(3);expect(state.roster.some((r:{userId:string})=>r.userId===actors.extra.id)).toBe(true);await api(extra.request,`rooms/${roomId}`);
  });
  await test.step('end releases slots and retains room membership and chat',async()=>{
   await room(owner);await owner.getByRole('button',{name:'Kết thúc lượt chơi'}).click();await owner.getByRole('dialog').getByRole('button',{name:'Kết thúc',exact:true}).click();await expect(owner.getByText('Đã kết thúc',{exact:true})).toBeVisible();
   const state=await inspect();expect(state.rooms).toBe(1);expect(state.members).toBe(5);expect(state.active_slots).toBe(0);fs.writeFileSync(`${evidenceDir}/native-state.json`,JSON.stringify(state,null,2)+'\n');
   await owner.screenshot({path:`${evidenceDir}/screenshots/native-ended-room.png`,fullPage:true});
  });
 }finally{for(const context of contexts)await context.close();}
});

test('headed light/dark desktop/mobile preserve actual chat draft and exact native session',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await identity(context,'owner');const page=await context.newPage();
 try{
  await room(page);const composer=page.getByRole('textbox',{name:/Tin nhắn/});await expect(composer).toBeEditable();await composer.fill('Bản nháp chưa gửi của đội');await composer.evaluate(node=>node.setAttribute('data-t25-witness','original'));
  await expect(page.locator('.fg-rooms-chat-header')).toContainText('Trực tuyến');const before=await inspect();expect((before.socketIds as string[]).length).toBeGreaterThan(0);
  for(const width of [1440,1024,390,360])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:1000});if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:/Chuyển sang/}).click();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
   if(width<768)await page.getByTestId('mobile-tab-members').click();await expect(page.getByRole('region',{name:'Đội chơi trong phòng'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:`${evidenceDir}/screenshots/${theme}-room-${width}.png`,fullPage:true});if(width<768)await page.getByTestId('mobile-tab-chat').click();await expect(composer).toHaveValue('Bản nháp chưa gửi của đội');await expect(composer).toHaveAttribute('data-t25-witness','original');expect((await api(page.request,'me')).id).toBe(actors.owner.id);
  }
  await page.setViewportSize({width:360,height:1000});await page.getByTestId('mobile-tab-members').click();await page.getByRole('button',{name:'Mời bạn',exact:true}).click();await expect(page.getByLabel('Bạn muốn mời')).toBeVisible();await expect(page.getByRole('option',{name:'Đội chơi hiện tại'})).toHaveCount(0);await page.getByLabel('Bạn muốn mời').selectOption(actors.member.id);await page.getByLabel('Mời tham gia').focus();await expect(page.getByLabel('Mời tham gia')).toBeFocused();const follow=page.getByRole('link',{name:'Theo dõi lời mời'});expect((await follow.boundingBox())!.height).toBeGreaterThanOrEqual(44);await page.screenshot({path:`${evidenceDir}/screenshots/mobile-room-invite-360.png`,fullPage:true});await page.getByRole('button',{name:'Mời bạn',exact:true}).click();await page.getByTestId('mobile-tab-chat').click();await expect(composer).toHaveValue('Bản nháp chưa gửi của đội');
  const after=await inspect();expect(after.socketIds).toEqual(before.socketIds);expect(after.socketEvents).toEqual(before.socketEvents);fs.writeFileSync(`${evidenceDir}/draft-session-sockets.json`,JSON.stringify({before,after},null,2)+'\n');
  await page.goto(base+'/team-activity');await expect(page.getByText('Bạn chưa gửi yêu cầu nào.',{exact:true})).toBeVisible();await expect(page.getByText('Đã được duyệt',{exact:true})).toBeVisible();await expect(page.getByText(/Người nhận: Quang Duy/)).toBeVisible();for(const width of [1440,390,360]){await page.setViewportSize({width,height:1000});await expect(page.getByRole('heading',{name:'Yêu cầu & lời mời'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${evidenceDir}/screenshots/activity-${width}.png`,fullPage:true});}
 }finally{await context.close();}
});
