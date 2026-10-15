/// <reference types="vite/client" />
import React,{createContext,useContext,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../features/auth/index.js';
import {registerBeforeAuthSignOut} from '../features/auth/lifecycle.js';
import {PushController,type PushState} from './push-controller.js';
import {createBrowserPushBridge,iphoneHomeScreenRequired,registerPublicWorker,standalone,userGesture} from './browser-bridge.js';
import {InstallationController,type InstallPrompt} from './installation.js';
import {approvedNotificationPath} from './worker-policy.js';
import './pwa.css';
type Context={controller:PushController|null;installation:InstallationController;offline:boolean;update:boolean;workerError:string;actorId:string|null};
const PwaContext=createContext<Context|null>(null),idle:PushState={phase:'idle'};
const emptySubscribe=()=>()=>{},idleSnapshot=()=>idle;
let worker:Promise<ServiceWorkerRegistration>|undefined;
function registration(){if(!worker)worker=registerPublicWorker().catch(error=>{worker=undefined;throw error;});return worker;}
export function PwaProvider({children}:{children:React.ReactNode}){
 const {user,isLoading,isError,error}=useAuth(),actorId=user?.id??null,actor=useRef(actorId),navigate=useNavigate();actor.current=actorId;
 const [controller,setController]=useState<PushController|null>(null),[installation]=useState(()=>new InstallationController()),[offline,setOffline]=useState(!navigator.onLine),[update,setUpdate]=useState(false),[workerError,setWorkerError]=useState('');
 useEffect(()=>{
  const current=new PushController(createBrowserPushBridge(registration),actor.current);setController(current);
  const unregister=registerBeforeAuthSignOut(async()=>{if(current.bridge.secure&&current.bridge.supported&&!current.bridge.requiresInstall)await current.disable();});
  const refresh=()=>{current.bridge.requiresInstall=iphoneHomeScreenRequired();void current.start();};refresh();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{unregister();current.close();window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[]);
 useEffect(()=>{if(!controller||isLoading||isError)return;let alive=true;void controller.changeActor(actorId).then(async()=>{if(alive&&!actorId&&controller.bridge.supported&&controller.bridge.secure&&!controller.bridge.requiresInstall&&import.meta.env.PROD)await controller.disable();}).catch(()=>{});return()=>{alive=false;};},[actorId,controller,isLoading,isError]);
 useEffect(()=>{
  const offer=(event:Event)=>installation.offer(event as InstallPrompt),installed=()=>installation.installed(),online=()=>setOffline(false),off=()=>setOffline(true);
  if(standalone())installation.installed();window.addEventListener('beforeinstallprompt',offer);window.addEventListener('appinstalled',installed);window.addEventListener('online',online);window.addEventListener('offline',off);
  return()=>{window.removeEventListener('beforeinstallprompt',offer);window.removeEventListener('appinstalled',installed);window.removeEventListener('online',online);window.removeEventListener('offline',off);};
 },[installation]);
 useEffect(()=>{
  if(!import.meta.env.PROD||!window.isSecureContext||!('serviceWorker'in navigator))return;
  let alive=true,reg:ServiceWorkerRegistration|undefined;const cleanups:Array<()=>void>=[];
  void registration().then(value=>{if(!alive)return;reg=value;setUpdate(!!value.waiting);
   const inspect=()=>{const installing=value.installing;if(!installing)return;const changed=()=>{if(alive&&installing.state==='installed'&&navigator.serviceWorker.controller)setUpdate(true);};installing.addEventListener('statechange',changed);cleanups.push(()=>installing.removeEventListener('statechange',changed));};
   value.addEventListener('updatefound',inspect);cleanups.push(()=>value.removeEventListener('updatefound',inspect));inspect();
  }).catch(()=>{if(alive)setWorkerError('Chưa lưu được giao diện ngoại tuyến. Kiểm tra kết nối rồi mở lại FG.');});
  const message=(event:MessageEvent)=>{if(!alive||!reg?.active||event.source!==reg.active||!event.data||event.data.type!=='FG_NOTIFICATION_OPEN')return;const path=approvedNotificationPath(event.data.url,location.origin);if(path||event.data.url==='/notifications')navigate(path??'/notifications');};
  navigator.serviceWorker.addEventListener('message',message);
  return()=>{alive=false;cleanups.forEach(cleanup=>cleanup());navigator.serviceWorker.removeEventListener('message',message);};
 },[navigate]);
 const transportUnavailable=isError&&error instanceof TypeError;
 return <PwaContext.Provider value={{controller,installation,offline:offline||transportUnavailable,update,workerError,actorId}}>{children}</PwaContext.Provider>;
}
export function PwaControls(){
 const context=useContext(PwaContext);if(!context)return null;return <InstallationControls context={context}/>;
}
function InstallationControls({context}:{context:Context}){
 const state=useSyncExternalStore(context.installation.listen,context.installation.snapshot);
 return <aside className="fg-pwa-tools" aria-label="Cài đặt FG và kết nối">
  {context.offline&&<p role="status" className="fg-pwa-status">Mất kết nối. Giao diện đã lưu vẫn mở được; tin nhắn và thay đổi cần mạng, chưa được xác nhận gửi.</p>}
  {context.update&&<p role="status" className="fg-pwa-status">Có bản cập nhật FG. Đóng các cửa sổ FG rồi mở lại khi đã lưu bản nháp và kết thúc cuộc gọi.</p>}
  {context.workerError&&<p role="status" className="fg-pwa-status">{context.workerError}</p>}
  {!state.installed&&<details><summary>Cài FG trên thiết bị</summary><div className="fg-pwa-help"><p>iPhone/iPad: mở FG qua HTTPS, chọn Chia sẻ → Thêm vào Màn hình chính, rồi mở biểu tượng FG. Push cần iOS 16.4 trở lên.</p><p>Android/Chrome: chọn Cài ứng dụng hoặc Thêm vào màn hình chính trong menu trình duyệt.</p>{state.available&&<button type="button" className="fg-btn fg-btn-secondary" disabled={state.busy} onClick={()=>{void context.installation.install(userGesture());}}>Cài FG</button>}<p>Website vẫn sử dụng bình thường khi chưa cài. Cài đặt không tự cấp quyền thông báo.</p></div></details>}
  {state.message&&<p role="status">{state.message}</p>}
 </aside>;
}
export function PushControls(){
 const context=useContext(PwaContext),controller=context?.controller??null,state=useSyncExternalStore(controller?.listen??emptySubscribe,controller?.snapshot??idleSnapshot);
 if(!context)return null;
 const busy=state.phase==='subscribing'||state.phase==='unsubscribing',unavailable=['denied','unsupported','insecure','install-required'].includes(state.phase);
 return <section className="fg-pwa-push" aria-label="Push trên thiết bị này"><h3>Push trên thiết bị này</h3><p role="status">{!context.actorId?'Đăng nhập để bật Push trên thiết bị này.':state.message??(state.phase==='subscribed'?'Push đã được đăng ký trên thiết bị này.':busy?'Đang cập nhật đăng ký Push…':'Bấm Bật Push nếu bạn muốn nhận thông báo khi không mở FG.')}</p>
  {context.actorId&&<div className="fg-pwa-actions"><button type="button" className="fg-btn fg-btn-primary" disabled={!controller||busy||unavailable||state.phase==='subscribed'} onClick={()=>{void controller?.enable();}}>Bật Push</button><button type="button" className="fg-btn fg-btn-secondary" disabled={!controller||busy||!controller.bridge.supported||!controller.bridge.secure||controller.bridge.requiresInstall} onClick={()=>{void controller?.disable().catch(()=>{});}}>Gỡ Push trên thiết bị này</button></div>}
  <p>Quyền trình duyệt và tùy chọn từng kênh áp dụng riêng. Gỡ Push không bật hoặc tắt các tùy chọn đã lưu.</p>
 </section>;
}
