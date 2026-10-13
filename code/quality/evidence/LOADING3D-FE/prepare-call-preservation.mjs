import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const dir='quality/evidence/LOADING3D-FE',source=dir+'/headed-natural-loading-round9.mjs';let text=fs.readFileSync(source,'utf8');text=text.slice(0,text.indexOf('  const contextB ='));
text="import {startGatewayFixture} from './private-gateway-fixture.mjs';\nimport {RoomServiceClient} from 'livekit-server-sdk';\n"+text;
text=text.replace('let app, browser, apiBase, uiPage, uiError, naturalBrowser;','let app, browser, apiBase, uiPage, uiError, naturalBrowser, gateway, callId;');text=text.replace("uiRunId='natural-loader-'","uiRunId='call-loader-'");
text=text.replace('  Object.assign(process.env,',"  gateway=await startGatewayFixture({databaseURL:url.href,key:env.LIVEKIT_API_KEY,secret:env.LIVEKIT_API_SECRET,origin,turnTcp:true});\n  Object.assign(process.env,");text=text.replace('FG_UPLOADS_DIR: path.join(storage,', 'LIVEKIT_SERVER_URL:gateway.server,LIVEKIT_ADMISSION_URL:gateway.ws,FG_UPLOADS_DIR: path.join(storage,');
text+=String.raw`
  await login(users[0]);const a=await context.newPage();uiPage=a;
  await a.goto(origin+'/lobby');await expect(a.getByRole('heading',{name:'Lobby',exact:true,level:1})).toBeVisible();await stream(a,'FG · Kiểm tra giữ cuộc gọi','Mở app thật và fixture LiveKit local','Bắt đầu kiểm giữ cuộc gọi khi dữ liệu khác tải nền');
  const post=async(path,data)=>{const r=await a.request.post(origin+'/api/v1/'+path,{headers:{Origin:origin},data});assert.equal(r.status(),200);return r.json();};
  const room=RoomSchema.parse(await post('rooms',{name:'Loader call preservation',gameId:games[0].id,gameTitle:games[0].title,visibility:'PUBLIC',invitePolicy:'OWNER_APPROVAL',playerCapacity:5}));
  const group=await post('rooms/'+room.id+'/calls',{});callId=group.id;
  await a.goto(origin+'/rooms?roomId='+room.id);await expect(a.getByRole('button',{name:'Vào gọi',exact:true})).toBeVisible();
  await a.getByRole('button',{name:'Vào gọi',exact:true}).click();await expect(a.getByRole('button',{name:'Bật mic',exact:true})).toBeEnabled();await expect(a.getByRole('button',{name:'Rời cuộc gọi',exact:true})).toBeVisible();
  const sfu=new RoomServiceClient(gateway.server,env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET),people=await sfu.listParticipants('fg-call_'+callId);assert.equal(people.length,1);const identity=people[0].identity;
  await a.locator('.fg-call-panel').evaluate(el=>{window.__fgLoaderCallElement=el;});await stream(a,'FG · Cuộc gọi native','Vào gọi qua admission và LiveKit thật','Native SFU có participant; control mic đã connected');
  let release;const held=new Promise(r=>release=r);const pending=async route=>{await held;await route.continue();};await a.route('**/api/v1/dm/conversations*',pending);
  await a.getByRole('button',{name:'Tin nhắn riêng',exact:true}).click();await expect(a.getByRole('progressbar',{name:'Đang tải hội thoại'})).toBeVisible();
  assert.equal(await a.locator('.fg-call-panel').evaluate(el=>el===window.__fgLoaderCallElement&&el.isConnected),true);await expect(a.getByRole('button',{name:'Bật mic',exact:true})).toBeEnabled();assert.deepEqual((await sfu.listParticipants('fg-call_'+callId)).map(p=>p.identity),[identity]);
  await stream(a,'FG · Call và loading','Mở DM lần đầu trong khi cuộc gọi đang kết nối','Loader vùng DM pending thật; CallPanel cùng DOM và native participant giữ nguyên');release();await expect(a.getByRole('progressbar',{name:'Đang tải hội thoại'})).toHaveCount(0);await a.unroute('**/api/v1/dm/conversations*',pending);
  await a.getByRole('button',{name:'Đóng tin nhắn',exact:true}).click();await a.getByRole('button',{name:'Rời cuộc gọi',exact:true}).click();await expect(a.getByRole('button',{name:'Vào gọi',exact:true})).toBeVisible();await expect.poll(async()=>(await sfu.listParticipants('fg-call_'+callId)).length).toBe(0);
  for(const file of buildFiles)assert.equal(hash(file),buildHashes[path.relative(process.cwd(),file).replaceAll('\','/')]);
  fs.writeFileSync('quality/evidence/LOADING3D-FE/native-call-preservation-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),headed:true,nativeLiveKitParticipant:true,dmInitialLoaderWhileConnected:true,callDomIdentityPreserved:true,sfuIdentityPreserved:true,micControlConnected:true,explicitLeaveConfirmed:true,buildHashes,mediaCapacityClaim:false},null,2)+'\n',{flag:'wx'});
}catch(problem){uiError=problem;throw problem;}finally{
  try{if(uiPage&&!uiPage.isClosed())await stream(uiPage,'FG · Kết thúc kiểm tra call','Kết thúc kiểm giữ cuộc gọi',uiError?'Run thất bại; giữ evidence thực':'Native call/loader assertions đạt',uiError?'FAILED':'SUCCEEDED');}
  finally{await naturalBrowser?.close();await app?.close();await new Promise(r=>front.close(r));await gateway?.close();await pool.query('DROP SCHEMA IF EXISTS "'+owned+'" CASCADE');assert.equal((await pool.query("SELECT to_regclass('public.chat_crypto_state') IS NULL AS absent")).rows[0].absent,true);await pool.end();process.env=saved;
    if(fs.existsSync(storage)){assert.equal(fs.realpathSync(storage),path.join(fs.realpathSync(parent),owned));fs.rmSync(storage,{recursive:true});}
    fs.writeFileSync('quality/evidence/LOADING3D-FE/ui-stream-call-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),runId:uiRunId,headed:true,status:uiError?'FAILED':'SUCCEEDED',events:uiEvents,deliveryReceiptNotClaimed:true},null,2)+'\n',{flag:'wx'});
  }
}
`;
const helper='quality/evidence/T28/private-gateway-fixture.mjs';fs.writeFileSync(dir+'/private-gateway-fixture.mjs',fs.readFileSync(helper,'utf8').replaceAll('.runtime/t28/','.runtime/loading3d-fe/'),{flag:'wx'});fs.writeFileSync(dir+'/headed-call-preservation.mjs',text,{flag:'wx'});
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');fs.writeFileSync(dir+'/call-fixture-provenance.json',JSON.stringify({recordedAt:new Date().toISOString(),source,sourceSha256:hash(source),gatewaySource:helper,gatewaySourceSha256:hash(helper),changes:'Reuse native owned PG/auth/App/CSP/browser and immutable T28 private gateway images; isolated task runtime only, real room/call/SFU and DM request delay. No production credentials printed, app code change, mocked media or capacity claim.'},null,2)+'\n',{flag:'wx'});console.log('Owned native call preservation fixture prepared.');
