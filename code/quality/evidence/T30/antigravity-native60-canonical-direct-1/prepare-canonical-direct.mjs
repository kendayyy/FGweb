import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../../..');

function sha256(content){
 return createHash('sha256').update(content).digest('hex');
}

// File paths
const originalHelperPath=path.resolve(root,'quality/evidence/T30/private-gateway-shaped-fixture.mjs');
const canonicalHelperPath=path.resolve(__dirname,'private-gateway-canonical-direct-reviewed1.mjs');
const directSupportPath=path.resolve(__dirname,'gateway-direct-support-reviewed1.mjs');
const originalFixturePath=path.resolve(root,'quality/evidence/T30/fixture-server-build2-inspector-reserved-reviewed1.mjs');
const canonicalFixturePath=path.resolve(__dirname,'fixture-server-canonical-direct-reviewed1.mjs');

// 1. Read files
const originalHelperContent=fs.readFileSync(originalHelperPath,'utf8');
const canonicalHelperContent=fs.readFileSync(canonicalHelperPath,'utf8');
const directSupportContent=fs.readFileSync(directSupportPath,'utf8');
const originalFixtureContent=fs.readFileSync(originalFixturePath,'utf8');
const canonicalFixtureContent=fs.readFileSync(canonicalFixturePath,'utf8');

// 2. Counted exact anchors definition
const helperAnchors=[
 {
  index:1,
  name:'DirectSupportImport',
  original:"import {fileURLToPath} from 'node:url';\nconst root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');",
  canonical:"import {fileURLToPath} from 'node:url';\nimport {prepareDirectDatabase,createDirectGateway,inspectDirectCleanup} from './gateway-direct-support-reviewed1.mjs';\nconst root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');"
 },
 {
  index:2,
  name:'DirectDatabasePreflight',
  original:" const connection=new URL(databaseURL);connection.hostname='host.docker.internal';",
  canonical:" const directDatabase=prepareDirectDatabase(docker,databaseURL),connection=directDatabase.connection;"
 },
 {
  index:3,
  name:'DirectCleanupVerification',
  original:"  result.networkRemoved=!docker(['network','ls','--filter',`name=^${network}$`,'--format','{{.Name}}']).trim();\n  fs.writeFileSync(`${dir}/cleanup.json`,JSON.stringify(result,null,2)+'\n');return result;",
  canonical:"  result.networkRemoved=!docker(['network','ls','--filter',`name=^${network}$`,'--format','{{.Name}}']).trim();\n  Object.assign(result,inspectDirectCleanup(docker,directDatabase));\n  fs.writeFileSync(`${dir}/cleanup.json`,JSON.stringify(result,null,2)+'\n');\n  assert(result.mainServicesUnchanged&&result.existingNetworkUnchanged,'Direct route cleanup verification incomplete');return result;"
 },
 {
  index:4,
  name:'DirectGatewayCreationAndNetworkAttachment',
  original:"  const gateway=docker(['run','-d','--name',`fg-gateway-${id}`,'--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','node','-p','127.0.0.1::7883','--mount',`type=bind,source=${path.resolve(root,'apps/api/dist/modules/calls')},target=/gateway/app,readonly`,'--mount',`type=bind,source=${path.resolve(root,'node_modules')},target=/gateway/node_modules,readonly`,'--mount',`type=bind,source=${path.resolve(dir,'gateway.json')},target=/gateway/input.json,readonly`,nodeImage,'node','/gateway/app/gateway-main.js','/gateway/input.json']).trim();containers.push(gateway);",
  canonical:"  const gateway=createDirectGateway({docker,containers,id,network,args:['create','--pull=never','--label',`fg-owner=t30-gateway-${id}`,'--name',`fg-gateway-${id}`,'--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','node','-p','127.0.0.1::7883','--mount',`type=bind,source=${path.resolve(root,'apps/api/dist/modules/calls')},target=/gateway/app,readonly`,'--mount',`type=bind,source=${path.resolve(root,'node_modules')},target=/gateway/node_modules,readonly`,'--mount',`type=bind,source=${path.resolve(dir,'gateway.json')},target=/gateway/input.json,readonly`,nodeImage,'node','/gateway/app/gateway-main.js','/gateway/input.json']});"
 }
];

const fixtureAnchors=[
 {
  index:1,
  name:'CanonicalDirectGatewayFixtureImport',
  original:"import {startGatewayFixture} from './private-gateway-shaped-fixture.mjs';",
  canonical:"import {startGatewayFixture} from './private-gateway-canonical-direct-reviewed1.mjs';"
 }
];

// 3. Verify counted exact anchors in helper
for(const a of helperAnchors){
 assert(originalHelperContent.includes(a.original),`Original helper missing original pattern for anchor ${a.index} (${a.name})`);
 assert(canonicalHelperContent.includes(a.canonical),`Canonical helper missing canonical pattern for anchor ${a.index} (${a.name})`);
}

// 4. Verify counted exact anchor in fixture server
for(const a of fixtureAnchors){
 assert(originalFixtureContent.includes(a.original),`Original fixture missing original pattern for anchor ${a.index} (${a.name})`);
 assert(canonicalFixtureContent.includes(a.canonical),`Canonical fixture missing canonical pattern for anchor ${a.index} (${a.name})`);
}

// 5. Test forward transformation
let forwardHelper=originalHelperContent;
for(const a of helperAnchors){
 forwardHelper=forwardHelper.replace(a.original,a.canonical);
}
assert.equal(forwardHelper,canonicalHelperContent,'Forward transformation of helper did not produce canonical helper');

let forwardFixture=originalFixtureContent;
for(const a of fixtureAnchors){
 forwardFixture=forwardFixture.replace(a.original,a.canonical);
}
assert.equal(forwardFixture,canonicalFixtureContent,'Forward transformation of fixture did not produce canonical fixture');

// 6. Test reverse byte equality
let reverseHelper=canonicalHelperContent;
for(const a of [...helperAnchors].reverse()){
 reverseHelper=reverseHelper.replace(a.canonical,a.original);
}
assert.equal(reverseHelper,originalHelperContent,'Reverse transformation of helper did not match original helper byte-for-byte');

let reverseFixture=canonicalFixtureContent;
for(const a of fixtureAnchors){
 reverseFixture=reverseFixture.replace(a.canonical,a.original);
}
assert.equal(reverseFixture,originalFixtureContent,'Reverse transformation of fixture did not match original fixture byte-for-byte');

// 7. Verify zero-instrumentation invariant
assert(!canonicalHelperContent.includes('preload.cjs'),'Canonical gateway must NOT include preload.cjs');
assert(!canonicalHelperContent.includes('startup-entry.cjs'),'Canonical gateway must NOT include startup wrapper');
assert(!canonicalHelperContent.includes('-r /gateway/preload.cjs'),'Canonical gateway must NOT specify -r flag');
assert(canonicalHelperContent.includes("nodeImage,'node','/gateway/app/gateway-main.js','/gateway/input.json'"),'Canonical gateway must launch pure compiled gateway-main directly');
assert(!canonicalFixtureContent.includes('api57-observer'),'Canonical fixture must NOT include API observer');
assert(!canonicalFixtureContent.includes('api56-observer'),'Canonical fixture must NOT include API observer');

// 8. Calculate SHA256 hashes
const hashes={
 originalHelper:{
  path:'quality/evidence/T30/private-gateway-shaped-fixture.mjs',
  sha256:sha256(originalHelperContent),
  bytes:Buffer.byteLength(originalHelperContent,'utf8')
 },
 canonicalHelper:{
  path:'quality/evidence/T30/antigravity-native60-canonical-direct-1/private-gateway-canonical-direct-reviewed1.mjs',
  sha256:sha256(canonicalHelperContent),
  bytes:Buffer.byteLength(canonicalHelperContent,'utf8')
 },
 directSupport:{
  path:'quality/evidence/T30/antigravity-native60-canonical-direct-1/gateway-direct-support-reviewed1.mjs',
  sha256:sha256(directSupportContent),
  bytes:Buffer.byteLength(directSupportContent,'utf8')
 },
 originalFixture:{
  path:'quality/evidence/T30/fixture-server-build2-inspector-reserved-reviewed1.mjs',
  sha256:sha256(originalFixtureContent),
  bytes:Buffer.byteLength(originalFixtureContent,'utf8')
 },
 canonicalFixture:{
  path:'quality/evidence/T30/antigravity-native60-canonical-direct-1/fixture-server-canonical-direct-reviewed1.mjs',
  sha256:sha256(canonicalFixtureContent),
  bytes:Buffer.byteLength(canonicalFixtureContent,'utf8')
 }
};

const resultReport={
 verifiedAt:new Date().toISOString(),
 planId:'antigravity-native60-canonical-direct-1',
 targetTask:'T30',
 status:'VERIFIED',
 nativeAcceptance:false,
 countedExactAnchors:{
  helperAnchorCount:helperAnchors.length,
  fixtureAnchorCount:fixtureAnchors.length,
  totalAnchorCount:helperAnchors.length+fixtureAnchors.length
 },
 helperReverseByteExact:reverseHelper===originalHelperContent,
 fixtureReverseByteExact:reverseFixture===originalFixtureContent,
 zeroInstrumentationVerified:true,
 directNetworkAttachmentVerified:true,
 hashes
};

export {resultReport,helperAnchors,fixtureAnchors,hashes};
