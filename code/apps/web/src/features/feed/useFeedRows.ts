import {useEffect,useRef,useState} from 'react';import {actionError,ActionApiError} from '../moderation/request.js';
interface Page<T>{items:T[];nextCursor:string|null;hasMore:boolean}
export function useFeedRows<T extends{id:string}>(key:string,load:(signal:AbortSignal,cursor?:string)=>Promise<Page<T>>){
 const loader=useRef(load);loader.current=load;
 const epoch=useRef(0),owner=useRef(key);owner.current=key;const controller=useRef<AbortController|null>(null),pending=useRef(false);
 const [attempt,setAttempt]=useState(0),[state,setState]=useState({key,rows:[] as T[],cursor:null as string|null,loading:true,error:'',denied:false});
 async function request(append:boolean){
  if(append&&pending.current)return;const mine=key,token=++epoch.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;pending.current=true;
  setState(old=>({key:mine,rows:append&&old.key===mine?old.rows:[],cursor:append?old.cursor:null,loading:true,error:'',denied:false}));
  try{const page=await loader.current(abort.signal,append?state.cursor??undefined:undefined);if(abort.signal.aborted||owner.current!==mine||epoch.current!==token)return;
   setState(old=>({key:mine,rows:append?[...new Map([...old.rows,...page.items].map(row=>[row.id,row])).values()]:page.items,cursor:page.nextCursor,loading:false,error:'',denied:false}));
  }catch(error){if(abort.signal.aborted||owner.current!==mine||epoch.current!==token)return;const denied=error instanceof ActionApiError&&[401,403,404].includes(error.status);setState(old=>({...old,key:mine,rows:denied?[]:old.rows,cursor:denied?null:old.cursor,loading:false,error:actionError(error),denied}));}
  finally{if(epoch.current===token)pending.current=false;}
 }
 useEffect(()=>{void request(false);return()=>{epoch.current++;controller.current?.abort();pending.current=false;};},[key,attempt]);
 const current=state.key===key?state:{key,rows:[],cursor:null,loading:true,error:'',denied:false};
 return{...current,more:()=>void request(true),reload:()=>setAttempt(n=>n+1),replace:(row:T)=>setState(old=>old.key===key?{...old,rows:old.rows.map(prior=>prior.id===row.id?row:prior)}:old),update:(id:string,change:(row:T)=>T)=>setState(old=>old.key===key?{...old,rows:old.rows.map(prior=>prior.id===id?change(prior):prior)}:old),clear:()=>{epoch.current++;controller.current?.abort();setState({key,rows:[],cursor:null,loading:false,error:'',denied:true});}};
}
