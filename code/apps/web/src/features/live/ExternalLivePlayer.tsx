import React,{useEffect,useMemo,useRef,useState} from 'react';
import {externalFrame,readPlayerEvent,sendPlayerCommand,type PlayerState} from './external-player-protocol.js';

export function ExternalLivePlayer({source}:{source:unknown}) {
 const value=(source&&typeof source==='object'?source:{}) as Record<string,unknown>;
 const {provider,url,videoId,channelName}=value;
 const frame=useMemo(()=>externalFrame({provider,url,videoId,channelName},window.location.origin),[provider,url,videoId,channelName]);
 if(!frame)return <p role="alert" className="fg-live-error">Nguồn không hợp lệ. Chỉ hỗ trợ liên kết YouTube hoặc kênh Twitch.</p>;
 return <IsolatedPlayer key={frame.url} frame={frame}/>;
}
function IsolatedPlayer({frame}:{frame:NonNullable<ReturnType<typeof externalFrame>>}) {
 const iframe=useRef<HTMLIFrameElement>(null),id=React.useId();
 const [attempt,setAttempt]=useState(0),[state,setState]=useState<PlayerState>('loading'),[volume,setVolume]=useState(50),[muted,setMuted]=useState(true),[code,setCode]=useState<number>();
 useEffect(()=>{
  const owner=iframe.current?.contentWindow??null;let ready=false;
  const handshake=()=>{
   if(ready||frame.provider!=='youtube'||!owner)return;
   owner.postMessage(JSON.stringify({event:'listening',id,channel:'widget'}),frame.origin);
   for(const event of ['onReady','onError','onStateChange','onAutoplayBlocked'])owner.postMessage(JSON.stringify({event:'command',func:'addEventListener',args:[event],id,channel:'widget'}),frame.origin);
  };
  const listener=(event:MessageEvent)=>{
   const next=readPlayerEvent(frame,event,owner);if(!next)return;
   ready=true;setState(next.state);setCode(next.code);
   if(next.state==='ready'){
    // Early commands can be dropped while the provider initializes. Register
    // again after its ready event, equivalent to flushing the official API queue.
    if(frame.provider==='youtube'&&owner)for(const name of ['onError','onStateChange','onAutoplayBlocked'])owner.postMessage(JSON.stringify({event:'command',func:'addEventListener',args:[name],id,channel:'widget'}),frame.origin);
    sendPlayerCommand(frame,owner,'volume',50);sendPlayerCommand(frame,owner,'mute',true);
   }
  };
  window.addEventListener('message',listener);handshake();const interval=window.setInterval(handshake,500);
  const timeout=window.setTimeout(()=>{if(!ready)setState('error');},15000);
  return ()=>{window.removeEventListener('message',listener);clearInterval(interval);clearTimeout(timeout);sendPlayerCommand(frame,owner,'pause');};
 },[attempt,frame,id]);
 const message=state==='loading'?'Đang tải player…':state==='ready'?'Nhấn Phát để bắt đầu.':state==='playing'?'Đang phát.':state==='paused'?'Đã tạm dừng.':state==='blocked'?'Trình duyệt chặn tự phát. Nhấn Phát hoặc dùng nút trong player.':state==='offline'?'Kênh hiện không phát trực tiếp. Hãy thử lại hoặc mở nguồn.':code===100?'Video không tồn tại hoặc đã được đặt riêng tư.':code===101||code===150?'Nguồn không cho phép nhúng. Bạn có thể mở nguồn.':'Không thể xác nhận player đã sẵn sàng. Hãy thử lại hoặc mở nguồn.';
 const error=['blocked','offline','error'].includes(state),enabled=['ready','playing','paused','blocked'].includes(state);
 return <div className="fg-external-player">
  <div className="fg-live-stage fg-external-stage">
   <iframe key={attempt} ref={iframe} title={frame.provider==='youtube'?'Player YouTube':'Player Twitch'} src={frame.url} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"/>
  </div>
  <p role={error?'alert':'status'} className={error?'fg-live-error':'fg-live-guidance'}>{message}</p>
  <div className="fg-live-controls">
   <button type="button" className="fg-live-tab" disabled={!enabled} onClick={()=>sendPlayerCommand(frame,iframe.current?.contentWindow??null,state==='playing'?'pause':'play')}>{state==='playing'?'Tạm dừng':'Phát'}</button>
   <label className="fg-external-volume">Âm lượng live ngoài <input aria-label="Âm lượng live ngoài" type="range" min="0" max="100" value={volume} disabled={!enabled} onChange={e=>{const next=Number(e.target.value);setVolume(next);sendPlayerCommand(frame,iframe.current?.contentWindow??null,'volume',next);}}/></label>
   <button type="button" className="fg-live-tab" disabled={!enabled} aria-pressed={muted} onClick={()=>{setMuted(!muted);sendPlayerCommand(frame,iframe.current?.contentWindow??null,'mute',!muted);}}>{muted?'Bật tiếng live ngoài':'Tắt tiếng live ngoài'}</button>
   <button type="button" className="fg-live-tab" onClick={()=>{setState('loading');setCode(undefined);setVolume(50);setMuted(true);setAttempt(attempt+1);}}>Thử lại player</button>
   <a href={frame.sourceUrl} target="_blank" rel="noopener noreferrer" className="fg-live-tab">Mở nguồn</a>
  </div>
 </div>;
}
