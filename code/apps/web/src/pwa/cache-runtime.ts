import {createPublicShellPolicy,type PublicAsset,type PublicShellPolicy} from './worker-policy.js';
export interface ShellCache {match(url:string):Promise<Response|undefined>;put(url:string,response:Response):Promise<void>;}
export interface ShellCaches {keys():Promise<string[]>;delete(name:string):Promise<boolean>;open(name:string):Promise<ShellCache>;}
interface Options {origin:string;manifest:PublicAsset[];buildId:string;caches:ShellCaches;fetch:(request:Request)=>Promise<Response>;}
export class PublicShellCacheRuntime {
 private readonly policy:PublicShellPolicy;
 private readonly cacheName:Promise<string>;
 constructor(private readonly options:Options){
  this.policy=createPublicShellPolicy(options.origin,options.manifest);
  const identity=JSON.stringify({build:options.buildId,manifest:options.manifest});
  this.cacheName=crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity)).then(bytes=>'fg-pwa-shell-v1-'+Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join(''));
 }
 name():Promise<string>{return this.cacheName;}
 private publicRequest(url:string):Request{return new Request(url,{credentials:'omit',redirect:'error',cache:'reload'});}
 private approvedResponse(url:string,response:Response):boolean{
  if(response.status!==200||response.type==='opaque'||response.redirected||/\b(?:private|no-store)\b/i.test(response.headers.get('Cache-Control')??''))return false;
  const type=(response.headers.get('Content-Type')??'').split(';')[0].trim().toLowerCase(),path=new URL(url).pathname;
  if(path.endsWith('.html'))return type==='text/html';
  if(path.endsWith('.js'))return ['text/javascript','application/javascript'].includes(type);
  if(path.endsWith('.css'))return type==='text/css';
  if(path.endsWith('.wasm'))return type==='application/wasm';
  if(path.endsWith('.woff2'))return type==='font/woff2';
  if(path.endsWith('.svg'))return type==='image/svg+xml';
  if(path.endsWith('.png'))return type==='image/png';
  if(path.endsWith('.webp'))return type==='image/webp';
  return path.endsWith('.ico')&&['image/x-icon','image/vnd.microsoft.icon'].includes(type);
 }
 async install():Promise<void>{
  const name=await this.name(),cache=await this.options.caches.open(name);
  try{for(const url of this.policy.publicURLs()){
   const response=await this.options.fetch(this.publicRequest(url));
   if(!this.approvedResponse(url,response))throw new Error('Public shell response rejected');
   await cache.put(url,response.clone());
  }}catch(error){await this.options.caches.delete(name);throw error;}
 }
 async activate():Promise<void>{
  const current=await this.name();
  for(const name of await this.options.caches.keys())if(name.startsWith('fg-pwa-shell-v1-')&&name!==current)await this.options.caches.delete(name);
 }
 async fetch(request:Request,navigation:boolean):Promise<Response|undefined>{
  if(request.method!=='GET'||request.headers.has('Authorization'))return undefined;
  if(navigation){
   const fallback=this.policy.navigationFallback(request.url);if(!fallback)return undefined;
   try{return await this.options.fetch(request);}catch(error){
    const cached=await(await this.options.caches.open(await this.name())).match(fallback);
    if(cached)return cached;throw error;
   }
  }
  if(!this.policy.cacheable(request))return undefined;
  const cache=await this.options.caches.open(await this.name()),cached=await cache.match(request.url);if(cached)return cached;
  const response=await this.options.fetch(this.publicRequest(request.url));
  if(this.approvedResponse(request.url,response))await cache.put(request.url,response.clone());
  return response;
 }
}
