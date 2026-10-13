import {fork} from 'node:child_process';
import assert from 'node:assert/strict';
const fixture=fork('quality/evidence/T25/fixture-server.mjs',[],{env:{...process.env,FG_T25_PORT:'18081'},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
const timer=setTimeout(()=>{fixture.kill();process.exitCode=1;},55000);
fixture.on('message',message=>{if(message.kind==='ready'){console.log(JSON.stringify({ready:true}));fixture.send({kind:'stop'});}else console.log(JSON.stringify(message));});
await new Promise(resolve=>fixture.once('exit',code=>{clearTimeout(timer);assert.equal(code,0);resolve();}));
