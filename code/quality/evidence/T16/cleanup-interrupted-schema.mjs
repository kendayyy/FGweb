import pg from 'pg';import assert from 'node:assert/strict';
const owned='t16_1791217801136_9dcuy6';
assert(/^t16_[0-9]+_[a-z0-9]+$/.test(owned));
const created=Number(owned.split('_')[1]);
assert(created>=Date.parse('2026-10-05T16:16:48Z')&&created<Date.parse('2026-10-05T16:32:31Z'));
// Exact disposable T16 fixture from interrupted initial test; never target public or computed wildcard.
const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
try {
  const users=(await client.query(`SELECT id,email FROM "${owned}"."user" ORDER BY id`)).rows;
  assert.deepEqual(users,[{id:'outsider',email:'outsider@example.com'},{id:'user1',email:'user1@example.com'},{id:'user2',email:'user2@example.com'}]);
  assert.equal((await client.query(`SELECT count(*)::int AS n FROM "${owned}".messages`)).rows[0].n,0);
  await client.query(`DROP SCHEMA "${owned}" CASCADE`);
  console.log(JSON.stringify({removedExactInterruptedTestSchema:owned,fixtureIdentityVerified:true,publicUntouched:true}));
}finally{await client.end();}
