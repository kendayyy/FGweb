import fs from 'node:fs'; import assert from 'node:assert/strict'; import { createHash } from 'node:crypto';
const dir='quality/evidence/CHATCRYPTO-FE', file='packages/contracts/test/chat-crypto-legacy-candidate.test.ts';
const original=fs.readFileSync(file,'utf8'), hash=value=>createHash('sha256').update(value).digest('hex');
const oldVerification="verification={id:'verify',cohortId:'verified',senderUserId:'alice'";
const oldResponse="const response={encrypted:{items:[event],hasMore:false,nextCursor:null},verification:[verification],verificationCursor:null};";
assert.equal(original.split(oldVerification).length,2);assert.equal(original.split(oldResponse).length,2);
let proposed=original.replace(oldVerification,"verification={id:'verify',conversationId:'private',membershipRevision:3,cohortId:'verified',senderUserId:'alice'")
 .replace(oldResponse,"const response={encrypted:{items:[event],hasMore:false,nextCursor:null},verification:[verification],verificationCursor:null,oneTimeKeyCounts:{signed_curve25519:0}};");
const assertion='expect(wire.CryptoSyncResponseSchema.parse(response)).toEqual(response);';assert.equal(proposed.split(assertion).length,2);
proposed=proposed.replace(assertion,assertion+"expect(wire.CryptoSyncResponseSchema.safeParse({...response,oneTimeKeyCounts:undefined}).success).toBe(false);expect(wire.CryptoSyncResponseSchema.safeParse({...response,verification:[{...verification,conversationId:undefined}]}).success).toBe(false);expect(wire.CryptoSyncResponseSchema.safeParse({...response,verification:[{...verification,membershipRevision:undefined}]}).success).toBe(false);");
fs.writeFileSync(`${dir}/stale-sync-fixture-original.txt`,original,{flag:'wx'});
fs.writeFileSync(`${dir}/stale-sync-fixture-proposed.ts`,proposed,{flag:'wx'});
fs.writeFileSync(`${dir}/stale-sync-fixture-proposal.json`,JSON.stringify({recordedAt:new Date().toISOString(),file,beforeSha256:hash(original),proposedSha256:hash(proposed),scopeChangeRequired:true,originalAssertionsPreserved:true,additionalMissingContextAndCountsNegatives:3,historicalPassRowsUnchanged:true,reason:'Frozen legacy queue fixture predates reviewed FE actual sync counts/context prerequisites; full current contracts regression exposed the omission.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({preparedReviewableProposal:true,sourceUnchanged:true,scopeChangeRequired:true}));
