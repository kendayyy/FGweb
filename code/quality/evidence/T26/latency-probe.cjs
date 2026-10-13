/* eslint-disable @typescript-eslint/no-require-imports -- Diagnostic preload runs in Jest CommonJS, not production. */
const fs=require('node:fs');
const path=require('node:path');
const pg=require('pg');
const http=require('node:http');
const file=path.resolve(process.cwd(),'.runtime/t26/regression-latency.jsonl');
fs.mkdirSync(path.dirname(file),{recursive:true});
const record=event=>fs.appendFileSync(file,JSON.stringify({at:new Date().toISOString(),...event})+'\n');
const query=pg.Client.prototype.query;
pg.Client.prototype.query=function(...args){
 const started=performance.now(),result=query.apply(this,args);
 const done=ok=>record({kind:'pg-query',ms:Math.round(performance.now()-started),ok});
 if(result&&typeof result.then==='function')return result.then(value=>{done(true);return value;},error=>{done(false);throw error;});
 return result;
};
const emit=http.Server.prototype.emit;
http.Server.prototype.emit=function(name,...args){
 if(name==='request'){
  const started=performance.now(),[req,res]=args;
  res.once('finish',()=>record({kind:'http-request',method:req.method,path:new URL(req.url,'http://fixture.invalid').pathname,status:res.statusCode,ms:Math.round(performance.now()-started)}));
 }
 return emit.call(this,name,...args);
};
