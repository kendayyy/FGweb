import type {WebPushSubscriptionDTO} from '@fg/contracts';
export interface NativePushSubscription {endpoint:string;toJSON:()=>WebPushSubscriptionDTO;unsubscribe:()=>Promise<boolean>;}
export interface PushBridge {secure:boolean;supported:boolean;requiresInstall:boolean;permission:()=>NotificationPermission;userGesture:()=>boolean;requestPermission:()=>Promise<NotificationPermission>;subscription:()=>Promise<NativePushSubscription|null>;subscribe:(publicKey:string)=>Promise<NativePushSubscription>;config:(signal:AbortSignal)=>Promise<{available:true;publicKey:string}|{available:false}>;register:(dto:WebPushSubscriptionDTO,signal:AbortSignal)=>Promise<void>;unregister:(endpoint:string,signal:AbortSignal)=>Promise<void>;}
export type PushPhase='idle'|'denied'|'unsupported'|'insecure'|'install-required'|'subscribing'|'subscribed'|'unsubscribing'|'error';
export interface PushState {phase:PushPhase;message?:string;}
export class PushController {
 private state:PushState={phase:'idle'};private readonly listeners=new Set<()=>void>();private generation=0;private closed=false;private abort?:AbortController;private pending?:Promise<void>;private bound?:{actorId:string;subscription:NativePushSubscription};
 constructor(public readonly bridge:PushBridge,public actorId:string|null){}
 snapshot=():PushState=>this.state;
 listen=(listener:()=>void):(()=>void)=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
 private update(state:PushState){if(this.closed)return;this.state=state;for(const listener of this.listeners)listener();}
 private capability():PushState|undefined{
  if(this.bridge.requiresInstall)return{phase:'install-required',message:'Thêm FG vào màn hình chính rồi mở bằng biểu tượng để bật Push.'};
  if(!this.bridge.secure)return{phase:'insecure',message:'Cần HTTPS để dùng Push.'};
  if(!this.bridge.supported)return{phase:'unsupported',message:'Trình duyệt này chưa hỗ trợ Push. Bạn vẫn dùng website bình thường.'};
  if(this.bridge.permission()==='denied')return{phase:'denied',message:'Trình duyệt đã chặn Push. Mở cài đặt thông báo của trang để đổi quyền.'};
 }
 async start():Promise<void>{if(this.closed)return;const capability=this.capability();if(capability?.phase==='denied'&&this.bound){try{await this.disable();}catch{this.update({...capability,message:'Push bị chặn; chưa xác nhận gỡ đăng ký trên server. Kiểm tra kết nối và thử gỡ lại.'});return;}}if(capability)this.update(capability);else if(!this.bound)this.update({phase:'idle'});}
 enable():Promise<void>{if(this.pending)return this.pending;const generation=this.generation,actorId=this.actorId,controller=new AbortController();this.abort=controller;const pending=this.enableCurrent(generation,actorId,controller);this.pending=pending;void pending.finally(()=>{if(this.pending===pending)this.pending=undefined;}).catch(()=>{});return pending;}
 private async enableCurrent(generation:number,actorId:string|null,controller:AbortController){
  const alive=()=>!this.closed&&!controller.signal.aborted&&generation===this.generation&&actorId===this.actorId;
  if(!alive())return;const capability=this.capability();if(capability){this.update(capability);return;}
  if(!actorId){this.update({phase:'error',message:'Đăng nhập để bật Push trên thiết bị này.'});return;}
  if(!this.bridge.userGesture()){this.update({phase:'error',message:'Bấm Bật Push để yêu cầu quyền thông báo.'});return;}
  if(this.bound?.actorId===actorId){this.update({phase:'subscribed'});return;}
  let candidate:NativePushSubscription|undefined,created=false;
  this.update({phase:'subscribing'});
  try{
   // Request directly in the gesture's call stack, before configuration/SW awaits.
   const permission=this.bridge.permission()==='default'?await this.bridge.requestPermission():this.bridge.permission();
   if(!alive())return;if(permission!=='granted'){this.update(permission==='denied'?{phase:'denied',message:'Push đã bị từ chối. Đổi quyền trong cài đặt trang khi bạn muốn bật.'}:{phase:'idle',message:'Chưa cấp quyền Push.'});return;}
   const config=await this.bridge.config(controller.signal);if(!alive())return;if(!config.available)throw new Error('Push unavailable');
   candidate=(await this.bridge.subscription())??undefined;if(!alive())return;
   if(!candidate){created=true;candidate=await this.bridge.subscribe(config.publicKey);}
   if(!alive()){if(created)await this.removeNative(candidate);return;}
   await this.bridge.register(candidate.toJSON(),controller.signal);
   if(!alive()){if(created)await this.removeNative(candidate);return;}
   this.bound={actorId,subscription:candidate};this.update({phase:'subscribed'});
  }catch{if(candidate&&(alive()||created))await this.removeNative(candidate).catch(()=>{});if(alive())this.update({phase:'error',message:'Chưa bật được Push. Kiểm tra kết nối rồi thử lại.'});}
 }
 private async removeNative(expected:NativePushSubscription){
  const current=await this.bridge.subscription();if(!current)return;
  const a=expected.toJSON(),b=current.toJSON();if(a.endpoint!==b.endpoint||a.keys.p256dh!==b.keys.p256dh||a.keys.auth!==b.keys.auth)return;
  if(!await current.unsubscribe())throw new Error('Native Push revoke unavailable');
 }
 async disable():Promise<void>{
  if(this.closed)return;this.generation++;this.abort?.abort();const generation=this.generation,actorId=this.actorId,controller=new AbortController();this.abort=controller;
  const candidate=this.bound?.subscription??await this.bridge.subscription();if(this.closed||generation!==this.generation||actorId!==this.actorId)return;this.bound=undefined;if(!candidate){if(!this.closed&&generation===this.generation)this.update({phase:'idle'});return;}
  this.update({phase:'unsubscribing'});let failed=false;
  try{if(actorId)await this.bridge.unregister(candidate.endpoint,controller.signal);}catch{failed=true;}
  try{await this.removeNative(candidate);}catch{failed=true;}
  if(!this.closed&&generation===this.generation)this.update(failed?{phase:'error',message:'Chưa xác nhận gỡ Push đầy đủ. Kiểm tra kết nối và thử lại.'}:{phase:'idle'});
  if(failed)throw new Error('Push revoke incomplete');
 }
 async changeActor(actorId:string|null):Promise<void>{
  if(actorId===this.actorId)return;const previous=this.bound;this.generation++;this.abort?.abort();this.actorId=actorId;this.bound=undefined;this.update(this.capability()??{phase:'idle'});
  if(previous)await this.removeNative(previous.subscription).catch(()=>{});
 }
 close():void{this.closed=true;this.generation++;this.abort?.abort();this.listeners.clear();}
}
