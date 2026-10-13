import {jest} from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {CryptoObjectStore} from '../src/modules/chat-crypto/crypto-object-store.js';

jest.setTimeout(15000);
describe('Opaque object storage filesystem boundaries',()=>{
 const id=randomUUID(),runtimeParent=path.resolve('.runtime/chatcrypto-be'),cacheParent=path.resolve('.cache/chatcrypto-be');
 const directory=path.join(runtimeParent,'store-'+id),outside=path.join(cacheParent,'store-'+id),previous=process.env.FG_CRYPTO_OBJECTS_DIR;
 const objectId=randomUUID()+'.bin';let store:CryptoObjectStore;
 beforeAll(async()=>{await fs.mkdir(directory,{recursive:true});await fs.mkdir(outside,{recursive:true});process.env.FG_CRYPTO_OBJECTS_DIR=directory;store=new CryptoObjectStore();await store.initialize();});
 afterAll(async()=>{
  for(const [target,parent]of [[directory,runtimeParent],[outside,cacheParent]]){
   expect(await fs.realpath(target)).toBe(path.join(await fs.realpath(parent),'store-'+id));await fs.rm(target,{recursive:true});
  }
  if(previous===undefined)delete process.env.FG_CRYPTO_OBJECTS_DIR;else process.env.FG_CRYPTO_OBJECTS_DIR=previous;
 });
 it('keeps bytes opaque and refuses an overwrite of an existing object',async()=>{
  const bytes=Buffer.from([0,255,17,200,0,31]);await store.put(objectId,bytes);expect(await store.read(objectId)).toEqual(bytes);
  await expect(store.put(objectId,Buffer.from('replacement'))).rejects.toBeDefined();expect(await store.read(objectId)).toEqual(bytes);
 });
 it('rejects an object that grows beyond its byte budget after the actual path stat',async()=>{
  const key=randomUUID()+'.bin',target=path.join(directory,key),bytes=Buffer.alloc(5*1024*1024+1,37);await store.put(key,Buffer.from([17,29,41]));const actual=fs.lstat.bind(fs);let observed=false;const spy=jest.spyOn(fs,'lstat').mockImplementation(async(...args:Parameters<typeof fs.lstat>)=>{const result=await actual(...args);if(args[0]===target){observed=true;await fs.writeFile(target,bytes);}return result;});try{await expect(store.read(key)).rejects.toThrow('Invalid crypto object');expect(observed).toBe(true);}finally{spy.mockRestore();bytes.fill(0);await fs.unlink(target);}
 });
 it.each(['growth','truncation','replacement'])('bounds handle reads and zeroes rejected buffers when an owned object changes during I/O: %s',async(change)=>{
  const key=randomUUID()+'.bin',target=path.join(directory,key),retired=target+'.retired',source=Buffer.alloc(64,53),large=Buffer.alloc(5*1024*1024+1,61);await store.put(key,source);const actualOpen=fs.open.bind(fs),buffers:Buffer[]=[],requested:number[]=[],restore:Array<()=>void>=[];let changed=false;
  const observer=jest.spyOn(fs,'open').mockImplementation(async(...args:Parameters<typeof fs.open>)=>{const handle=await actualOpen(...args);if(args[0]===target){const observed=handle as unknown as {read:(bytes:Buffer,offset:number,length:number,position:number)=>Promise<{bytesRead:number;buffer:Buffer}>},actualRead=observed.read.bind(observed),readObserver=jest.spyOn(observed,'read').mockImplementation(async(bytes,offset,length,position)=>{buffers.push(bytes);requested.push(length);const result=await actualRead(bytes,offset,length,position);if(!changed){changed=true;if(change==='growth')await fs.writeFile(target,large);else if(change==='truncation')await fs.truncate(target,1);else{await fs.rename(target,retired);await fs.writeFile(target,Buffer.alloc(64,67));}}return result;});restore.push(()=>readObserver.mockRestore());}return handle;});
  try{await expect(store.read(key)).rejects.toThrow('Invalid crypto object');expect(changed).toBe(true);expect(buffers.length).toBeGreaterThan(0);expect(buffers.every(bytes=>bytes.length<=source.length+1&&bytes.every(value=>value===0))).toBe(true);expect(requested.reduce((sum,value)=>sum+value,0)).toBeLessThanOrEqual(source.length+2);}finally{observer.mockRestore();for(const undo of restore)undo();source.fill(0);large.fill(0);await fs.unlink(target);if(change==='replacement')await fs.unlink(retired);}
 });
 it('rejects user filenames and traversal before filesystem access',async()=>{
  for(const key of ['../escape.bin','image.png','C:/escape.bin',objectId+'/child'])await expect(store.read(key)).rejects.toThrow('Invalid crypto object key');
 });
 it('rejects a redirected storage ancestor before creating anything at its target',async()=>{
  const link=path.join(directory,'redirect');await fs.symlink(outside,link,'junction');
  try{
   process.env.FG_CRYPTO_OBJECTS_DIR=path.join(link,'objects');await expect(new CryptoObjectStore().initialize()).rejects.toThrow();
   expect(await fs.readdir(outside)).toEqual([]);
  }finally{await fs.unlink(link);process.env.FG_CRYPTO_OBJECTS_DIR=directory;}
 });
 it('rejects a junction in place of an object',async()=>{
  const key=randomUUID()+'.bin',link=path.join(directory,key);await fs.symlink(outside,link,'junction');
  try{await expect(store.read(key)).rejects.toThrow('Invalid crypto object');}finally{await fs.unlink(link);}
 });
 it('keeps the private 5MiB budget while permitting explicitly scoped 8MiB Transit representation',async()=>{
  const key=randomUUID()+'.bin',bytes=Buffer.alloc(5*1024*1024+1,29),report=new CryptoObjectStore(8*1024*1024);await report.initialize();
  await expect(store.put(key,bytes)).rejects.toThrow('Invalid crypto object size');await report.put(key,bytes);const restored=await report.read(key);expect(restored.length).toBe(bytes.length);expect(restored.equals(bytes)).toBe(true);await expect(store.read(key)).rejects.toThrow('Invalid crypto object');
  await fs.writeFile(path.join(directory,key),Buffer.alloc(8*1024*1024+1));await expect(report.read(key)).rejects.toThrow('Invalid crypto object');expect(()=>new CryptoObjectStore(9*1024*1024)).toThrow('Invalid crypto object budget');
 });
 it('advances a bounded native cursor across ten thousand real opaque files and closes its handle',async()=>{
  const large=path.join(directory,'large-'+randomUUID()),saved=process.env.FG_CRYPTO_OBJECTS_DIR;await fs.mkdir(large);process.env.FG_CRYPTO_OBJECTS_DIR=large;const scanned=new CryptoObjectStore();await scanned.initialize();const expected=new Set<string>();
  for(let i=0;i<10000;i++){const key=randomUUID()+'.bin';expected.add(key);await fs.writeFile(path.join(large,key),Buffer.from([37]),{flag:'wx',mode:0o600});}
  const actualOpen=fs.opendir.bind(fs),handles:import('node:fs').Dir[]=[],restores:Array<()=>void>=[];let reads=0,firstMilliseconds=0,maxReads=0,maxCandidates=0,passes=0;
  const observer=jest.spyOn(fs,'opendir').mockImplementation(async(...args:Parameters<typeof fs.opendir>)=>{if(args[0]===large)expect(args[1]).toMatchObject({bufferSize:32});const dir=await actualOpen(...args);if(args[0]===large){handles.push(dir);const observed=dir as unknown as {read:()=>Promise<import('node:fs').Dirent|null>},read=observed.read.bind(observed),spy=jest.spyOn(observed,'read').mockImplementation(async()=>{reads++;return read();});restores.push(()=>spy.mockRestore());}return dir;});
  try{
   const seen=new Set<string>(),started=performance.now();
   while(seen.size<expected.size){const prior=reads,batchStart=performance.now(),batch=await scanned.scanCandidates();passes++;if(passes===1)firstMilliseconds=performance.now()-batchStart;maxReads=Math.max(maxReads,reads-prior);maxCandidates=Math.max(maxCandidates,batch.length);expect(reads-prior).toBeLessThanOrEqual(100);expect(batch.length).toBeGreaterThan(0);expect(batch.length).toBeLessThanOrEqual(100);for(const key of batch){expect(expected.has(key)).toBe(true);expect(seen.has(key)).toBe(false);seen.add(key);}expect(passes).toBeLessThanOrEqual(100);}
   const fullMilliseconds=performance.now()-started;expect(seen.size).toBe(10000);expect(handles).toHaveLength(1);expect(reads).toBe(10000);await scanned.closeScan();for(const undo of restores)undo();restores.length=0;await expect(handles[0].read()).rejects.toMatchObject({code:'ERR_DIR_CLOSED'});
   const evidence=path.resolve('quality/evidence/CHATCRYPTO-BE','large-directory-native-'+id+'.json');await fs.writeFile(evidence,JSON.stringify({recordedAt:new Date().toISOString(),files:10000,passes,reads,maxReads,maxCandidates,handles:handles.length,bufferSize:32,firstMilliseconds,fullMilliseconds,closed:true,productionCapacityClaim:false},null,2)+'\n',{flag:'wx'});
  }finally{observer.mockRestore();for(const undo of restores)undo();await scanned.closeScan();process.env.FG_CRYPTO_OBJECTS_DIR=saved;expect(await fs.realpath(large)).toBe(path.join(await fs.realpath(directory),path.basename(large)));expect(path.basename(large)).toMatch(/^large-[a-f0-9-]{36}$/);await fs.rm(large,{recursive:true});}
 },60000);

});
