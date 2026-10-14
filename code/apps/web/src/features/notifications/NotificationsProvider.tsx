import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {io} from 'socket.io-client';
import {NotificationSchema,SocketEventNames,IdSchema,type NotificationDTO} from '@fg/contracts';
import {useAuth} from '../auth/index.js';import {registerAuthCleanup} from '../auth/lifecycle.js';
import {getNotifications,getUnreadCount,readNotification,readAllNotifications,notificationError,NotificationApiError} from './api.js';

interface State {actorId?:string;items:NotificationDTO[];count:number|null;loading:boolean;loadingMore:boolean;hasMore:boolean;cursor:string|null;error:string;busy:string|null;}
const empty=(actorId?:string):State=>({actorId,items:[],count:null,loading:Boolean(actorId),loadingMore:false,hasMore:false,cursor:null,error:'',busy:null});
interface NotificationsContextValue extends State {ready:boolean;refresh:()=>Promise<void>;loadMore:()=>Promise<void>;markRead:(id:string)=>Promise<NotificationDTO>;markAll:()=>Promise<void>;}
const Context=createContext<NotificationsContextValue|null>(null);
export const useNotifications=()=>useContext(Context);
const aborted=()=>new DOMException('Notification request expired','AbortError');
export function NotificationsProvider({children}:{children:ReactNode}){
 const auth=useAuth(),rawActor=auth.user&&!auth.isLoading&&!auth.isError&&!auth.isSigningOut?auth.user.id:undefined;
 const stopped=useRef<string|undefined>(undefined),previousRaw=useRef(rawActor);if(previousRaw.current!==rawActor){previousRaw.current=rawActor;stopped.current=undefined;}
 const actorId=rawActor!==stopped.current?rawActor:undefined,owner=useRef(actorId);owner.current=actorId;
 const [state,setState]=useState<State>(()=>empty(actorId)),stateRef=useRef(state);stateRef.current=state;
 const announced=useRef<{actor?:string;count:number|null}>({count:null}),[announcement,setAnnouncement]=useState<{actor?:string;text:string}>({text:''});
 const controllers=useRef(new Set<AbortController>()),epoch=useRef(0),sequence=useRef(0),latestRefresh=useRef<AbortController|null>(null),scopeReady=useRef<string|undefined>(undefined);
 const active=useCallback((who:string|undefined,version:number)=>Boolean(who&&owner.current===who&&scopeReady.current===who&&epoch.current===version),[]);
 const fail=useCallback((error:unknown)=>{if(error instanceof NotificationApiError&&error.status===401)void Promise.resolve(auth.refetchUser()).catch(()=>{});return notificationError(error);},[auth.refetchUser]);
 const refresh=useCallback(async()=>{
  const who=actorId,version=epoch.current,run=++sequence.current;if(!active(who,version))return;
  latestRefresh.current?.abort();const controller=new AbortController();latestRefresh.current=controller;controllers.current.add(controller);
  setState(prev=>prev.actorId===who&&prev.count!==null?{...prev,error:''}:{...empty(who),busy:prev.actorId===who?prev.busy:null});
  try{const [page,count]=await Promise.all([getNotifications(who!,controller.signal),getUnreadCount(controller.signal)]);if(!controller.signal.aborted&&active(who,version)&&sequence.current===run)setState(prev=>({...empty(who),items:page.items,count,loading:false,hasMore:page.hasMore,cursor:page.nextCursor??null,busy:prev.actorId===who?prev.busy:null}));}
  catch(error){if(!controller.signal.aborted&&active(who,version)&&sequence.current===run)setState({...empty(who),loading:false,error:fail(error)});}
  finally{controllers.current.delete(controller);if(latestRefresh.current===controller)latestRefresh.current=null;}
 },[actorId,active,fail]);
 const loadMore=useCallback(async()=>{
  const current=stateRef.current,who=actorId,version=epoch.current,run=sequence.current;if(!active(who,version)||current.actorId!==who||!current.hasMore||!current.cursor||current.loadingMore||current.loading)return;
  const controller=new AbortController(),cursor=current.cursor;controllers.current.add(controller);setState(prev=>({...prev,loadingMore:true,error:''}));
  try{const [page,count]=await Promise.all([getNotifications(who!,controller.signal,cursor),getUnreadCount(controller.signal)]);if(!controller.signal.aborted&&active(who,version)&&sequence.current===run)setState(prev=>{if(prev.actorId!==who||prev.cursor!==cursor)return prev;const merged=new Map(prev.items.map(n=>[n.id,n]));page.items.forEach(n=>merged.set(n.id,n));return {...prev,items:[...merged.values()],count,hasMore:page.hasMore,cursor:page.nextCursor??null,loadingMore:false};});}
  catch(error){if(!controller.signal.aborted&&active(who,version)&&sequence.current===run)setState({...empty(who),loading:false,error:fail(error)});}
  finally{controllers.current.delete(controller);}
 },[actorId,active,fail]);
 const operation=useCallback(async<T,>(label:string,work:(signal:AbortSignal)=>Promise<T>):Promise<T>=>{
  const who=actorId,version=epoch.current;if(!active(who,version))throw aborted();const controller=new AbortController();controllers.current.add(controller);setState(prev=>prev.actorId===who?{...prev,busy:label,error:''}:prev);
  try{const result=await work(controller.signal);if(controller.signal.aborted||!active(who,version))throw aborted();await refresh();if(!active(who,version))throw aborted();return result;}
  catch(error){if(!controller.signal.aborted&&active(who,version))setState({...empty(who),loading:false,error:fail(error)});throw error;}
  finally{controllers.current.delete(controller);if(active(who,version))setState(prev=>prev.actorId===who?{...prev,busy:null}:prev);}
 },[actorId,active,refresh,fail]);
 const markRead=useCallback((id:string)=>operation(id,signal=>readNotification(actorId!,id,signal)),[operation,actorId]);
 const markAll=useCallback(async()=>{await operation('all',signal=>readAllNotifications(signal));},[operation]);
 useEffect(()=>{
  const clear=()=>{scopeReady.current=undefined;epoch.current++;sequence.current++;for(const controller of controllers.current)controller.abort();controllers.current.clear();latestRefresh.current=null;};
  clear();scopeReady.current=actorId;setState(empty(actorId));if(!actorId)return;
  let alive=true;const socket=io({path:'/socket.io',transports:['websocket'],withCredentials:true});
  const recover=()=>{if(alive&&!document.hidden&&owner.current===actorId)void refresh();};
  socket.on('connect',recover);socket.on(SocketEventNames.NOTIFICATION_CREATED,(value:unknown)=>{const parsed=NotificationSchema.safeParse(value);if(parsed.success&&parsed.data.userId===actorId)recover();});
  socket.on(SocketEventNames.NOTIFICATION_READ,(value:unknown)=>{if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&IdSchema.safeParse((value as Record<string,unknown>).notificationId).success)recover();});
  window.addEventListener('focus',recover);document.addEventListener('visibilitychange',recover);const timer=window.setInterval(recover,15000);
  const stop=()=>{alive=false;clear();socket.disconnect();window.clearInterval(timer);window.removeEventListener('focus',recover);document.removeEventListener('visibilitychange',recover);};
  const unregister=registerAuthCleanup(()=>{stopped.current=actorId;owner.current=undefined;stop();setState(empty());});void refresh();
  return ()=>{unregister();stop();};
 },[actorId,refresh]);
 const visible=state.actorId===actorId?state:empty(actorId),value=useMemo(()=>({...visible,actorId,ready:Boolean(actorId&&scopeReady.current===actorId),refresh,loadMore,markRead,markAll}),[visible,actorId,refresh,loadMore,markRead,markAll]);
 useEffect(()=>{if(announced.current.actor!==actorId)announced.current={actor:actorId,count:null};if(actorId&&visible.count!==null&&announced.current.count!==visible.count){announced.current.count=visible.count;setAnnouncement({actor:actorId,text:`${visible.count} thông báo chưa đọc`});}},[actorId,visible.count]);
 return <Context.Provider value={value}>{children}<span className="fg-sr-only" aria-live="polite" aria-atomic="true">{actorId&&announcement.actor===actorId?announcement.text:''}</span></Context.Provider>;
}
