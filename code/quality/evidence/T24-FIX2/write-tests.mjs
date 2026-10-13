import fs from 'node:fs';
const source=fs.readFileSync('apps/api/test/room-play-sessions.integration.spec.ts','utf8');
const prefix=source.slice(0,source.indexOf(" it('current ordinary member" )).replaceAll('T24-FIX1 real member-only room session discovery','T24-FIX2 real stored session capacity').replaceAll('t24_discovery_','t24_capacity_');
const tests=`
 it('member private/CLOSED discovery and snapshot preserve each stored capacity',async()=>{
  const t=await room();await history(t.roomId,2);
  await pool.query("UPDATE play_sessions SET player_capacity=CASE id WHEN 'history-000' THEN 1 WHEN 'history-001' THEN 2 ELSE 3 END WHERE room_id=$1",[t.roomId]);
  const result=await list(t.roomId);expect(result.status).toBe(200);const page=pageSchema.parse(result.body);
  expect(Object.fromEntries(page.items.map(p=>[p.id,p.playerCapacity]))).toEqual({[t.play]:3,'history-000':1,'history-001':2});
  const snapshot=await request(base).get('/api/v1/play-sessions/'+t.play).set('Cookie',cookies.member);expect(snapshot.status).toBe(200);expect(snapshot.body.playSession.playerCapacity).toBe(3);
  expect((await list(t.roomId,'outsider')).status).toBe(403);
 });
 it('changing mutable room settings never misreports or replaces the existing session admission limit',async()=>{
  const t=await room();
  for(const capacity of [10,1]){
   const changed=await request(base).patch('/api/v1/rooms/'+t.roomId+'/settings').set('Cookie',cookies.owner).set('Origin',origin).send({playerCapacity:capacity});expect(changed.status).toBe(200);expect(changed.body.settings.playerCapacity).toBe(capacity);
   const snapshot=await request(base).get('/api/v1/play-sessions/'+t.play).set('Cookie',cookies.member);expect(snapshot.status).toBe(200);expect(snapshot.body.playSession.playerCapacity).toBe(3);
   expect((await list(t.roomId)).body.items[0].playerCapacity).toBe(3);
  }
  const joined=await request(base).post('/api/v1/play-sessions/'+t.play+'/join').set('Cookie',cookies.member).set('Origin',origin).send({});expect(joined.status).toBe(201);
  const accepted=await request(base).post('/api/v1/play-sessions/'+t.play+'/requests/'+joined.body.id+'/respond').set('Cookie',cookies.owner).set('Origin',origin).send({action:'ACCEPT'});expect(accepted.status).toBe(201);
  expect((await pool.query('SELECT user_id FROM team_members WHERE play_session_id=$1',[t.play])).rowCount).toBe(2);
 });
 it('start/end responses expose the actual capacity while room/chat membership persists',async()=>{
  const t=await room();
  for(const action of ['start','end']){
   const response=await request(base).post('/api/v1/play-sessions/'+t.play+'/'+action).set('Cookie',cookies.owner).set('Origin',origin).send({});expect(response.status).toBe(201);expect(PlaySessionSchema.parse(response.body).playerCapacity).toBe(3);
   expect((await pool.query('SELECT id FROM rooms WHERE id=$1',[t.roomId])).rowCount).toBe(1);expect((await pool.query('SELECT id FROM room_members WHERE room_id=$1',[t.roomId])).rowCount).toBe(2);
  }
 });
});
`;
fs.writeFileSync('apps/api/test/play-session-capacity.integration.spec.ts',prefix+tests,{flag:'wx'});
console.log('Created3 real HTTP/PG capacity cases using isolated native fixtures. Original discovery/lifecycle test sources unchanged.');
