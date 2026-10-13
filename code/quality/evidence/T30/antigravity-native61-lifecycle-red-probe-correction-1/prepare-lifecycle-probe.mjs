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

// Canonical source path
const canonicalFixturePath = path.resolve(root, 'quality/evidence/T30/fixture-server-canonical-direct-reviewed1.mjs');
const targetProposalFixturePath = path.resolve(__dirname, 'fixture-server-lifecycle-probe-reviewed1.mjs');

// 1. Read canonical source
const canonicalContent = fs.readFileSync(canonicalFixturePath, 'utf8');

// 2. Exact counted insertion anchors
const anchors = [
  {
    index: 1,
    name: 'AnchorA_ServiceResolutionAndTimerIsolation',
    description: 'After Nest app.listen, obtain actual service instance via FG_CALL_LIFECYCLE token, clear background sweep timer, and await any in-flight sweep before ready.',
    original: "mark('api');const {AppModule}=await import('../../../apps/api/dist/app.module.js');app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});app.use('/api/media/webhook',raw({type:()=>true,limit:'64kb'}));await app.listen(apiPort,'0.0.0.0');const api=`http://127.0.0.1:${apiPort}`;",
    adapted: "mark('api');const {AppModule}=await import('../../../apps/api/dist/app.module.js');app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});app.use('/api/media/webhook',raw({type:()=>true,limit:'64kb'}));await app.listen(apiPort,'0.0.0.0');const api=`http://127.0.0.1:${apiPort}`;const actualLifecycle=app.get('FG_CALL_LIFECYCLE');if(actualLifecycle?.timer){clearInterval(actualLifecycle.timer);actualLifecycle.timer=undefined;}if(actualLifecycle?.running){await actualLifecycle.running.catch(()=>{});}"
  },
  {
    index: 2,
    name: 'AnchorB_LifecycleProbeIpcHandler',
    description: 'In IPC handler, add kind lifecycle-probe using real compiled service, exact real SDK delayed wrapper (40ms test-only delay, no invented fallback), warming delay, 4 concurrent triggers, and real PG blocking sampling from retained inspector client.',
    original: " process.on('message',async message=>{\n  if(message.kind==='shape')try{assert(fixture.shaperControl);",
    adapted: " process.on('message',async message=>{\n  if(message.kind==='lifecycle-probe')try{\n   const actualLifecycle=app.get('FG_CALL_LIFECYCLE');assert(actualLifecycle,'FG_CALL_LIFECYCLE service instance missing');\n   await new Promise(r=>setTimeout(r,150));\n   const origNative=actualLifecycle.native.bind(actualLifecycle);\n   let actualListRoomsCalls=0,actualListParticipantsCalls=0;\n   actualLifecycle.native=function(){\n    const client=origNative(),origListRooms=client.listRooms.bind(client),origListParticipants=client.listParticipants.bind(client);\n    client.listRooms=async function(...args){actualListRoomsCalls++;await new Promise(r=>setTimeout(r,40));return origListRooms(...args);};\n    client.listParticipants=async function(...args){actualListParticipantsCalls++;await new Promise(r=>setTimeout(r,40));return origListParticipants(...args);};\n    return client;\n   };\n   let completedCount=0,failedCount=0;\n   const blockingSamples=[];let sampling=true;\n   const samplePromise=(async()=>{\n    while(sampling){\n     try{\n      const res=await inspectorClient.query(\"SELECT pid,wait_event_type,wait_event,state,array_to_string(pg_blocking_pids(pid),',') AS blocking_pids FROM pg_stat_activity WHERE datname=current_database() AND pid!=pg_backend_pid() AND wait_event_type IS NOT NULL\");\n      if(res.rows.length)blockingSamples.push({at:new Date().toISOString(),samples:res.rows.map(r=>({pid:Number(r.pid),waitEventType:r.wait_event_type,waitEvent:r.wait_event,state:r.state,blockingPids:r.blocking_pids?r.blocking_pids.split(',').map(Number):[]}))});\n     }catch{}\n     await new Promise(r=>setTimeout(r,15));\n    }\n   })();\n   const requestedCount=4,t0=performance.now();\n   try{\n    const triggers=Array.from({length:requestedCount},()=>actualLifecycle.reconcileGroup(message.callGroupId).then(()=>{completedCount++;}).catch(e=>{failedCount++;throw e;}));\n    await Promise.all(triggers);\n   }finally{\n    sampling=false;await samplePromise.catch(()=>{});\n    actualLifecycle.native=origNative;\n   }\n   const durationMs=performance.now()-t0;\n   process.send?.({id:message.id,ok:true,requestedCount,completedCount,failedCount,durationMs,actualListRoomsCalls,actualListParticipantsCalls,blockingSamples});\n  }catch(err){\n   process.send?.({id:message.id,ok:false,error:sanitizeName(err?.name),code:sanitizeCode(err?.code)});\n  }\n  if(message.kind==='shape')try{assert(fixture.shaperControl);"
  }
];

// 3. Verify original anchor patterns exist in canonical content
for (const a of anchors) {
  assert(canonicalContent.includes(a.original), `Canonical fixture missing pattern for ${a.name}`);
}

// 4. Perform forward transformation
let probeContent = canonicalContent;
for (const a of anchors) {
  probeContent = probeContent.replace(a.original, a.adapted);
}

// 5. Verify reverse byte equality
let reversedContent = probeContent;
for (const a of [...anchors].reverse()) {
  reversedContent = reversedContent.replace(a.adapted, a.original);
}
assert.equal(reversedContent, canonicalContent, 'Reversal does not match canonical fixture byte-for-byte');

// 6. Source pins and hashes
const sourcePins = {
  canonicalFixture: {
    path: 'quality/evidence/T30/fixture-server-canonical-direct-reviewed1.mjs',
    sha256: sha256(canonicalContent),
    byteLength: Buffer.byteLength(canonicalContent, 'utf8')
  },
  adaptedProbeFixture: {
    path: 'quality/evidence/T30/antigravity-native61-lifecycle-red-probe-correction-1/fixture-server-lifecycle-probe-reviewed1.mjs',
    sha256: sha256(probeContent),
    byteLength: Buffer.byteLength(probeContent, 'utf8')
  },
  compiledLifecycleService: {
    path: 'apps/api/dist/modules/calls/call-lifecycle.service.js',
    sha256: sha256(fs.readFileSync(path.resolve(root, 'apps/api/dist/modules/calls/call-lifecycle.service.js'), 'utf8'))
  }
};

// 7. Write proposal fixture file locally
fs.writeFileSync(targetProposalFixturePath, probeContent, 'utf8');

// Also optionally write directly to root T30 directory when executed by root runner
export function deployToT30Root() {
  const rootDest = path.resolve(root, 'quality/evidence/T30/fixture-server-lifecycle-probe-reviewed1.mjs');
  fs.writeFileSync(rootDest, probeContent, 'utf8');
  return rootDest;
}

const summary = {
  status: 'VERIFIED',
  anchorsCount: anchors.length,
  reverseByteExact: true,
  sourcePins
};

export {anchors, sourcePins, summary};
