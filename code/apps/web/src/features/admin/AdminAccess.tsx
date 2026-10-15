import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';import {Link,useInRouterContext} from 'react-router-dom';import {io,type Socket} from 'socket.io-client';import {z} from 'zod';import {SupportSocketEventNames} from '@fg/contracts';import {useAuth} from '../auth/index.js';import {registerAuthCleanup} from '../auth/lifecycle.js';import {SupportClient} from '../support/api.js';import {ActionApiError} from '../moderation/request.js';import {InitialLoading} from '../../components/ui/InitialLoading.js';
interface State{actorId?:string;allowed:boolean;checking:boolean;online:boolean;error:string}
interface Access extends State{refresh:()=>void;revoke:()=>void}
const empty=(actorId?:string,checking=false):State=>({actorId,allowed:false,checking,online:false,error:''});
const Context=createContext<Access>({...empty(),refresh:()=>undefined,revoke:()=>undefined});
export const useAdminAccess=()=>useContext(Context);
export function AdminAccessProvider({children}:{children:ReactNode}){
 const auth=useAuth(),rawActor=auth.user&&!auth.isLoading&&!auth.isError&&!auth.isSigningOut?auth.user.id:undefined,stopped=useRef<string|undefined>(undefined),previous=useRef(rawActor);
 if(previous.current!==rawActor){previous.current=rawActor;stopped.current=undefined;}
 const actorId=rawActor!==stopped.current?rawActor:undefined,owner=useRef(actorId);owner.current=actorId;
 const [state,setState]=useState<State>(()=>empty(actorId,Boolean(actorId))),[attempt,setAttempt]=useState(0),revokeRef=useRef<()=>void>(()=>undefined),refetchAuth=useRef(auth.refetchUser);refetchAuth.current=auth.refetchUser;
 const refresh=useCallback(()=>{stopped.current=undefined;setAttempt(n=>n+1);},[]),revoke=useCallback(()=>revokeRef.current(),[]);
 useEffect(()=>{
  if(!actorId){setState(empty());revokeRef.current=()=>undefined;return;}
  const who=actorId,controller=new AbortController(),client=new SupportClient(who,true);let alive=true,socket:Socket|undefined,probing=false;
  const current=()=>alive&&!controller.signal.aborted&&owner.current===who;
  const dispose=()=>{alive=false;controller.abort();clearInterval(timer);socket?.removeAllListeners();socket?.disconnect();};
  const deny=(message='Quyền quản trị không còn khả dụng.')=>{if(!current())return;dispose();setState({...empty(who),error:message});};
  revokeRef.current=()=>deny();setState(empty(who,true));
  const unregister=registerAuthCleanup(()=>{stopped.current=who;dispose();setState(empty());});
  async function probe(){if(probing||!current())return;probing=true;try{await client.list(controller.signal,{limit:1});if(!current())return;
    if(socket)return;
    socket=io('/support',{transports:['websocket'],withCredentials:true,autoConnect:false,reconnection:true,forceNew:true,timeout:5000});
    socket.on('connect',()=>{void(async()=>{try{const ack=await socket!.timeout(5000).emitWithAck(SupportSocketEventNames.ADMIN_SUBSCRIBE,{});if(!current())return;if(!z.object({ok:z.literal(true)}).strict().safeParse(ack).success){deny();return;}setState({actorId:who,allowed:true,checking:false,online:true,error:''});}catch{deny('Chưa xác nhận được quyền quản trị. Kiểm tra kết nối rồi thử lại.');}})();});
    socket.on('disconnect',(reason:string)=>{if(!current())return;if(reason==='io server disconnect'){deny();return;}setState(previous=>previous.actorId===who?{...previous,online:false,checking:false,error:'Mất kết nối. Các thao tác quản trị tạm dừng cho đến khi xác nhận lại quyền.'}:previous);});
    socket.on('connect_error',()=>{if(current())setState(previous=>({...previous,actorId:who,online:false,checking:false,error:'Chưa kết nối được kênh quản trị. Kiểm tra kết nối rồi thử lại.'}));});socket.connect();
   }catch(error){if(!current())return;if(error instanceof ActionApiError&&[401,403].includes(error.status)){if(error.status===401)void refetchAuth.current().catch(()=>{});deny();}else if(!socket)deny('Chưa xác nhận được quyền quản trị. Kiểm tra kết nối rồi thử lại.');}finally{probing=false;}}
  void probe();const timer=setInterval(()=>{if(!document.hidden)void probe();},15000);timer.unref?.();const visible=()=>{if(!document.hidden)void probe();};document.addEventListener('visibilitychange',visible);
  return()=>{unregister();document.removeEventListener('visibilitychange',visible);dispose();};
 },[actorId,attempt]);
 const value=useMemo<Access>(()=>{const scoped=Boolean(actorId&&state.actorId===actorId);return{...(scoped?state:empty(actorId,Boolean(actorId))),refresh,revoke};},[actorId,state,refresh,revoke]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function AdminNavLink(){const access=useAdminAccess(),inRouter=useInRouterContext();if(!access.allowed)return null;return inRouter?<Link className="fg-btn fg-btn-ghost" to="/admin">Quản trị</Link>:<a className="fg-btn fg-btn-ghost" href="/admin">Quản trị</a>;}
export function AdminBoundary({children}:{children:ReactNode}){const access=useAdminAccess();if(access.checking)return <InitialLoading pending layout="bootstrap" label="Đang kiểm tra quyền quản trị"/>;if(!access.allowed)return <section className="fg-admin-denied"><h1>Không có quyền quản trị</h1><p>{access.error||'Trang này chỉ dành cho tài khoản được server cấp quyền quản trị.'}</p><button type="button" className="fg-btn fg-btn-outline" onClick={access.refresh}>Kiểm tra lại quyền</button></section>;return <>{children}</>;}
