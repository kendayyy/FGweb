import {Link} from 'react-router-dom';import {Button} from '../../components/ui/Button.js';
import {useNotifications} from './NotificationsProvider.js';import {NotificationPreferences} from './NotificationPreferences.js';import './notifications.css';
export function NotificationsPage(){
 const context=useNotifications();if(!context?.actorId)return <div className="fg-notifications-page"><h1>Thông báo</h1><p>Đăng nhập để xem thông báo của bạn.</p><Link to="/login">Đăng nhập</Link></div>;
 return <div className="fg-notifications-page"><header className="fg-notification-heading"><div><h1>Thông báo</h1><p>{context.count===null?'Đang kiểm tra thông báo của bạn':`${context.count} thông báo chưa đọc`}</p></div><div className="fg-notification-actions"><Button variant="outline" disabled={context.loading||Boolean(context.busy)} onClick={()=>void context.refresh()}>Tải lại thông báo</Button><Button variant="outline" disabled={context.count===null||context.count===0||Boolean(context.busy)} onClick={()=>void context.markAll().catch(()=>{})}>Đánh dấu tất cả đã đọc</Button></div></header>
  <section className="fg-notification-inbox" aria-label="Hộp thư thông báo" aria-busy={context.loading||context.loadingMore}>
   {context.error&&<p role="alert" className="fg-notification-error">{context.error}</p>}{context.loading&&<p role="status">Đang tải thông báo…</p>}
   {!context.loading&&!context.error&&context.items.length===0&&<p className="fg-notification-empty">Chưa có thông báo nào.</p>}
   {!context.loading&&!context.error&&<ul>{context.items.map(item=><li key={item.id}><article className={`fg-notification-item ${item.isRead?'':'is-unread'}`}><div className="fg-notification-item-content"><Link to={'/notifications/'+encodeURIComponent(item.id)} aria-label={'Mở '+item.title}><strong>{item.title}</strong></Link><p>{item.body}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'})}</time></div><div className="fg-notification-item-action">{item.isRead?<span>Đã đọc</span>:<Button variant="outline" disabled={Boolean(context.busy)} aria-label={'Đánh dấu đã đọc '+item.title} onClick={()=>void context.markRead(item.id).catch(()=>{})}>Đánh dấu đã đọc</Button>}</div></article></li>)}</ul>}
   {context.hasMore&&!context.error&&<Button variant="outline" disabled={context.loadingMore||context.loading||Boolean(context.busy)} onClick={()=>void context.loadMore()}>{context.loadingMore?'Đang tải thêm…':'Tải thêm thông báo'}</Button>}
  </section><NotificationPreferences actorId={context.actorId} onSaved={context.refresh}/>
 </div>;
}
