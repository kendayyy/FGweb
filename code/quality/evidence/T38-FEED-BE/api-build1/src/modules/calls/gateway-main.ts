import {readFileSync} from 'node:fs';
import {createSignalingGateway,type GatewayOptions} from './signaling-gateway.js';
const input=JSON.parse(readFileSync(process.argv[2],'utf8')) as GatewayOptions&{port:number};
if(!Number.isInteger(input.port)||input.port<1||input.port>65535)throw Error('Gateway port required');
const gateway=createSignalingGateway(input);
gateway.server.listen(input.port,'0.0.0.0',()=>console.log('Private media admission gateway ready'));
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>{void gateway.close().then(()=>process.exit(0));});
