import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

// File paths
const originalTsPath = path.resolve(root, 'apps/api/src/modules/calls/call-lifecycle.service.ts');
const compiledJsPath = path.resolve(root, 'apps/api/dist/modules/calls/call-lifecycle.service.js');
const proposedTsPath = path.resolve(__dirname, 'call-lifecycle.service.ts');

const originalTs = fs.readFileSync(originalTsPath, 'utf8');
const compiledJs = fs.readFileSync(compiledJsPath, 'utf8');
const proposedTs = fs.readFileSync(proposedTsPath, 'utf8');

// 1. Verify exact source pins from prompt
const originalSha = sha256(originalTs);
const compiledSha = sha256(compiledJs);
const expectedOriginalSha = '425de19a1f3c14f9da6c17e2fd6781f8d5bca310a80566d6311e370d8682a865';
const expectedCompiledSha = '7440b21cf469f64fbc188525d6deda2401b74e7a3f5942e082a3971b69972260';

assert.equal(originalSha, expectedOriginalSha, 'Original TypeScript SHA256 pin mismatch');
assert.equal(compiledSha, expectedCompiledSha, 'Compiled JavaScript SHA256 pin mismatch');

// 2. Extract original reconcileGroup body
const origStartTag = 'private async reconcileGroup(id:string,ended?:{identity:string;at:number}){';
const origEndTag = 'if(closed)await this.deleteNative(id);\n }';
const origStartIndex = originalTs.indexOf(origStartTag);
assert(origStartIndex !== -1, 'Original reconcileGroup start tag not found');
const origEndIndex = originalTs.indexOf(origEndTag, origStartIndex);
assert(origEndIndex !== -1, 'Original reconcileGroup end tag not found');
const originalBody = originalTs.slice(origStartIndex + origStartTag.length, origEndIndex + origEndTag.length - 2).trim();

// 3. Extract proposed reconcilePass body
const propStartTag = 'private async reconcilePass(id:string,ended?:{identity:string;at:number}){';
const propStartIndex = proposedTs.indexOf(propStartTag);
assert(propStartIndex !== -1, 'Proposed reconcilePass start tag not found');
const propEndIndex = proposedTs.indexOf(origEndTag, propStartIndex);
assert(propEndIndex !== -1, 'Proposed reconcilePass end tag not found');
const proposedBody = proposedTs.slice(propStartIndex + propStartTag.length, propEndIndex + origEndTag.length - 2).trim();

// 4. Verify byte-for-byte exact equality of reconcilePass body vs original reconcileGroup body
assert.equal(proposedBody, originalBody, 'reconcilePass body does not match original reconcileGroup body byte-for-byte');

// 5. Invariant verifications
assert(proposedTs.includes("max:8,connectionTimeoutMillis:5000,statement_timeout:15000"), 'Database pool configuration must remain max 8, 5s timeout, 15s statement timeout');
assert(proposedTs.includes("requestTimeout:3"), 'Native media requestTimeout must remain 3s');
assert(proposedTs.includes("SELECT id FROM rooms WHERE id=$1 FOR UPDATE"), 'Room row lock FOR UPDATE must remain strictly exclusive');
assert(proposedTs.includes("SELECT id,room_id,state FROM call_groups WHERE id=$1 FOR UPDATE"), 'Call group row lock FOR UPDATE must remain strictly exclusive');
assert(proposedTs.includes("FOR UPDATE OF m"), 'Member row lock FOR UPDATE OF m must remain strictly exclusive');
assert(proposedTs.includes("await this.transaction(async db=>{"), 'Transaction boundary must remain intact');
assert(proposedTs.includes("liveLease(db,member.lease_id)"), 'liveLease validation must remain intact');
assert(proposedTs.includes("while(this.inFlight.size>0)"), 'onModuleDestroy must cleanly drain all in-flight passes');

const verificationReport = {
  verifiedAt: new Date().toISOString(),
  target: 'apps/api/src/modules/calls/call-lifecycle.service.ts',
  pins: {
    originalTs: { path: 'apps/api/src/modules/calls/call-lifecycle.service.ts', sha256: originalSha, matchesPin: true },
    compiledJs: { path: 'apps/api/dist/modules/calls/call-lifecycle.service.js', sha256: compiledSha, matchesPin: true },
    proposedTs: { path: 'quality/evidence/T30/antigravity-lifecycle-coalescing-1/call-lifecycle.service.ts', sha256: sha256(proposedTs) }
  },
  bodyReversalProof: {
    originalMethod: 'reconcileGroup',
    proposedHelper: 'reconcilePass',
    exactByteReversal: true,
    bodyByteLength: Buffer.byteLength(originalBody, 'utf8')
  },
  invariantsVerified: true,
  coalescingMode: 'PER_GROUP_ORDINARY_BURST_COALESCING_DISTINCT_ENDED_EVENTS',
  nativeAcceptance: false
};

console.log(JSON.stringify(verificationReport, null, 2));

export {verificationReport, originalSha, compiledSha};
