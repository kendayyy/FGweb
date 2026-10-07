import React,{useLayoutEffect,useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {AuthEmailTokenSchema,AuthPasswordSchema} from '@fg/contracts';
import {useAuth} from './AuthProvider.js';
import {Button} from '../../components/ui/Button.js';
import {AuthCard,AuthFeedback,EmailField,PasswordField,useAuthAction,useRefreshAuth} from './AuthFields.js';
import {emailAuthRequest} from './email-api.js';
export function EmailFlowPage(){
 const location=useLocation(),navigate=useNavigate(),auth=useAuth(),state=useAuthAction(),refresh=useRefreshAuth();
 const [token]=useState(()=>new URLSearchParams(location.search).get('token')??''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[done,setDone]=useState(false);
 const [verifyLink,setVerifyLink]=useState(Boolean(token));
 const reset=location.pathname==='/auth/reset',attach=location.pathname==='/auth/add-password',verification=location.pathname==='/auth/verify',passwordFlow=reset||attach;
 useLayoutEffect(()=>{if(new URLSearchParams(location.search).has('token'))navigate(location.pathname,{replace:true});},[location.pathname,location.search,navigate]);
 const title=reset?'Đặt lại mật khẩu':attach?'Thêm mật khẩu':verification?'Xác minh email':'Quên mật khẩu';
 const submit=(event:React.FormEvent)=>{event.preventDefault();void state.run(async()=>{
  if(verification&&verifyLink){await emailAuthRequest('/verify-email',{token});if(!state.isCurrent())return;setDone(true);state.setNotice('Đã xác minh email. Hãy đăng nhập để tiếp tục.');}
  else if(passwordFlow){if(password!==confirmation)throw new Error('Hai mật khẩu chưa khớp.');if(!AuthPasswordSchema.safeParse(password).success)throw new Error('Mật khẩu mới cần 12–128 ký tự.');await emailAuthRequest(attach?'/fg/password-attach':'/reset-password',{token,newPassword:password});if(!state.isCurrent())return;await refresh();setPassword('');setConfirmation('');setDone(true);state.setNotice(attach?'Đã thêm mật khẩu cho tài khoản hiện tại.':'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.');}
  else{await emailAuthRequest(verification?'/send-verification-email':'/request-password-reset',verification?{email,callbackURL:'/login?verified=1'}:{email,redirectTo:'/auth/reset'});state.setNotice('Nếu email phù hợp, bạn sẽ nhận liên kết. Hãy kiểm tra hộp thư và thư rác.');}
 });};
 if(passwordFlow&&!AuthEmailTokenSchema.safeParse(token).success)return <AuthCard title={title}><p role="alert" className="fg-auth-feedback">Liên kết không hợp lệ hoặc đã hết hạn.</p><div className="fg-auth-links"><Link to={attach?'/auth/password':'/auth/forgot'}>Yêu cầu liên kết mới</Link></div></AuthCard>;
 if(attach&&!auth.user)return <AuthCard title={title}><p role="alert" className="fg-auth-feedback">Hãy đăng nhập đúng tài khoản đã yêu cầu và mở lại liên kết trong phiên đó.</p><div className="fg-auth-links"><Link to="/login">Đăng nhập</Link></div></AuthCard>;
 return <AuthCard title={title}><AuthFeedback error={state.error} notice={state.notice}/>{!done&&<form onSubmit={submit}>{verification&&verifyLink?<><p className="fg-auth-help">Xác nhận địa chỉ email bằng liên kết bạn vừa mở.</p><Button type="submit" size="lg" isLoading={state.pending}>Xác minh email</Button><Button type="button" variant="ghost" disabled={state.pending} onClick={()=>{setVerifyLink(false);state.clearFeedback();}}>Gửi lại xác minh</Button></>:<>{passwordFlow?<><PasswordField label="Mật khẩu mới" value={password} onChange={setPassword} disabled={state.pending}/><PasswordField label="Nhập lại mật khẩu" value={confirmation} onChange={setConfirmation} disabled={state.pending}/><p className="fg-auth-help">Mật khẩu 12–128 ký tự. Khoảng trắng được giữ nguyên.</p></>:<EmailField value={email} onChange={setEmail} disabled={state.pending}/>}<Button type="submit" size="lg" isLoading={state.pending}>{passwordFlow?'Lưu mật khẩu':verification?'Gửi lại xác minh':'Gửi liên kết đặt lại'}</Button></>}</form>}<div className="fg-auth-links"><Link to="/login">Về đăng nhập</Link>{passwordFlow&&<Link to={attach?'/auth/password':'/auth/forgot'}>Yêu cầu liên kết mới</Link>}</div></AuthCard>;
}
