import type {PublicAsset} from './worker-policy.js';
export interface ShellCache {match(url:string):Promise<Response|undefined>;put(url:string,response:Response):Promise<void>;}
export interface ShellCaches {keys():Promise<string[]>;delete(name:string):Promise<boolean>;open(name:string):Promise<ShellCache>;}
interface Options {origin:string;manifest:PublicAsset[];buildId:string;caches:ShellCaches;fetch:(request:Request)=>Promise<Response>;}
export class PublicShellCacheRuntime {
 constructor(private readonly options:Options){}
 async name():Promise<string>{return 'placeholder';}
 async install():Promise<void>{void this.options;}
 async activate():Promise<void>{}
 async fetch(_request:Request,_navigation:boolean):Promise<Response|undefined>{return undefined;}
}
