import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const env=parseEnv(fs.readFileSync('.env.local','utf8')),dir='.runtime/t01-fix2',id=randomUUID(),network=`fg-media-${id}`,name=`fg-sfu-${id}`;
const image='livekit/livekit-server:v1.8.4@sha256:621fd87bd64a0c83e1f2418ee0323eb920d00acdd73e5f79b303c64f6cc532af';
const docker=args=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:30000});
fs.mkdirSync(dir,{recursive:true});const config=path.resolve(dir,'private-sfu.yaml');
fs.writeFileSync(config,`port: 7880\nbind_addresses: ["0.0.0.0"]\nrtc:\n  tcp_port: 7881\n  udp_port: 7882\n  use_external_ip: false\nroom:\n  auto_create: false\n  max_participants: 10\nkeys:\n  ${JSON.stringify(env.LIVEKIT_API_KEY)}: ${JSON.stringify(env.LIVEKIT_API_SECRET)}\n`);
const report={recordedAt:new Date().toISOString(),image,signalingPortPublished:false,privateHealth200:false,networkRemoved:false,containerRemoved:false,productionGatewayImplemented:false,webRTCVerified:false};
let container,networkCreated=false;
try{
 docker(['network','create',network]);networkCreated=true;
 container=docker(['run','-d','--name',name,'--network',network,'--network-alias','fg-sfu','--mount',`type=bind,source=${config},target=/etc/livekit.yaml,readonly`,image,'--config','/etc/livekit.yaml']).trim();
 const inspect=JSON.parse(docker(['inspect',container]))[0];assert.equal(inspect.State.Running,true);
 assert.equal(Object.values(inspect.NetworkSettings.Ports??{}).some(p=>Array.isArray(p)&&p.length>0),false);assert.equal(Object.keys(inspect.HostConfig.PortBindings??{}).length,0);
 // wget is included in the already-pinned SFU image. The second disposable
 // container can reach only the explicitly named private network service.
 const health=docker(['run','--rm','--network',network,'--entrypoint','/bin/sh',image,'-c','wget -q -O- -T 10 http://fg-sfu:7880/']);
 assert.match(health,/OK/i);report.privateHealth200=true;
 console.log(JSON.stringify({...report,credentialsLogged:false,configurationSource:'.runtime/t01-fix2/private-sfu.yaml'}));
}finally{
 if(container){docker(['rm','-f',container]);report.containerRemoved=!JSON.parse(docker(['ps','-a','--filter',`name=^/${name}$`,'--format','json'])||'null');}
 if(networkCreated){docker(['network','rm',network]);report.networkRemoved=!docker(['network','ls','--filter',`name=^${network}$`,'--format','{{.Name}}']).trim();}
 fs.writeFileSync('quality/evidence/T01-FIX2/private-sfu-result.json',JSON.stringify(report,null,2)+'\n');
}
