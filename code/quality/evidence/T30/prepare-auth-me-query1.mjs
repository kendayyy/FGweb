import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T30',path='apps/api/src/modules/auth/auth.service.ts',before=fs.readFileSync(path,'utf8'),hash=s=>createHash('sha256').update(s).digest('hex');
const red=JSON.parse(fs.readFileSync(d+'/auth-me-query-control2-red/review.json'));assert.equal(red.checks.length,9);assert(red.checks.filter(c=>c.queries!==undefined).every(c=>c.queries===4));assert(red.failure.message.startsWith('INTENDED_RED'));assert(red.cleanup.schemaRemoved&&red.cleanup.clientEnded);
const start=before.indexOf('    const [dbUser]',before.indexOf('  public async getUserMe(')),end=before.indexOf('    const meData =',start);assert(start>0&&end>start);const old=before.slice(start,end);
const next=`    // One statement returns one coherent persisted profile snapshot. Session and
    // live ban checks remain in SessionGuard for every request.
    const [row] = await this.db.select({
      user: schema.user,
      profile: schema.profiles,
      discordAccountId: sql<string | null>\`(SELECT \${schema.account.accountId} FROM \${schema.account}
        WHERE \${schema.account.userId}=\${schema.user.id} AND \${schema.account.providerId}='discord' LIMIT 1)\`,
      interests: sql<string[]>\`COALESCE((SELECT jsonb_agg(\${schema.games.title} ORDER BY \${schema.games.title})
        FROM \${schema.gameInterests} INNER JOIN \${schema.games} ON \${schema.gameInterests.gameId}=\${schema.games.id}
        WHERE \${schema.gameInterests.userId}=\${schema.user.id}), '[]'::jsonb)\`,
    }).from(schema.user)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.user.id))
      .where(eq(schema.user.id, userId));

    if (!row) {
      throw new Error(\`User not found: \${userId}\`);
    }
    const {user: dbUser, profile, interests, discordAccountId} = row;

`;
const edits=[["import { eq, desc, and, inArray } from 'drizzle-orm';","import { eq, desc, and, inArray, sql } from 'drizzle-orm';"],[old,next],['discordId: discordAccount?.accountId??null,','discordId: discordAccountId??null,'],['interestedGames: interests.map(interest => interest.title),','interestedGames: interests,']];let after=before;for(const[a,b]of edits){assert.equal(after.split(a).length,2);after=after.replace(a,b);}let reversed=after;for(const[a,b]of [...edits].reverse())reversed=reversed.replace(b,a);assert.equal(reversed,before);
const proposed=d+'/auth-me-query-reviewed1.ts';fs.writeFileSync(proposed,after,{flag:'wx'});
const plan={reviewer:'Codex',unresolvedSourceFindings:[],reason:'T30 browser timing13 shows /me bootstrap delay; meaningful real PG RED9 verifies current DTO/identity/avatar/onboarding/fresh changes while eight successful reads each use four SQL roundtrips. Replace only getUserMe persisted-data reads with one typed Drizzle statement using scalar Discord and ordered game aggregates to avoid fanout. Preserve SessionGuard live session/ban, returned schema, missing user rejection, all auth mutations and other methods. Green/regressions/full native required; no PASS.',files:[{path,proposed,beforeSha256:hash(before),afterSha256:hash(after)}]};
fs.writeFileSync(d+'/auth-me-query-adoption-plan1.json',JSON.stringify(plan,null,2)+'\n',{flag:'wx'});fs.writeFileSync(d+'/auth-me-query-source-review1.json',JSON.stringify({at:new Date().toISOString(),...plan,reverseByteExact:true,edits,sessionGuardSha256:hash(fs.readFileSync('apps/api/src/common/session.guard.ts'))},null,2)+'\n',{flag:'wx'});
console.log('Prepared narrow getUserMe single-statement profile read; rest byte exact and fresh SessionGuard unchanged.');
