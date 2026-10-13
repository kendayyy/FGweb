import {CryptoSweepLoop} from '../src/modules/chat-crypto/crypto-sweep-loop.js';
import {execFile} from 'node:child_process';
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const waitFor=async(check:()=>boolean)=>{const deadline=Date.now()+1500;while(!check()&&Date.now()<deadline)await sleep(5);expect(check()).toBe(true);};
const deferred=()=>{let release!:()=>void;const done=new Promise<void>(resolve=>{release=resolve;});return {done,release};};
describe('Real timer encrypted sweep lifecycle',()=>{
 it('starts one unref-able loop and never overlaps an unfinished sweep',async()=>{
  const gate=deferred();let calls=0,running=0,peak=0;const loop=new CryptoSweepLoop(async()=>{calls++;running++;peak=Math.max(peak,running);await gate.done;running--;},()=>{},5);
  try{loop.start();loop.start();await waitFor(()=>calls===1);await sleep(25);expect(calls).toBe(1);expect(peak).toBe(1);gate.release();await waitFor(()=>calls>=2);expect(peak).toBe(1);}finally{gate.release();await loop.stop();}
 });
 it('recovers from a rejected sweep without forwarding private error details to its failure callback',async()=>{
  let calls=0,failures=0;const args:unknown[][]=[];const loop=new CryptoSweepLoop(async()=>{calls++;if(calls===1)throw new Error('private-fixture-path');},(...values)=>{failures++;args.push(values);},5);
  try{loop.start();await waitFor(()=>calls>=2);expect(failures).toBe(1);expect(args).toEqual([[]]);}finally{await loop.stop();}
 });
 it('clears future ticks and waits for the active sweep before shutdown completes',async()=>{
  const gate=deferred();let calls=0,stopped=false;const loop=new CryptoSweepLoop(async()=>{calls++;await gate.done;},()=>{},5);
  try{loop.start();await waitFor(()=>calls===1);const stopping=loop.stop().then(()=>{stopped=true;});await sleep(25);expect(stopped).toBe(false);expect(calls).toBe(1);gate.release();await stopping;await sleep(25);expect(calls).toBe(1);expect(stopped).toBe(true);await loop.stop();}finally{gate.release();await loop.stop();}
 });
 it('stops safely before start and refuses invalid timer intervals',async()=>{
  let calls=0;const loop=new CryptoSweepLoop(async()=>{calls++;},()=>{},5);await loop.stop();loop.start();await sleep(20);expect(calls).toBe(0);
  for(const interval of [0,-1,0.5,Infinity])expect(()=>new CryptoSweepLoop(async()=>{},()=>{},interval)).toThrow();
 });
 it('allows a real child process to exit with its idle periodic timer still scheduled',async()=>{
  const script="import {CryptoSweepLoop} from './apps/api/src/modules/chat-crypto/crypto-sweep-loop.ts'; new CryptoSweepLoop(async()=>{},()=>{},10000).start();";
  await new Promise<void>((resolve,reject)=>execFile(process.execPath,['--import','tsx','--input-type=module','-e',script],{cwd:process.cwd(),windowsHide:true,timeout:5000},error=>error?reject(error):resolve()));
 });
});
