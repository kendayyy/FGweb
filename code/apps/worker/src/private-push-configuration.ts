import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import type {PrivatePushConfiguration} from './private-push-dispatcher.js';
const schema=z.object({version:z.literal(1),allowedOrigins:z.array(z.string().min(1).max(2048)).min(1).max(20),vapid:z.object({subject:z.string().min(1).max(2048),publicKey:z.string().regex(/^[-_A-Za-z0-9]{87}$/),privateKey:z.string().regex(/^[-_A-Za-z0-9]{43}$/)}).strict(),caFile:z.string().optional()}).strict();
function readRegular(file:string,maximum:number){
 if(!path.isAbsolute(file))throw new Error('Private PUSH file unavailable');const absolute=path.resolve(file),before=fs.lstatSync(absolute,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.size<1n||before.size>BigInt(maximum)||fs.realpathSync(absolute)!==absolute)throw new Error('Private PUSH file unavailable');
 const handle=fs.openSync(absolute,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));let bytes:Buffer|undefined;
 try{const opened=fs.fstatSync(handle,{bigint:true});if(opened.dev!==before.dev||opened.ino!==before.ino)throw new Error('Private PUSH file changed');bytes=fs.readFileSync(handle);const after=fs.lstatSync(absolute,{bigint:true});if(after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||after.mtimeNs!==before.mtimeNs||BigInt(bytes.length)!==before.size||fs.realpathSync(absolute)!==absolute){bytes.fill(0);throw new Error('Private PUSH file changed');}return bytes;}finally{fs.closeSync(handle);}
}
/** Explicit operator sink only. Caller must never log raw configuration errors. */
export function loadPrivatePushConfiguration(file:string|undefined):PrivatePushConfiguration{
 if(!file)throw new Error('Private PUSH configuration unavailable');const bytes=readRegular(file,16384);
 try{let value:unknown;try{value=JSON.parse(bytes.toString('utf8'));}catch{value=undefined;}const parsed=schema.safeParse(value);if(!parsed.success)throw new Error('Private PUSH configuration unavailable');const input=parsed.data;return {allowedOrigins:input.allowedOrigins,vapid:input.vapid,...(input.caFile?{ca:readRegular(input.caFile,128*1024)}:{})};}finally{bytes.fill(0);}
}
