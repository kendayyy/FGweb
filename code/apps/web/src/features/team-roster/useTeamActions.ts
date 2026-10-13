import {useCallback,useEffect,useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {registerAuthCleanup} from '../auth/lifecycle.js';
import {teamError} from './api.js';
export const requestStatus={PENDING:'Chờ xét duyệt',ACCEPTED:'Đã được duyệt',REJECTED:'Đã từ chối',CANCELLED:'Đã hủy'} as const;
export function useTeamActions(actorId:string,scope:string){
 const client=useQueryClient(),generation=useRef(0),pending=useRef<AbortController|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[revoked,setRevoked]=useState(false);
 const refresh=useCallback(async()=>{
  await client.invalidateQueries({queryKey:['t25',actorId]});
  // Admission changes persistent membership as well as the playing roster.
  // Refresh the existing room consumers from the server; keep chat nodes mounted.
  for(const key of ['roomMembers','roomDetail','ownRooms'])await client.invalidateQueries({queryKey:[key,actorId]});
 },[client,actorId]);
 useEffect(()=>{
  generation.current++;setBusy(false);setError(null);setRevoked(false);
  const unregister=registerAuthCleanup(async()=>{generation.current++;pending.current?.abort();setRevoked(true);await client.cancelQueries({queryKey:['t25',actorId]});client.removeQueries({queryKey:['t25',actorId]});});
  return()=>{unregister();generation.current++;pending.current?.abort();};
 },[client,actorId,scope]);
 const run=async<T>(operation:(signal:AbortSignal)=>Promise<T>):Promise<T|undefined>=>{
  if(pending.current||revoked)return;const version=generation.current,controller=new AbortController();pending.current=controller;setBusy(true);setError(null);
  try{const result=await operation(controller.signal);if(version!==generation.current)return;await refresh();if(version===generation.current)return result;}
  catch(failure){if(version!==generation.current||controller.signal.aborted)return;setError(teamError(failure));await refresh();}
  finally{if(pending.current===controller)pending.current=null;if(version===generation.current)setBusy(false);}
 };
 return {busy,error,revoked,run,refresh};
}
