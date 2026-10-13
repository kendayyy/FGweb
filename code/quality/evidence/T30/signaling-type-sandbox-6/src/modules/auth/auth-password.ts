import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';

// Same salted scrypt work factors as the locked Better Auth implementation.
// Tag new hashes so only historical untagged hashes retain NFKC verification.
const prefix='fgscrypt-v1';
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>{
 scrypt(password,salt,64,{N:16384,r:16,p:1,maxmem:128*16384*16*2},(error,key)=>error?reject(error):resolve(key));
});
export async function hashFgPassword(password:string):Promise<string>{
 const salt=randomBytes(16).toString('hex'),key=await derive(password,salt);
 return `${prefix}:${salt}:${key.toString('hex')}`;
}
export async function verifyFgPassword({hash,password}:{hash:string;password:string}):Promise<boolean>{
 const raw=hash.startsWith(`${prefix}:`),parts=hash.split(':');
 if(parts.length!==(raw?3:2))return false;
 const [salt,key]=raw?parts.slice(1):parts;
 if(!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(key))return false;
 const actual=await derive(raw?password:password.normalize('NFKC'),salt);
 return timingSafeEqual(actual,Buffer.from(key,'hex'));
}
