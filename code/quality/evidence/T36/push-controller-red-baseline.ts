import type {WebPushSubscriptionDTO} from '@fg/contracts';
export interface NativePushSubscription {endpoint:string;toJSON:()=>WebPushSubscriptionDTO;unsubscribe:()=>Promise<boolean>;}
export interface PushBridge {secure:boolean;supported:boolean;requiresInstall:boolean;permission:()=>NotificationPermission;userGesture:()=>boolean;requestPermission:()=>Promise<NotificationPermission>;subscription:()=>Promise<NativePushSubscription|null>;subscribe:(publicKey:string)=>Promise<NativePushSubscription>;config:(signal:AbortSignal)=>Promise<{available:true;publicKey:string}|{available:false}>;register:(dto:WebPushSubscriptionDTO,signal:AbortSignal)=>Promise<void>;unregister:(endpoint:string,signal:AbortSignal)=>Promise<void>;}
export type PushPhase='idle'|'denied'|'unsupported'|'insecure'|'install-required'|'subscribing'|'subscribed'|'unsubscribing'|'error';
export interface PushState {phase:PushPhase;message?:string;}
/** RED interface baseline only; never wired into the application. */
export class PushController {
 constructor(public readonly bridge:PushBridge,public actorId:string|null){}
 snapshot():PushState{return{phase:'idle'};}
 async start():Promise<void>{}
 async enable():Promise<void>{}
 async disable():Promise<void>{}
 async changeActor(actorId:string|null):Promise<void>{void actorId;}
 close():void{}
}
