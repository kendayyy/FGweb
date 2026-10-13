import {fork} from 'node:child_process';
import assert from 'node:assert/strict';
const started=Date.now();
const fixture=fork('quality/evidence/GAME-LOGO-FE/fixture-server.mjs',[],{env:{...process.env,FG_THEME_WEB_PORT:'18081'},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
const timer=setTimeout(()=>{fixture.kill();console.error('Fixture timeout; phase messages contain no secrets');process.exitCode=1;},55000);
fixture.on('message',message=>{
 if(message.kind==='phase')console.log(JSON.stringify({phase:message.name,elapsedMs:Date.now()-started}));
 if(message.kind==='ready'){console.log(JSON.stringify({ready:true,elapsedMs:Date.now()-started}));fixture.send({kind:'stop'});}
 if(message.kind==='failed'){console.error('Fixture failed; private values omitted');process.exitCode=1;}
});
await new Promise(resolve=>fixture.once('exit',code=>{clearTimeout(timer);console.log(JSON.stringify({exitCode:code}));assert.equal(code,0);resolve();}));
