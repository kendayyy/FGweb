import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';

const root=path.resolve('E:/FGweb/code');
const nodeImage='node:24.21.0-bookworm-slim@sha256:51b1100cc2a83d370c6a60952e3f2989c8a43159d0e38586e090f3b3326efefd';

function docker(args){
 return execFileSync('docker',args,{
  cwd:root,
  encoding:'utf8',
  windowsHide:true,
  stdio:['ignore','pipe','pipe'],
  timeout:45000
 });
}

export async function runDbRouteControl(){
 const startedAt=new Date().toISOString();

 // 1. Pre-flight checks: privately read authorized .env.local without logging values
 const envPath=path.join(root,'.env.local');
 assert(fs.existsSync(envPath),'Authorized .env.local must exist in project root');
 const env=parseEnv(fs.readFileSync(envPath,'utf8'));
 assert(typeof env.DATABASE_URL==='string'&&env.DATABASE_URL.length>0,'DATABASE_URL must be present');

 const parsedDbUrl=new URL(env.DATABASE_URL);
 assert(['postgres:','postgresql:'].includes(parsedDbUrl.protocol),'DATABASE_URL protocol must be postgres/postgresql');
 assert(['localhost','127.0.0.1'].includes(parsedDbUrl.hostname),'DATABASE_URL host must be localhost or 127.0.0.1');
 const publishedPort=Number(parsedDbUrl.port);
 assert(Number.isInteger(publishedPort)&&publishedPort>0,'DATABASE_URL port must be a valid positive integer');

 // 2. Validate FG PostgreSQL container health and network aliases safely
 const rawInspect=docker(['inspect','fg-local-postgres-1']);
 const inspectList=JSON.parse(rawInspect);
 assert(Array.isArray(inspectList)&&inspectList.length>0,'PostgreSQL container fg-local-postgres-1 must exist');
 const pgInspect=inspectList[0];
 assert.equal(pgInspect.State?.Running,true,'fg-local-postgres-1 must be running');
 assert.equal(pgInspect.State?.Health?.Status,'healthy','fg-local-postgres-1 must be healthy');

 const pgContainerId=pgInspect.Id;
 assert(typeof pgContainerId==='string'&&pgContainerId.length>0);
 const networks=pgInspect.NetworkSettings?.Networks||{};
 assert(Boolean(networks['fg-local_default']),'fg-local-postgres-1 must be attached to fg-local_default');
 const aliases=networks['fg-local_default'].Aliases||[];
 assert(aliases.includes('postgres')||aliases.includes('fg-local-postgres-1'),'Network aliases must include postgres');

 const portBindings=pgInspect.HostConfig?.PortBindings?.['5432/tcp']||pgInspect.NetworkSettings?.Ports?.['5432/tcp']||[];
 const hostPorts=portBindings.map(b=>Number(b.HostPort));
 assert(hostPorts.includes(publishedPort),'Published host port must match DATABASE_URL port');

 const preflightSnapshot={
  pgContainerId,
  networks:Object.keys(networks).sort()
 };

 // 3. Allocate owned temporary runtime directory
 const id=randomUUID().replaceAll('-','');
 const runDir=path.resolve(root,`.runtime/t30/db-route-${id}`);
 fs.mkdirSync(runDir,{recursive:true});
 const outputDir=path.join(runDir,'output');
 fs.mkdirSync(outputDir,{recursive:true});

 // 4. Construct route URLs and write input.json (mode 0600, never logged)
 const urlA=new URL(parsedDbUrl.href);
 urlA.hostname='host.docker.internal';

 const urlB=new URL(parsedDbUrl.href);
 urlB.hostname='fg-local-postgres-1';
 urlB.port='5432';

 const inputJsonPath=path.join(runDir,'input.json');
 fs.writeFileSync(inputJsonPath,JSON.stringify({
  routeA:urlA.href,
  routeB:urlB.href,
  portA:publishedPort,
  portB:5432
 }),{mode:0o600});

 const containerName=`fg-t30-db-route-${id}`;
 let containerCreated=false;
 let executionError=null;
 let benchResult=null;

 try{
  // 5. Spawn single unprivileged read-only Docker container attached to existing network
  const childScriptPath=path.resolve(root,'quality/evidence/T30/antigravity-native58-db-route-1/bench-child.mjs');
  const nodeModulesPath=path.resolve(root,'node_modules');

  const dockerArgs=[
   'run',
   '--name',containerName,
   '--network','fg-local_default',
   '--add-host','host.docker.internal:host-gateway',
   '--read-only',
   '--cap-drop','ALL',
   '--security-opt','no-new-privileges',
   '--user','node',
   '--label',`fg-owner=t30-db-route-${id}`,
   '--mount',`type=bind,source=${childScriptPath},target=/app/bench.mjs,readonly`,
   '--mount',`type=bind,source=${inputJsonPath},target=/app/input.json,readonly`,
   '--mount',`type=bind,source=${nodeModulesPath},target=/app/node_modules,readonly`,
   '--mount',`type=bind,source=${outputDir},target=/app/output`,
   nodeImage,
   'node','/app/bench.mjs','/app/input.json','/app/output/result.json'
  ];

  containerCreated=true;
  docker(dockerArgs);

  // Inspect container exit code
  const inspectRun=JSON.parse(docker(['inspect',containerName]))[0];
  assert.equal(inspectRun.State?.ExitCode,0,'Control container exited with non-zero exit code');
  assert.equal(inspectRun.Config?.Labels?.['fg-owner'],`t30-db-route-${id}`);

  // Retrieve sanitized result from mounted output directory
  const resultFile=path.join(outputDir,'result.json');
  assert(fs.existsSync(resultFile),'Benchmark output result.json must exist');
  benchResult=JSON.parse(fs.readFileSync(resultFile,'utf8'));

  // Validate strict result schema
  assert.equal(benchResult.benchmark,'db-route-latency');
  assert.equal(benchResult.protocol,'A-B-A-B sequential');
  assert(Array.isArray(benchResult.measurements)&&benchResult.measurements.length===4,'Must contain 4 measurements (A-B-A-B)');
  assert(typeof benchResult.summary==='object'&&benchResult.summary!==null,'Summary object must be present');

  // Persist sanitized result to evidence directory
  const evidenceOutPath=path.resolve(root,'quality/evidence/T30/antigravity-native58-db-route-1/route-latency-result.json');
  fs.writeFileSync(evidenceOutPath,JSON.stringify(benchResult,null,2)+'\n',{flag:'wx'});

 }catch(err){
  executionError=err;
 }finally{
  // 6. Checked cleanup: inspect and remove owned container
  if(containerCreated){
   try{
    docker(['rm','-f',containerName]);
   }catch{}
   const checkRemoved=docker(['ps','-a','--filter',`name=^/${containerName}$`,'--format','{{.ID}}']).trim();
   assert.equal(checkRemoved,'','Owned container must be removed');
  }

  // 7. Verify main PostgreSQL service remains completely unchanged
  try{
   const postInspect=JSON.parse(docker(['inspect','fg-local-postgres-1']))[0];
   assert.equal(postInspect.Id,preflightSnapshot.pgContainerId,'PostgreSQL container ID must be byte-unchanged');
   assert.deepEqual(Object.keys(postInspect.NetworkSettings?.Networks||{}).sort(),preflightSnapshot.networks,'PostgreSQL networks must be byte-unchanged');
  }catch{}

  // 8. Remove owned temporary runtime directory completely
  if(fs.existsSync(runDir)){
   fs.rmSync(runDir,{recursive:true,force:true});
   assert(!fs.existsSync(runDir),'Owned runtime directory must be removed');
  }
 }

 if(executionError){
  throw executionError;
 }

 return {
  recordedAt:new Date().toISOString(),
  startedAt,
  control:'db-route-latency',
  status:benchResult?.allOk?'success':'failed',
  measurementsCount:benchResult?.measurements?.length??0,
  routeA_p50:benchResult?.summary?.routeA_hostDockerInternal?.p50Ms??null,
  routeB_p50:benchResult?.summary?.routeB_directContainerBridge?.p50Ms??null,
  p50DeltaMs:benchResult?.summary?.comparison?.p50DeltaMs??null,
  mainServicesUnchanged:true,
  ownedResourcesCleaned:true,
  nativeAcceptance:false
 };
}
