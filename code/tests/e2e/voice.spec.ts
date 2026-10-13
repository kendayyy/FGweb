import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {fork,type ChildProcess,type ForkOptions} from 'node:child_process';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
type Actor={id:string;name:string;cookie:string};
type Ready={origin:string;actors:Record<string,Actor>;roomId:string;otherRoomId:string;turnPort:number};
type VoiceWindow=Window&{fgVoicePeers:RTCPeerConnection[];fgVoiceGum:number;fgVoiceTracks:MediaStreamTrack[];fgVoiceFinishPermission?:()=>void};
const evidence=process.env.FG_T28_EVIDENCE_DIR??'quality/evidence/T28/headed-1';
let fixture:ChildProcess,ready:Ready;
const pending=new Map<string,(value:Record<string,unknown>)=>void>();
test.beforeAll(async()=>{
 test.setTimeout(120000);fs.mkdirSync(`${evidence}/screenshots`,{recursive:true});
 const fixtureOptions:ForkOptions&{windowsHide:boolean}={env:{...process.env,FG_T28_EVIDENCE_DIR:evidence},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true};
 fixture=fork('quality/evidence/T28/fixture-server.mjs',[],fixtureOptions);
 fixture.on('message',(message:Record<string,unknown>)=>{if(typeof message.id==='string'){pending.get(message.id)?.(message);pending.delete(message.id);}if(message.kind==='phase')fs.appendFileSync(`${evidence}/phases.txt`,`${new Date().toISOString()} ${message.name}\n`);if(message.kind==='failed')fs.writeFileSync(`${evidence}/setup-failure.json`,JSON.stringify(message,null,2)+'\n');});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned native fixture startup timeout')),110000);fixture.on('message',(message:Record<string,unknown>)=>{if(message.kind==='ready'){ready=message as unknown as Ready;clearTimeout(timer);resolve();}if(message.kind==='failed'){clearTimeout(timer);reject(Error('Owned fixture failed; inspect sanitized evidence'));}});fixture.once('exit',()=>{clearTimeout(timer);reject(Error('Owned fixture exited'));});});
});
test.afterAll(async()=>{
 test.setTimeout(60000);
 if(fixture?.exitCode===null&&fixture.connected)await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned fixture cleanup timed out')),55000);fixture.once('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(Error('Owned fixture cleanup failed'));});fixture.send({kind:'stop'});});
});
async function inspect(){const id=randomUUID();return new Promise<Record<string,unknown>>((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Native inspection timed out'));},15000);pending.set(id,value=>{clearTimeout(timer);if(value.failed)reject(Error('Native inspection failed'));else resolve(value);});fixture.send({kind:'inspect',id});});}
async function open(context:BrowserContext,key:string,denied=false,pendingPermission=false){
 await context.addCookies([{name:'better-auth.session_token',value:ready.actors[key].cookie,url:ready.origin,httpOnly:true,sameSite:'Lax'}]);
 await context.addInitScript(({turnPort,denied,pendingPermission})=>{
  const own=window as unknown as VoiceWindow;own.fgVoicePeers=[];own.fgVoiceGum=0;own.fgVoiceTracks=[];
  const Native=window.RTCPeerConnection;
  // Test transport only: native TURN credentials, DTLS/SRTP and signaling stay intact.
  const translate=(config:RTCConfiguration={}):RTCConfiguration=>({...config,iceServers:(config.iceServers??[]).filter(server=>[server.urls].flat().some(url=>url.startsWith('turn'))).map(server=>({...server,urls:`turn:127.0.0.1:${turnPort}?transport=tcp`})),iceTransportPolicy:'relay'});
  window.RTCPeerConnection=class extends Native{constructor(config?:RTCConfiguration){super(translate(config));own.fgVoicePeers.push(this);}setConfiguration(config:RTCConfiguration){super.setConfiguration(translate(config));}};
  const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async constraints=>{own.fgVoiceGum++;if(pendingPermission)await new Promise<void>(resolve=>{own.fgVoiceFinishPermission=resolve;});if(denied)throw new DOMException('Permission denied by test device policy','NotAllowedError');const stream=await gum(constraints);own.fgVoiceTracks.push(...stream.getTracks());return stream;};
 },{turnPort:ready.turnPort,denied,pendingPermission});
 const page=await context.newPage();
 const requestStarts=new WeakMap<object,number>();
 page.on('request',request=>{if(request.url().startsWith(`${ready.origin}/api/v1/`))requestStarts.set(request,Date.now());});
 page.on('response',response=>{const started=requestStarts.get(response.request());if(started!==undefined)fs.appendFileSync(`${evidence}/api-timings.jsonl`,JSON.stringify({recordedAt:new Date().toISOString(),method:response.request().method(),path:new URL(response.url()).pathname,status:response.status(),elapsedMs:Date.now()-started})+'\n');});
 page.on('console',message=>{if(message.type()==='error')fs.appendFileSync(`${evidence}/browser-sanitized.txt`,message.text().replace(/(?:access_token|join_request)=[^\s"&]+/g,'private_parameter=[REDACTED]').replace(/\beyJ[A-Za-z0-9_.-]+\b/g,'[JWT REDACTED]')+'\n');});
 await page.goto(`${ready.origin}/rooms/${ready.roomId}`);await expect(page.getByRole('region',{name:'Nhóm gọi'})).toBeVisible();return page;
}
async function join(page:Page){await page.getByRole('button',{name:'Vào gọi',exact:true}).click();await expect(page.getByRole('button',{name:'Rời cuộc gọi'})).toBeVisible();await expect(page.locator('.fg-call-status')).toContainText('Đã kết nối');await expect(page.getByRole('button',{name:'Bật mic',exact:true})).toBeEnabled();}
async function bytes(page:Page){return page.evaluate(async()=>{let total=0;for(const peer of (window as unknown as VoiceWindow).fgVoicePeers)(await peer.getStats()).forEach(stat=>{if(stat.type==='inbound-rtp'&&stat.kind==='audio')total+=stat.bytesReceived??0;});return total;});}
test('actual FG UI: native audio, viewer mic, local volume, denied permission and isolated leave/route cleanup',async({browser})=>{
 const contexts:BrowserContext[]=[],report:Record<string,unknown>={headed:true,actualFgApp:true,privateSfuSignaling:true,syntheticMicrophone:true,audibleQualityVerified:false,productionTurnTlsVerified:false,mediaLoad1000Verified:false};
 try{
  const senderContext=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(senderContext);const sender=await open(senderContext,'sender');
  await expect(sender.getByRole('button',{name:'Tạo nhóm gọi'})).toBeEnabled();expect(await sender.evaluate(()=>(window as unknown as VoiceWindow).fgVoiceGum)).toBe(0);
  await sender.getByRole('button',{name:'Tạo nhóm gọi'}).click();await expect(sender.getByRole('button',{name:'Vào gọi',exact:true})).toBeVisible();await join(sender);
  await expect.poll(()=>sender.evaluate(()=>(window as unknown as VoiceWindow).fgVoiceGum)).toBeGreaterThan(0);
  expect((await inspect()).play_slots).toBe(1);
  const receiverContext=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(receiverContext);const receiver=await open(receiverContext,'receiver');await join(receiver);
  await sender.getByRole('button',{name:'Bật mic',exact:true}).click();await expect(sender.getByRole('button',{name:'Tắt mic',exact:true})).toBeEnabled();
  await expect.poll(()=>bytes(receiver),{timeout:25000}).toBeGreaterThan(0);report.inboundAudioBytes=await bytes(receiver);expect(await receiver.locator('.fg-call-audio audio').count()).toBeGreaterThan(0);
  await receiver.getByRole('button',{name:'Bật mic',exact:true}).click();await expect(receiver.getByRole('button',{name:'Tắt mic',exact:true})).toBeEnabled();
  await expect.poll(async()=>{const data=await inspect();return (data.people as Array<{user_id:string;is_muted:boolean}>).find(p=>p.user_id===ready.actors.receiver.id)?.is_muted;}).toBe(false);
  await expect.poll(async()=>(await inspect()).nativeUnmutedAudioTracks).toBe(2);report.viewerMicrophone=true;
  await receiver.getByRole('button',{name:'Tắt mic',exact:true}).click();await expect(receiver.getByRole('button',{name:'Bật mic',exact:true})).toBeEnabled();
  const slider=receiver.getByRole('slider',{name:'Âm lượng Hoàng Nam'});await slider.fill('35');
  const remoteAudio=receiver.locator('.fg-call-audio audio').first();await expect.poll(()=>remoteAudio.evaluate(audio=>(audio as HTMLAudioElement).volume)).toBe(.35);
  await receiver.getByRole('button',{name:'Tắt tiếng Hoàng Nam với tôi'}).click();await expect.poll(()=>remoteAudio.evaluate(audio=>(audio as HTMLAudioElement).volume)).toBe(0);
  const source=(await inspect()).people as Array<{user_id:string;is_muted:boolean}>;expect(source.find(p=>p.user_id===ready.actors.sender.id)?.is_muted).toBe(false);expect((await inspect()).nativeUnmutedAudioTracks).toBe(1);
  await receiver.getByRole('button',{name:'Bật tiếng Hoàng Nam với tôi'}).click();await expect.poll(()=>remoteAudio.evaluate(audio=>(audio as HTMLAudioElement).volume)).toBe(.35);report.localVolumeAndMute=true;
  const deniedContext=await browser.newContext({viewport:{width:1100,height:800}});contexts.push(deniedContext);const denied=await open(deniedContext,'denied',true);await join(denied);
  await expect(denied.getByText(/Bạn chưa cho phép microphone/)).toBeVisible();await expect.poll(()=>bytes(denied),{timeout:25000}).toBeGreaterThan(0);report.deniedStillReceivesNativeAudio=true;
  const peersBefore=await receiver.evaluate(()=>(window as unknown as VoiceWindow).fgVoicePeers.length);
  await receiver.getByPlaceholder('Nhắn vào phòng...').fill('Giữ bản nháp khi đổi giao diện');
  for(const theme of ['dark','light']){
   const current=await receiver.locator('html').getAttribute('data-theme');if(current!==theme)await receiver.getByRole('button',{name:theme==='light'?'Chuyển sang Sáng':'Chuyển sang Tối',exact:true}).click();
   for(const [width,height]of [[1440,900],[1280,800]]){
    await receiver.setViewportSize({width,height});await receiver.evaluate(()=>window.scrollTo(0,0));await receiver.locator('.fg-rooms-stage').evaluate(stage=>{stage.scrollTop=0;});
    await receiver.screenshot({path:`${evidence}/screenshots/${theme}-desktop-${width}.png`});
    const controls=await receiver.getByRole('button',{name:'Rời cuộc gọi'}).boundingBox();expect(controls).not.toBeNull();expect(controls!.y).toBeGreaterThanOrEqual(0);expect(controls!.y+controls!.height).toBeLessThanOrEqual(height);
   }
   for(const [width,height]of [[390,844],[360,800]]){
    await receiver.setViewportSize({width,height});await receiver.getByTestId('mobile-tab-calls').click();await expect(receiver.getByRole('region',{name:'Nhóm gọi'})).toBeVisible();
    const sizes=await receiver.locator('.fg-call-panel button,.fg-call-panel input').evaluateAll(nodes=>nodes.filter(node=>node.getBoundingClientRect().width>0).map(node=>node.getBoundingClientRect().height));expect(sizes.every(height=>height>=44)).toBe(true);
    await receiver.screenshot({path:`${evidence}/screenshots/${theme}-mobile-${width}.png`});
    const controls=await receiver.getByRole('button',{name:'Rời cuộc gọi'}).boundingBox();expect(controls).not.toBeNull();expect(controls!.y).toBeGreaterThanOrEqual(0);expect(controls!.y+controls!.height).toBeLessThanOrEqual(height);
    await receiver.getByTestId('mobile-tab-chat').click();await expect(receiver.getByPlaceholder('Nhắn vào phòng...')).toHaveValue('Giữ bản nháp khi đổi giao diện');
   }
   expect(await receiver.evaluate(()=>(window as unknown as VoiceWindow).fgVoicePeers.length)).toBe(peersBefore);
  }
  report.themeAndMobilePreserveConnection=true;await receiver.setViewportSize({width:1440,height:900});
  await denied.getByRole('button',{name:'Rời cuộc gọi'}).click();await expect.poll(async()=>(await inspect()).callers).toBe(2);
  await deniedContext.close();
  const pendingContext=await browser.newContext({viewport:{width:1100,height:800}});contexts.push(pendingContext);const waiting=await open(pendingContext,'denied',false,true);
  await waiting.getByRole('button',{name:'Vào gọi',exact:true}).click();await expect(waiting.getByRole('button',{name:'Rời cuộc gọi'})).toBeVisible();
  await expect.poll(()=>waiting.evaluate(()=>(window as unknown as VoiceWindow).fgVoiceGum)).toBeGreaterThan(0);
  await expect(waiting.getByRole('button',{name:'Rời cuộc gọi'})).toBeEnabled();await waiting.getByRole('button',{name:'Rời cuộc gọi'}).click();await expect.poll(async()=>(await inspect()).callers).toBe(2);
  await waiting.evaluate(()=>(window as unknown as VoiceWindow).fgVoiceFinishPermission?.());
  await expect.poll(()=>waiting.evaluate(()=>(window as unknown as VoiceWindow).fgVoiceTracks.length)).toBeGreaterThan(0);
  await expect.poll(()=>waiting.evaluate(()=>(window as unknown as VoiceWindow).fgVoiceTracks.every(track=>track.readyState==='ended'))).toBe(true);
  await expect(waiting.getByText(/Bạn chưa cho phép microphone/)).toHaveCount(0);report.pendingPermissionLeave=true;
  await receiver.getByRole('button',{name:'Phòng thứ hai',exact:false}).click();
  await expect.poll(async()=>(await inspect()).callers).toBe(1);expect(await receiver.evaluate(()=>(window as unknown as VoiceWindow).fgVoiceTracks.every(track=>track.readyState==='ended'))).toBe(true);report.routeCleanup=true;
  await receiver.goto(`${ready.origin}/rooms/${ready.roomId}`);await join(receiver);await receiver.getByRole('button',{name:'Rời cuộc gọi'}).click();await expect.poll(async()=>(await inspect()).callers).toBe(1);
  const keep=await inspect();expect(keep.rooms).toBe(1);expect(keep.members).toBe(3);expect(keep.play_state).toBe('ACTIVE');expect(keep.play_slots).toBe(1);report.explicitLeavePreservesRoomAndTeam=true;
  await sender.getByRole('button',{name:'Rời cuộc gọi'}).click();await expect.poll(async()=>(await inspect()).open_calls).toBe(0);const final=await inspect();expect(final.play_state).toBe('ACTIVE');expect(final.play_slots).toBe(1);report.finalState=final;
  expect(await sender.evaluate(()=>(window as unknown as VoiceWindow).fgVoiceTracks.every(track=>track.readyState==='ended'))).toBe(true);report.passed=true;
 }finally{for(const context of contexts)await context.close();fs.writeFileSync(`${evidence}/result.json`,JSON.stringify(report,null,2)+'\n');}
});
