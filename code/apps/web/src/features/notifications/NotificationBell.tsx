import {Bell} from 'lucide-react';import {Link} from 'react-router-dom';
import {useNotifications} from './NotificationsProvider.js';import './notifications.css';
export function NotificationBell({mobile=false}:{mobile?:boolean}){
 const context=useNotifications(),count=context?.count,label=count===null||count===undefined?'Thông báo, chưa tải được số chưa đọc':`Thông báo, ${count} chưa đọc`;
 const content=<><Bell size={20} aria-hidden="true"/><span className={mobile?'':'fg-sr-only'}>Thông báo</span>{typeof count==='number'&&count>0&&<span className="fg-notification-badge" aria-hidden="true">{count>99?'99+':count}</span>}</>;
 if(!context?.actorId)return <button type="button" className={`fg-notification-bell ${mobile?'fg-notification-bell-mobile':''}`} disabled aria-label="Thông báo, cần đăng nhập">{content}</button>;
 return <Link to="/notifications" className={`fg-notification-bell ${mobile?'fg-notification-bell-mobile':''}`} aria-label={label} title="Thông báo">{content}</Link>;
}
