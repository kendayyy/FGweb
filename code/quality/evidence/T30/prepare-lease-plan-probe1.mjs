import fs from 'node:fs';import assert from 'node:assert/strict';const d='quality/evidence/T30',read=n=>fs.readFileSync(d+'/'+n,'utf8'),put=(n,s)=>fs.writeFileSync(d+'/'+n,s,{flag:'wx'});
const original=read('call-participant-lease-batch-tests2/t30-call-participant-lease-batch.integration.spec.ts'),cut=original.indexOf("  describe('1. Single Guarded Lease Query");assert(cut>0);const prefix=original.slice(0,cut);fs.mkdirSync(d+'/lease-plan-tests1');
const probe=String.raw`
  it('records actual prepared lease plans before and after owned-schema statistics without changing application guards',async()=>{
    const fixture=await seedFixture(),client=await pool.connect();
    const ids=[fixture.owner.admissionId,fixture.member2.admissionId,fixture.member3.admissionId];
    let statement:{name:string;text:string;values:unknown[]}|undefined;
    const delegate=client.query,descriptor=Object.getOwnPropertyDescriptor(client,'query');
    const wrapped=function(this:pg.PoolClient,...args:unknown[]){const query=args[0] as {name?:string;text?:string;values?:unknown[]};if(query?.name==='fg_live_call_admissions_v1')statement={name:query.name,text:query.text!,values:query.values!};return (delegate as unknown as (...args:unknown[])=>unknown).apply(this,args);};
    try{
      client.query=wrapped as unknown as typeof client.query;
      const leases=await leaseStore.liveLeases(client,ids);expect(leases).toHaveLength(3);
    }finally{if(descriptor)Object.defineProperty(client,'query',descriptor);else delete (client as unknown as {query?:unknown}).query;}
    const measurements:unknown[]=[];
    try{
      expect(statement).toBeDefined();for(let i=0;i<6;i++)expect((await client.query(statement!)).rows).toHaveLength(3);
      const array='ARRAY['+ids.map(id=>"'"+id.replaceAll("'","''")+"'").join(',')+']::text[]';
      const measure=async(stage:string)=>{
        const plans=[];
        for(let i=0;i<3;i++){
          const result=(await client.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE fg_live_call_admissions_v1('+array+')')).rows[0]['QUERY PLAN'][0];
          expect(result.Plan['Actual Rows']).toBe(3);
          const summary={stage,totalCost:result.Plan['Total Cost'],actualRows:result.Plan['Actual Rows'],planningMs:result['Planning Time'],executionMs:result['Execution Time'],jit:result.JIT?{functions:result.JIT.Functions,timing:result.JIT.Timing}:null,sharedHit:result.Plan['Shared Hit Blocks'],sharedRead:result.Plan['Shared Read Blocks']};plans.push(summary);
        }
        const counters=(await client.query("SELECT generic_plans,custom_plans FROM pg_prepared_statements WHERE name='fg_live_call_admissions_v1'")).rows[0];measurements.push({stage,counters,plans});
      };
      const initial={jit:(await client.query('SHOW jit')).rows[0].jit,jitThreshold:(await client.query('SHOW jit_above_cost')).rows[0].jit_above_cost};
      await measure('seeded-default-statistics');
      const ownedTables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename",[owned])).rows.map(r=>r.tablename);expect(ownedTables.length).toBeGreaterThan(20);
      for(const table of ownedTables){expect(owned).toMatch(/^t30_call_lease_batch_[a-f0-9]{32}$/);await client.query('ANALYZE "'+owned+'"."'+table.replaceAll('"','""')+'"');}
      await measure('owned-schema-analyzed');
      await client.query('SET jit=off');await measure('owned-client-jit-off');await client.query('RESET jit');
      fs.writeFileSync(path.join(root,'quality/evidence/T30/lease-plan-probe1-result.json'),JSON.stringify({at:new Date().toISOString(),actualPg:true,diagnosticOnly:true,initial,measurements,ownedTablesAnalyzed:ownedTables.length,originalLeaseGuardsUnchanged:true,queryDelegateRestored:client.query===delegate},null,2)+'\n',{flag:'wx'});
    }finally{await client.query('RESET jit');client.release();}
  });
});
`;
put('lease-plan-tests1/t30-lease-plan.integration.spec.ts',prefix+probe);
put('lease-plan-jest1.config.cjs',read('call-participant-lease-batch-jest2.config.cjs').replaceAll('call-participant-lease-batch-tests2','lease-plan-tests1').replaceAll('jest-call-participant-lease-batch','jest-lease-plan1'));
put('run-lease-plan-probe1.mjs',read('run-call-participant-lease-batch2.mjs').replaceAll("names=['call-participant-lease-batch']","names=['lease-plan-probe']").replaceAll('call-participant-lease-batch-jest2.config.cjs','lease-plan-jest1.config.cjs').replaceAll('call-participant-lease-batch-tests2/t30-call-participant-lease-batch.integration.spec.ts','lease-plan-tests1/t30-lease-plan.integration.spec.ts'));
fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — '+new Date().toISOString()+': Timing19 healthy PG blocker PID9504 lifecycle group lock from06:03:19.352 through COMMIT06:03:24.048; fresh lease SQL1323ms and subsequent policy512ms, gatewaySHARE57014 at06:03:22.865/23.128/23.736 followed removals; fourthclaim201 afterward. Hypothesis prepared lease plan/statistics/JIT may consume CPU; fresh owned-schema EXPLAIN probe prepared, no application change, durable DB settings untouched. Evidence pending code/'+d+'/lease-plan-probe1-result.json.\n');
console.log('Owned realPG prepared lease EXPLAIN/statistics/JIT diagnostic prepared; one new test, original setup/cleanup reused.');
