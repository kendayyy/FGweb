import assert from 'node:assert/strict';
export function prepareDirectDatabase(docker,databaseURL){
 try{
  const original=new URL(databaseURL);assert(['postgres:','postgresql:'].includes(original.protocol));assert(['localhost','127.0.0.1'].includes(original.hostname));const publishedPort=Number(original.port||5432);assert(Number.isInteger(publishedPort)&&publishedPort>0);
  const preMain=['fg-local-postgres-1','fg-local-redis-1'].map(name=>JSON.parse(docker(['inspect',name]))[0]);
  for(let i=0;i<2;i++){const m=preMain[i];assert.equal(m.Name,'/'+['fg-local-postgres-1','fg-local-redis-1'][i]);assert(/^[a-f0-9]{64}$/.test(m.Id));assert(m.State.Running&&m.State.Health.Status==='healthy');}
  const pg=preMain[0],preNetwork=JSON.parse(docker(['network','inspect','fg-local_default']))[0];assert.equal(preNetwork.Name,'fg-local_default');assert.equal(pg.NetworkSettings.Networks['fg-local_default'].NetworkID,preNetwork.Id);assert(pg.NetworkSettings.Networks['fg-local_default'].Aliases.includes('fg-local-postgres-1'));assert(Object.hasOwn(preNetwork.Containers,pg.Id));assert(pg.NetworkSettings.Ports['5432/tcp'].some(r=>Number(r.HostPort)===publishedPort));
  const connection=new URL(original.href);connection.hostname='fg-local-postgres-1';connection.port='5432';
  const a=new URL(connection.href),b=new URL(original.href);for(const url of [a,b]){url.hostname='localhost';url.port='5432';}assert.equal(a.href,b.href);return {connection,preMain,preNetwork};
 }catch{throw Error('DIRECT_DATABASE_PREFLIGHT_FAILED');}
}
export function createDirectGateway({docker,containers,id,network,args}){
 assert(/^[a-f0-9-]{36}$/.test(id));const name='fg-gateway-'+id,tag='t30-gateway-'+id;let ownedId=null;
 const verify=info=>{assert(/^[a-f0-9]{64}$/.test(info.Id));assert.equal(info.Name,'/'+name);assert.equal(info.Config.Labels['fg-owner'],tag);assert.equal(info.Config.User,'node');assert(info.HostConfig.ReadonlyRootfs);return info.Id;};
 const register=info=>{const actual=verify(info);if(!containers.includes(actual))containers.push(actual);ownedId=actual;return actual;};
 try{
  assert.equal(args[0],'create');assert(args.includes('--pull=never'));assert.equal(args[args.indexOf('--name')+1],name);assert.equal(args[args.indexOf('--network')+1],network);assert(args.includes('fg-owner='+tag));
  const output=docker(args).trim();assert(/^[a-f0-9]{64}$/.test(output));const created=JSON.parse(docker(['inspect',output]))[0];assert.equal(created.Id,output);register(created);
  docker(['network','connect','fg-local_default',ownedId]);const connected=JSON.parse(docker(['inspect',ownedId]))[0];verify(connected);assert(connected.NetworkSettings.Networks[network]&&connected.NetworkSettings.Networks['fg-local_default']);
  docker(['start',ownedId]);return ownedId;
 }catch{
  if(!ownedId)try{register(JSON.parse(docker(['inspect',name]))[0]);}catch{/* No unverified container ID is ever added to removal list. */}
  throw Error('OWNED_DIRECT_GATEWAY_STARTUP_FAILED');
 }
}
export function inspectDirectCleanup(docker,prepared){
 let mainServicesUnchanged=false,existingNetworkUnchanged=false;
 try{for(const before of prepared.preMain){const after=JSON.parse(docker(['inspect',before.Id]))[0];assert.equal(after.Id,before.Id);assert.deepEqual(after.Config,before.Config);assert.deepEqual(after.NetworkSettings.Networks,before.NetworkSettings.Networks);assert(after.State.Running&&after.State.Health.Status==='healthy');}mainServicesUnchanged=true;}catch{}
 try{const after=JSON.parse(docker(['network','inspect','fg-local_default']))[0];assert.equal(after.Id,prepared.preNetwork.Id);assert.deepEqual(after.Containers,prepared.preNetwork.Containers);existingNetworkUnchanged=true;}catch{}
 return {mainServicesUnchanged,existingNetworkUnchanged};
}
