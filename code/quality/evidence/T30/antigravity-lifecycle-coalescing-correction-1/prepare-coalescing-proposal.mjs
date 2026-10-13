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

// 1. Line ending detection (CRLF vs LF)
const isCrlf = originalTs.includes('\r\n');
const eol = isCrlf ? '\r\n' : '\n';

// 2. Exact source pins verification
const originalSha = sha256(originalTs);
const compiledSha = sha256(compiledJs);
const expectedOriginalSha = '425de19a1f3c14f9da6c17e2fd6781f8d5bca310a80566d6311e370d8682a865';
const expectedCompiledSha = '7440b21cf469f64fbc188525d6deda2401b74e7a3f5942e082a3971b69972260';

assert.equal(originalSha, expectedOriginalSha, 'Original TypeScript SHA256 pin mismatch');
assert.equal(compiledSha, expectedCompiledSha, 'Compiled JavaScript SHA256 pin mismatch');

// 3. Extract and verify reconcilePass body vs original reconcileGroup body
function normalizeEol(str) {
  return str.replaceAll('\r\n', '\n');
}

const origStartTag = 'private async reconcileGroup(id:string,ended?:{identity:string;at:number}){';
const origEndTag = 'if(closed)await this.deleteNative(id);' + eol + ' }';
const origStartIndex = originalTs.indexOf(origStartTag);
assert(origStartIndex !== -1, 'Original reconcileGroup start tag missing');
const origEndIndex = originalTs.indexOf(origEndTag, origStartIndex);
assert(origEndIndex !== -1, 'Original reconcileGroup end tag missing');
const originalBody = originalTs.slice(origStartIndex + origStartTag.length, origEndIndex + origEndTag.length - 2 - (isCrlf ? 1 : 0)).trim();

const propStartTag = 'private async reconcilePass(id:string,ended?:{identity:string;at:number}){';
const propStartIndex = proposedTs.indexOf(propStartTag);
assert(propStartIndex !== -1, 'Proposed reconcilePass start tag missing');
const propEndIndex = proposedTs.indexOf(origEndTag.replace(/\r?\n/, proposedTs.includes('\r\n') ? '\r\n' : '\n'), propStartIndex);
assert(propEndIndex !== -1, 'Proposed reconcilePass end tag missing');
const propEol = proposedTs.includes('\r\n') ? '\r\n' : '\n';
const proposedBody = proposedTs.slice(propStartIndex + propStartTag.length, propEndIndex + origEndTag.length - 2 - (proposedTs.includes('\r\n') ? 1 : 0)).trim();

assert.equal(normalizeEol(proposedBody), normalizeEol(originalBody), 'reconcilePass body does not match original reconcileGroup body');

// 4. Invariant checks
assert(proposedTs.includes('private async reconcileGroup('), 'reconcileGroup must retain private visibility');
assert(proposedTs.includes('max:8,connectionTimeoutMillis:5000,statement_timeout:15000'), 'Pool config must remain unchanged');
assert(proposedTs.includes('requestTimeout:3'), 'LiveKit requestTimeout must remain 3');
assert(proposedTs.includes('SELECT id FROM rooms WHERE id=$1 FOR UPDATE'), 'Room lock FOR UPDATE must remain unchanged');
assert(proposedTs.includes('call_groups WHERE id=$1 FOR UPDATE'), 'Group lock FOR UPDATE must remain unchanged');
assert(proposedTs.includes('FOR UPDATE OF m'), 'Member lock FOR UPDATE OF m must remain unchanged');
assert(proposedTs.includes('while(this.inFlight.size>0)'), 'onModuleDestroy must cleanly drain in-flight passes');
assert(!proposedTs.includes('while(!this.closing&&'), 'runGroup worker loop must NOT cancel accepted work on shutdown');

const summary = {
  verifiedAt: new Date().toISOString(),
  target: 'apps/api/src/modules/calls/call-lifecycle.service.ts',
  pins: {
    originalTs: { path: 'apps/api/src/modules/calls/call-lifecycle.service.ts', sha256: originalSha, matchesPin: true },
    compiledJs: { path: 'apps/api/dist/modules/calls/call-lifecycle.service.js', sha256: compiledSha, matchesPin: true },
    proposedTs: { path: 'quality/evidence/T30/antigravity-lifecycle-coalescing-correction-1/call-lifecycle.service.ts', sha256: sha256(proposedTs) }
  },
  bodyReversalProof: {
    originalMethod: 'reconcileGroup',
    proposedHelper: 'reconcilePass',
    exactMatch: true
  },
  invariantsVerified: true,
  nativeAcceptance: false
};

console.log(JSON.stringify(summary, null, 2));

export {summary, originalSha, compiledSha};
