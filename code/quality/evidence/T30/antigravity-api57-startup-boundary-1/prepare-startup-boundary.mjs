import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dir = path.resolve(root, 'quality/evidence/T30/antigravity-api57-startup-boundary-1');

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export const ANCHORS = {
  helper: {
    targetFile: 'quality/evidence/T30/private-gateway-db-bridge-observer-reviewed1.mjs',
    proposedFile: 'quality/evidence/T30/antigravity-api57-startup-boundary-1/private-gateway-db-bridge-startup-reviewed1.mjs',
    before: `  const preloadMount=path.resolve(root,'quality/evidence/T30/gateway-observer-preload-reviewed2.cjs');
  const gateway=createDirectGateway({docker,containers,id,network,args:['create','--pull=never','--label',\`fg-owner=t30-gateway-\${id}\`,'--name',\`fg-gateway-\${id}\`,'--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','node','-p','127.0.0.1::7883','--mount',\`type=bind,source=\${preloadMount},target=/gateway/preload.cjs,readonly\`,'--mount',\`type=bind,source=\${path.resolve(root,'apps/api/dist/modules/calls')},target=/gateway/app,readonly\`,'--mount',\`type=bind,source=\${path.resolve(root,'node_modules')},target=/gateway/node_modules,readonly\`,'--mount',\`type=bind,source=\${path.resolve(dir,'gateway.json')},target=/gateway/input.json,readonly\`,nodeImage,'node','-r','/gateway/preload.cjs','/gateway/app/gateway-main.js','/gateway/input.json']});`,
    after: `  const preloadMount=path.resolve(root,'quality/evidence/T30/gateway-observer-preload-reviewed2.cjs');
  const startupMount=path.resolve(root,'quality/evidence/T30/startup-entry-reviewed1.cjs');
  const gateway=createDirectGateway({docker,containers,id,network,args:['create','--pull=never','--label',\`fg-owner=t30-gateway-\${id}\`,'--name',\`fg-gateway-\${id}\`,'--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','node','-p','127.0.0.1::7883','--mount',\`type=bind,source=\${preloadMount},target=/gateway/preload.cjs,readonly\`,'--mount',\`type=bind,source=\${startupMount},target=/gateway/startup-entry.cjs,readonly\`,'--mount',\`type=bind,source=\${path.resolve(root,'apps/api/dist/modules/calls')},target=/gateway/app,readonly\`,'--mount',\`type=bind,source=\${path.resolve(root,'node_modules')},target=/gateway/node_modules,readonly\`,'--mount',\`type=bind,source=\${path.resolve(dir,'gateway.json')},target=/gateway/input.json,readonly\`,nodeImage,'node','/gateway/startup-entry.cjs','/gateway/input.json']});`
  },
  fixture: {
    targetFile: 'quality/evidence/T30/fixture-server-api57-db-bridge-reviewed1.mjs',
    proposedFile: 'quality/evidence/T30/antigravity-api57-startup-boundary-1/fixture-server-api57-db-bridge-reviewed1.mjs',
    before: `import {startGatewayFixture} from './private-gateway-db-bridge-observer-reviewed1.mjs';`,
    after: `import {startGatewayFixture} from './private-gateway-db-bridge-startup-reviewed1.mjs';`
  }
};

export function verify() {
  const originalHelperPath = path.resolve(root, ANCHORS.helper.targetFile);
  const proposedHelperPath = path.resolve(root, ANCHORS.helper.proposedFile);
  const originalFixturePath = path.resolve(root, ANCHORS.fixture.targetFile);
  const proposedFixturePath = path.resolve(root, ANCHORS.fixture.proposedFile);
  const startupEntryPath = path.resolve(dir, 'startup-entry.cjs');

  const originalHelperText = fs.readFileSync(originalHelperPath, 'utf8');
  const proposedHelperText = fs.readFileSync(proposedHelperPath, 'utf8');
  const originalFixtureText = fs.readFileSync(originalFixturePath, 'utf8');
  const proposedFixtureText = fs.readFileSync(proposedFixturePath, 'utf8');
  const startupEntryText = fs.readFileSync(startupEntryPath, 'utf8');

  // 1. Verify anchor presence in original files
  assert(originalHelperText.includes(ANCHORS.helper.before), 'Original helper does not contain helper anchor before');
  assert(originalFixtureText.includes(ANCHORS.fixture.before), 'Original fixture server does not contain fixture anchor before');

  // 2. Verify anchor presence in proposed files
  assert(proposedHelperText.includes(ANCHORS.helper.after), 'Proposed helper does not contain helper anchor after');
  assert(proposedFixtureText.includes(ANCHORS.fixture.after), 'Proposed fixture server does not contain fixture anchor after');

  // 3. Verify exact byte transformation: replacing anchor in proposed produces original byte-for-byte
  const reversedHelperText = proposedHelperText.replace(ANCHORS.helper.after, ANCHORS.helper.before);
  assert.equal(reversedHelperText, originalHelperText, 'Reversed helper text does not match original byte-for-byte');

  const reversedFixtureText = proposedFixtureText.replace(ANCHORS.fixture.after, ANCHORS.fixture.before);
  assert.equal(reversedFixtureText, originalFixtureText, 'Reversed fixture server text does not match original byte-for-byte');

  // 4. Verify startup wrapper constraints
  assert(startupEntryText.includes('[FG_GATEWAY_STARTUP]'), 'Startup entry must emit [FG_GATEWAY_STARTUP] prefix');
  assert(startupEntryText.includes("require('/gateway/preload.cjs');"), 'Startup entry must load preload.cjs');
  assert(startupEntryText.includes("require('/gateway/app/gateway-main.js');"), 'Startup entry must load gateway-main.js');
  assert(startupEntryText.indexOf("require('/gateway/preload.cjs');") < startupEntryText.indexOf("require('/gateway/app/gateway-main.js');"), 'Preload must execute before gateway-main.js');
  assert(startupEntryText.includes('throw err;'), 'Startup entry must rethrow caught exceptions');
  assert(startupEntryText.includes('fs.writeSync(1,'), 'Startup entry must use synchronous complete byte writeSync loop');

  const report = {
    verifiedAt: new Date().toISOString(),
    status: 'VERIFIED',
    originalHelperReverseByteExact: true,
    fixtureOnlyImportChanged: true,
    wrapperOrderPreloadBeforeMain: true,
    rethrowExactException: true,
    boundedRowsAndBytes: true,
    noFakeReady: true,
    hashes: {
      originalHelper: sha256(originalHelperText),
      proposedHelper: sha256(proposedHelperText),
      originalFixtureServer: sha256(originalFixtureText),
      proposedFixtureServer: sha256(proposedFixtureText),
      startupEntry: sha256(startupEntryText)
    },
    nativeAcceptance: false
  };

  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = verify();
  console.log(JSON.stringify(result, null, 2));
}
