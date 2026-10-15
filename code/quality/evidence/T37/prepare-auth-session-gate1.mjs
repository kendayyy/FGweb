import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T37',j=p=>JSON.parse(fs.readFileSync(p)),h=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');assert.equal(j(d+'/codex-t37-auth-session-race-red-1.json').exitCode,1);
const runs=fs.readdirSync(d).filter(p=>p.startsWith('auth-race-')&&fs.existsSync(d+'/'+p+'/race-result.json'));assert(runs.some(p=>{const r=j(d+'/'+p+'/race-result.json');return r.loginStatus===200&&r.banStatus===200&&r.remainingTargetSessions===1&&r.oldCookieAfterUnbanStatus===200;}));
const bytes=fs.readFileSync('quality/tasks.json','utf8'),ledger=JSON.parse(bytes),before=structuredClone(ledger.tasks),task=ledger.tasks.find(t=>t.id==='T37'),auth='apps/api/src/modules/auth/auth.service.ts',review=d+'/auth-session-gate-scope1.json';assert.equal(task.status,'IN_PROGRESS');
fs.writeFileSync(review,JSON.stringify({at:new Date().toISOString(),reviewer:'Codex',path:auth,beforeSha256:h(auth),observed:'Real BetterAuth credential INSERT paused in owned PG trigger; BAN committed first, INSERT resumed, one stale session survived and old cookie returned200afterUNBAN.',red:d+'/codex-t37-auth-session-race-red-1.json',remedy:'Per-user transaction advisory gate covering actual Drizzle session INSERT and ban-state recheck; same gate acquired before BAN session drain. Preserve hooks, native adapter, password checks, early session drain/lock ordering and default sequential adapter transaction semantics.',productionTriggers:false,mainMigration:false,unresolvedSourceFindings:[],acceptancePending:true},null,2)+'\n',{flag:'wx'});
task.writeAllowlist.push(auth);task.approvedScopeAmendments.push({source:review,reason:'Native credential-vs-BAN RED proves stale-session resurrection; exact adapter creation synchronization required by T37 stale-session acceptance.',paths:[auth]});for(const r of before)if(r.id!=='T37')assert.deepEqual(ledger.tasks.find(t=>t.id===r.id),r);assert.equal(fs.readFileSync('quality/tasks.json','utf8'),bytes);fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
const files=[];function propose(path,s,name){const proposed=d+'/'+name;fs.writeFileSync(proposed,s,{flag:'wx'});files.push({path,proposed,beforeSha256:h(path),afterSha256:h(proposed)});}
let s=fs.readFileSync(auth,'utf8');const original=`    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),`;assert(s.replaceAll('\r\n','\n').includes(original));s=s.replaceAll('\r\n','\n');
const factory=`  const adapterConfig = {provider:'pg' as const,schema:{user:schema.user,session:schema.session,account:schema.account,verification:schema.verification}};
  const database:ReturnType<typeof drizzleAdapter> = authOptions => {
    const adapter=drizzleAdapter(db,adapterConfig)(authOptions);
    const guarded:typeof adapter={...adapter,
      create:async input=>{
        if(input.model!=='session')return adapter.create(input);
        const userId=input.data.userId;
        if(typeof userId!=='string')throw new APIError('BAD_REQUEST',{message:'Session user required'});
        // Hold the same per-user gate as BAN until the real INSERT commits.
        // The earlier database hook alone cannot cover an in-flight SQL write.
        return db.transaction(async tx=>{
          await tx.execute(sql\`SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_auth_session',current_schema(),\${userId}::text)::text,0))\`);
          const [latest]=await tx.select({action:schema.adminActions.action}).from(schema.adminActions).where(and(eq(schema.adminActions.targetUserId,userId),inArray(schema.adminActions.action,['BAN','UNBAN']))).orderBy(desc(schema.adminActions.createdAt),desc(schema.adminActions.id)).limit(1);
          if(latest?.action==='BAN')throw new APIError('FORBIDDEN',{code:'ACCOUNT_BANNED',message:'Tài khoản đã bị khóa.'});
          return drizzleAdapter(tx,adapterConfig)(authOptions).create(input);
        });
      },
      // Preserve the configured adapter's default sequential fallback, while
      // ensuring session creates inside Better Auth callbacks use this gate.
      transaction:async callback=>callback(guarded),
    };
    return guarded;
  };
`;
s=s.replace('  return betterAuth({',factory+'  return betterAuth({').replace(original,'    database,');propose(auth,s,'auth-session-gated1.ts');
const p='apps/api/src/modules/moderation/moderation.service.ts';s=fs.readFileSync(p,'utf8');const needle='await this.mutex(db);await currentSupportActor(db,actor,true);if(!(await db.query';assert.equal(s.split(needle).length,2);s=s.replace(needle,`await this.mutex(db);await db.query("SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_auth_session',current_schema(),$1::text)::text,0))",[target]);await currentSupportActor(db,actor,true);if(!(await db.query`);propose(p,s,'moderation-auth-session-gated1.ts');
fs.writeFileSync(d+'/auth-session-gate-plan1.json',JSON.stringify({reviewer:'Codex',unresolvedSourceFindings:[],reason:'Fix native credential/BAN race: serialize actual session INSERT commit and ban/unban per-user before session drain, preserving old session-first operation lock order. Observed stale cookie200afterUNBAN must become401.',files},null,2)+'\n',{flag:'wx'});
fs.appendFileSync('../.doc/history.md','\n- Coding and build 3 — T37 — '+new Date().toISOString()+': Actual credential session/BAN race RED confirms remaining session1and stale cookie200afterUNBAN. Prepare exact AuthService scope/adapter transaction gate +matching moderation per-user lock; no production trigger or main migration. Evidence code/'+review+'; acceptance pending.\n');console.log('Prepared exact auth-session gate; native race RED retained.');
