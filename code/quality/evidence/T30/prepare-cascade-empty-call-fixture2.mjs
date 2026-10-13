import fs from'node:fs';import assert from'node:assert/strict';import ts from'typescript';import{createHash}from'node:crypto';const d='quality/evidence/T30',h=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');const source=d+'/cascade-empty-call-tests1/t30-cascade-empty-call.integration.spec.ts';let text=fs.readFileSync(source,'utf8');const additions=`
  const marker=async(id:string)=>(await pool.query("SELECT event_id,event_type,payload FROM webhook_events WHERE event_id=$1",['fg:admission-committed:'+id])).rows;
  it('real committed admission has one separately named internal lifecycle fact and repeated join remains idempotent',async()=>{
    const {call}=await roomCall();expect(await marker(call.id)).toEqual([]);await join(call.id);await join(call.id);
    const rows=await marker(call.id);expect(rows).toHaveLength(1);expect(rows[0].event_type).toBe('FG_ADMISSION_COMMITTED');expect(JSON.parse(rows[0].payload)).toEqual({callId:call.id});
    expect((await pool.query("SELECT id FROM call_members WHERE call_group_id=$1 AND left_at IS NULL",[call.id])).rowCount).toBe(1);
  });
  it('denied admission creates no internal fact and fresh group remains open',async()=>{
    const {call}=await roomCall();expect((await post('calls/'+call.id+'/join','participant2')).status).toBe(403);
    expect(await marker(call.id)).toEqual([]);expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1',[call.id])).rowCount).toBe(0);await lifecycle().sweep();expect(await state(call.id)).toBe('OPEN');
  });
  it('actual native administration failure rolls back admission and internal fact',async()=>{
    const {call}=await roomCall();const old=process.env.LIVEKIT_SERVER_URL;process.env.LIVEKIT_SERVER_URL='http://127.0.0.1:1';
    try{expect((await post('calls/'+call.id+'/join','viewer')).status).toBe(500);}finally{process.env.LIVEKIT_SERVER_URL=old;}
    expect(await marker(call.id)).toEqual([]);expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1',[call.id])).rowCount).toBe(0);expect(await state(call.id)).toBe('OPEN');
  });
  it('real session expiration after internal fact write rejects final authority recheck and rolls back fact and admission',async()=>{
    const {call}=await roomCall();let factWritten=false,expirationApplied=false;const original=pg.Client.prototype.query;
    pg.Client.prototype.query=(function(this:pg.Client,...args:unknown[]){
      const q=args[0],sql=typeof q==='string'?q:q&&typeof q==='object'&&'text'in q?String(q.text):'';
      const values=Array.isArray(args[1])?args[1]:q&&typeof q==='object'&&'values'in q&&Array.isArray(q.values)?q.values:[];
      if(factWritten&&!expirationApplied&&/^SELECT user_id FROM session WHERE id=/.test(sql)&&values.includes('sess-viewer')){
        expirationApplied=true;return pool.query("UPDATE session SET expires_at=now()-interval '1 minute' WHERE id='sess-viewer'").then(()=>Reflect.apply(original,this,args));
      }
      const result=Reflect.apply(original,this,args);
      if(/^INSERT INTO webhook_events/.test(sql)&&(sql.includes('FG_ADMISSION_COMMITTED')||values.includes('FG_ADMISSION_COMMITTED'))&&result&&typeof result.then==='function')result.then(()=>{factWritten=true;},()=>{});
      return result;
    }) as typeof pg.Client.prototype.query;
    try{expect((await post('calls/'+call.id+'/join','viewer')).status).toBe(401);expect(factWritten).toBe(true);expect(expirationApplied).toBe(true);}
    finally{pg.Client.prototype.query=original;}
    expect(await marker(call.id)).toEqual([]);expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1',[call.id])).rowCount).toBe(0);expect(await state(call.id)).toBe('OPEN');
  });
`;const end=text.lastIndexOf('\n});');assert(end>=0);text=text.slice(0,end)+additions+text.slice(end);assert.equal(ts.createSourceFile('test.ts',text,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);const folder=d+'/cascade-empty-call-tests2';fs.mkdirSync(folder);const target=folder+'/t30-cascade-empty-call.integration.spec.ts';fs.writeFileSync(target,text,{flag:'wx'});fs.writeFileSync(d+'/cascade-empty-call-jest2.config.cjs',fs.readFileSync(d+'/cascade-empty-call-jest1.config.cjs','utf8').replaceAll('cascade-empty-call-tests1','cascade-empty-call-tests2'),{flag:'wx'});fs.writeFileSync(d+'/run-cascade-empty-call2.mjs',fs.readFileSync(d+'/run-cascade-empty-call1.mjs','utf8').replaceAll('cascade-empty-call-tests1','cascade-empty-call-tests2').replaceAll('cascade-empty-call-jest1','cascade-empty-call-jest2'),{flag:'wx'});fs.writeFileSync(d+'/cascade-empty-call-fixture-review-2.json',JSON.stringify({recordedAt:new Date().toISOString(),reviewer:'Codex',base:{path:source,sha256:h(source)},reviewed:{path:target,sha256:h(target)},originalSixCasesByteRetained:true,addedActualCases:['commit idempotent fact with callId only','denied membership no fact','real native port failure actual transaction rollback','actual separate PostgreSQL session expiry after successful fact INSERT; original actor SELECT must reject401 and transaction roll back all'],faultHook:'Calls final actor only after actual INSERT success; all other queries delegated exactly; always restore in finally. Real own session UPDATE; no fabricated return/native authority.',noBrowserUi:true,sourceImplementationPending:true,nativeApplicationAcceptance:false},null,2)+'\n',{flag:'wx'});console.log('Prepared 10-case fixture with original six unchanged and actual rollback/idempotency controls.');
