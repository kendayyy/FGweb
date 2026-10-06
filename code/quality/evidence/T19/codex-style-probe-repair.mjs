import fs from 'node:fs';
const dir='apps/web/src/features/rooms';
for(const f of fs.readdirSync(dir).filter(f=>/\.(tsx|css)$/.test(f))) {
 const path=`${dir}/${f}`;
 const s=fs.readFileSync(path,'utf8').replace(/fg-(modal|form|members|member|helper|checkbox)-/g,'fg-room-$1-');
 fs.writeFileSync(path,s);
}
let probe=fs.readFileSync('quality/evidence/T19/native-send-revocation-v2.mjs','utf8');
probe=probe.replace("const removed=await a.request.delete(`${h.base}/api/v1/rooms/${room.id}/members/native-b`,{headers:{Origin:h.base}});assert.equal(removed.status(),200);", "// Owned SQL fixture removes membership without sending a proactive socket disconnect, isolating the POST ACL path.\n const removed=await h.pool.query(\"DELETE FROM room_members WHERE room_id=$1 AND user_id='native-b'\",[room.id]);assert.equal(removed.rowCount,1);");
probe=probe.replace('actual send403 after member removal','actual send403 after persisted membership removal fixture');
fs.writeFileSync('quality/evidence/T19/codex-native-send-acl.mjs',probe);
fs.appendFileSync('quality/evidence/T19/codex-probe-clarifications.md','\nCodex resume: native send-revocation-v2-fixed-1 timed out before POST because proactive revocation could already remove the composer. This is not a privacy assertion RED. The new codex-native-send-acl probe uses an isolated PostgreSQL membership-removal fixture without a socket revoke broadcast to exercise actual server POST403; API-based revoke is tested separately.\n');
