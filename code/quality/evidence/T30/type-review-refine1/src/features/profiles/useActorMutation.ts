import {useLayoutEffect,useRef} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import type {MeDTO} from '@fg/contracts';
import {useAuth,AUTH_QUERY_KEY} from '../auth/AuthProvider.js';
import {registerAuthCleanup} from '../auth/lifecycle.js';

/** A mutation belongs to the mounted account that initiated it. */
export function useActorMutation() {
  const {user,isSigningOut}=useAuth();
  const client=useQueryClient();
  const actor=useRef(user?.id);
  const signingOut=useRef(isSigningOut);
  const mounted=useRef(false);
  const pending=useRef<AbortController|null>(null);
  actor.current=user?.id;
  signingOut.current=isSigningOut;
  useLayoutEffect(()=>{
    mounted.current=true;
    const cancel=()=>{pending.current?.abort();pending.current=null;};
    const unregister=registerAuthCleanup(cancel);
    return ()=>{mounted.current=false;cancel();unregister();};
  },[user?.id,isSigningOut]);
  return () => {
    const id=actor.current;
    if(!id||signingOut.current||pending.current||client.getQueryData<MeDTO>(AUTH_QUERY_KEY)?.id!==id)return null;
    const controller=new AbortController();pending.current=controller;
    return {
      actorId:id,
      signal:controller.signal,
      isCurrent:()=>mounted.current&&!signingOut.current&&!controller.signal.aborted&&pending.current===controller&&actor.current===id&&client.getQueryData<MeDTO>(AUTH_QUERY_KEY)?.id===id,
      finish:()=>{if(pending.current===controller)pending.current=null;},
    };
  };
}
