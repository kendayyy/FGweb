// Test-only encrypted TURN TCP transport pacing. Does not terminate TURN/SRTP,
// replace media, inspect credentials, or change host network configuration.
import net from 'node:net';
import http from 'node:http';
import {setTimeout as pause} from 'node:timers/promises';
let settings={bitsPerSecond:0,delayMs:0};
const peers=new Map(),history=[],startedAt=new Date().toISOString();
let nextId=0;
async function forward(source,destination,record,direction){
 try{
  for await(const buffer of source){
   for(let offset=0;offset<buffer.length;offset+=4096){
    const chunk=buffer.subarray(offset,Math.min(buffer.length,offset+4096));
    const policy={...settings};
    if(policy.bitsPerSecond)await pause(Math.ceil(chunk.length*8000/policy.bitsPerSecond));
    if(offset===0&&policy.delayMs)await pause(policy.delayMs);
    if(source.destroyed||destination.destroyed)return;
    if(!destination.write(chunk))await new Promise((resolve,reject)=>{
     const finish=()=>{destination.off('drain',drain);destination.off('error',error);destination.off('close',close);};
     const drain=()=>{finish();resolve();},error=e=>{finish();reject(e);},close=()=>{finish();reject(Error('transport closed'));};
     destination.once('drain',drain);destination.once('error',error);destination.once('close',close);
    });
    record[direction]+=chunk.length;
   }
  }
  destination.end();
 }catch{source.destroy();destination.destroy();}
}
const server=net.createServer(client=>{
 const upstream=net.connect({host:'fg-sfu',port:5349});
 const id=++nextId,record={id,connectedAt:new Date().toISOString(),closedAt:null,toSfuBytes:0,toBrowserBytes:0};
 peers.set(id,record);
 client.setNoDelay(true);upstream.setNoDelay(true);
 client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());
 client.once('close',()=>{record.closedAt=new Date().toISOString();upstream.destroy();});
 upstream.once('connect',()=>{void forward(client,upstream,record,'toSfuBytes');void forward(upstream,client,record,'toBrowserBytes');});
});
server.listen(7884,'0.0.0.0');
http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.method==='GET'&&req.url==='/stats'){res.end(JSON.stringify({startedAt,settings,history,peers:[...peers.values()]}));return;}
 if(req.method==='POST'&&req.url==='/shape'){
  let text='';for await(const chunk of req){text+=chunk;if(text.length>1024){res.writeHead(413);res.end('{}');return;}}
  try{const next=JSON.parse(text);if(!Number.isInteger(next.bitsPerSecond)||!Number.isInteger(next.delayMs)||next.bitsPerSecond<0||next.bitsPerSecond>100000000||next.delayMs<0||next.delayMs>250)throw Error('invalid');settings={bitsPerSecond:next.bitsPerSecond,delayMs:next.delayMs};history.push({at:new Date().toISOString(),...settings});res.end(JSON.stringify({success:true,settings}));}
  catch{res.writeHead(400);res.end('{}');}return;
 }
 res.writeHead(404);res.end('{}');
}).listen(7885,'0.0.0.0');
