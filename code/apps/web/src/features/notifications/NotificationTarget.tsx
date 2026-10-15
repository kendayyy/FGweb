import {notificationForOpen} from '../../pwa/target-api.js';
import {useEffect,useState} from 'react';import {Link,useNavigate,useParams} from 'react-router-dom';
import {useNotifications} from './NotificationsProvider.js';import {notificationError} from './api.js';import {resolveNotificationTarget} from './notification-target.js';import './notifications.css';
export function NotificationTarget(){const context=useNotifications(),{notificationId}=useParams<{notificationId:string}>();return <Target key={`${context?.actorId??'guest'}:${notificationId??''}`} notificationId={notificationId}/>;}
function Target({notificationId}:{notificationId?:string}){
 const context=useNotifications(),navigate=useNavigate(),[error,setError]=useState(''),[retry,setRetry]=useState(0),actorId=context?.actorId,markRead=context?.markRead,ready=context?.ready;
 useEffect(()=>{if(!ready||!actorId||!notificationId||!markRead)return;let alive=true;const controller=new AbortController();setError('');void (async()=>{try{const current=await notificationForOpen(actorId,notificationId,controller.signal,markRead);if(!alive||controller.signal.aborted)return;const path=await resolveNotificationTarget(current,actorId,controller.signal);if(alive&&!controller.signal.aborted)navigate(path,{replace:true});}catch(cause){if(alive&&!controller.signal.aborted)setError(notificationError(cause));}})();return ()=>{alive=false;controller.abort();};},[actorId,notificationId,markRead,navigate,retry,ready]);
 if(!actorId)return <div className="fg-notification-target"><p>Đăng nhập để mở thông báo.</p><Link to="/login">Đăng nhập</Link></div>;
 return <div className="fg-notification-target"><h1>Mở thông báo</h1>{error?<><p role="alert" className="fg-notification-error">{error}</p><button type="button" className="fg-btn fg-btn-secondary" onClick={()=>setRetry(n=>n+1)}>Thử lại liên kết</button></>:<p role="status">Đang kiểm tra nội dung và quyền truy cập…</p>}<p><Link to="/notifications">Về thông báo</Link></p></div>;
}
