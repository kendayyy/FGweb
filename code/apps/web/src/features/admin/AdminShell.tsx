import {NavLink,Outlet} from 'react-router-dom';
import {Inbox,Flag,Users,ArrowLeft,ShieldCheck} from 'lucide-react';
import {AdminBoundary,useAdminAccess} from './AdminAccess.js';
import './admin.css';

export function AdminShell(){
  const access=useAdminAccess();
  return <AdminBoundary><div className="fg-admin-shell" key={access.actorId}>
    <aside className="fg-admin-sidebar" aria-label="Quản trị FG">
      <div className="fg-admin-sidebar-title"><ShieldCheck size={22} aria-hidden="true"/><strong>Quản trị</strong></div>
      <nav aria-label="Mục quản trị">
        <NavLink to="/admin" end><Inbox size={20} aria-hidden="true"/>Hỗ trợ</NavLink>
        <NavLink to="/admin/reports"><Flag size={20} aria-hidden="true"/>Báo cáo vi phạm</NavLink>
        <NavLink to="/admin/users"><Users size={20} aria-hidden="true"/>Tài khoản</NavLink>
      </nav>
      <NavLink to="/" className="fg-admin-return"><ArrowLeft size={18} aria-hidden="true"/>Về Lobby</NavLink>
    </aside>
    <div className="fg-admin-shell-content">
      {!access.online&&<div className="fg-admin-connection" role="status">{access.error||'Đang xác nhận lại kết nối quản trị. Các thao tác tạm dừng.'}</div>}
      <Outlet/>
    </div>
  </div></AdminBoundary>;
}
