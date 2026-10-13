import {useEffect, useState} from 'react';
import {FGLogo} from './FGLogo.js';
import './initial-loading.css';

/** Only an existing initial request controls visibility; no synthetic completion. */
export function InitialLoading({pending, error=false, layout='chat', label='Đang tải nội dung', testId}: {
  pending:boolean; error?:boolean; layout?:'bootstrap'|'lobby'|'chat'|'list'; label?:string; testId?:string;
}) {
  const [delayed,setDelayed]=useState(false);
  const [hidden,setHidden]=useState(()=>typeof document!=='undefined'&&document.hidden);
  useEffect(()=>{
    setDelayed(false);
    if(!pending||error)return;
    const timer=setTimeout(()=>setDelayed(true),150);
    return ()=>clearTimeout(timer);
  },[pending,error]);
  useEffect(()=>{
    const update=()=>setHidden(document.hidden);
    document.addEventListener('visibilitychange',update);
    return ()=>document.removeEventListener('visibilitychange',update);
  },[]);
  if(!pending||error)return null;
  return <div className={`fg-initial-loading fg-initial-loading--${layout}`} data-testid={testId} data-visible={delayed} data-hidden={hidden}>
    {delayed&&<div role="status" aria-live="polite" className="fg-initial-loading-body">
      <span className="fg-sr-only">{label}</span>
      <div className="fg-loading-skeleton" aria-hidden="true"><i/><i/><i/><i/></div>
      <div className="fg-loading-stage" aria-hidden="true"><div className="fg-loading-float"><div className="fg-loading-turn">
        {Array.from({length:9},(_,index)=><span key={index} className={index===8?'fg-loading-face':'fg-loading-depth'} style={{transform:`translateZ(${index*1.25-5}px)`}}><FGLogo size={144} decorative/></span>)}
      </div></div><div className="fg-loading-shadow"/></div>
      <div className="fg-loading-progress" role="progressbar" aria-label={label}><span/></div>
    </div>}
  </div>;
}
