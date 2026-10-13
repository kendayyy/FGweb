import fs from 'node:fs';
import assert from 'node:assert/strict';
const test='apps/api/test/call-gateway.integration.spec.ts';
let text=fs.readFileSync(test,'utf8');
// A CLOSED native room has no participants; retain all absence assertions and
// propagate every native error except actual room-not-found.
assert(text.includes('async function participants(roomName:string)'));
text=text.replaceAll('sfu.listParticipants(join.roomName)','participants(join.roomName)').replaceAll('sfu.listParticipants(first.join.roomName)','participants(first.join.roomName)').replaceAll('sfu.listParticipants(second.join.roomName)','participants(second.join.roomName)');
fs.writeFileSync(test,text);
const probe=fs.readFileSync('quality/evidence/T26/gateway-webrtc-probe.mjs','utf8').replaceAll('quality/evidence/T26/','quality/evidence/T27/').replaceAll('t26_rtc_','t27_rtc_');
fs.writeFileSync('quality/evidence/T27/gateway-webrtc-probe.mjs',probe);
const types=JSON.parse(fs.readFileSync('quality/evidence/T26/test-types.json'));
types.include.push('../../../apps/api/test/call-lifecycle.integration.spec.ts');
fs.writeFileSync('quality/evidence/T27/test-types.json',JSON.stringify(types,null,2)+'\n');
console.log('Native T26 assertions preserved with CLOSED room absence; rejoin requires a new group; owned headed probe ready');
