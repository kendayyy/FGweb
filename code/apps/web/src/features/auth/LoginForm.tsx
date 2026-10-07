import {DiscordIcon} from './DiscordIcon.js';
import React,{useState} from 'react';
import {Link,useLocation,useNavigate,useSearchParams} from 'react-router-dom';
import {SignUpEmailRequestSchema,SignInEmailRequestSchema,SignInAdminRequestSchema,AuthCallbackPathSchema} from '@fg/contracts';
import {useAuth} from './AuthProvider.js';
import {Button} from '../../components/ui/Button.js';
import {AuthCard,AuthFeedback,EmailField,LoginIdentifierField,PasswordField,PASSWORD_POLICY_HELP,useAuthAction,useRefreshAuth} from './AuthFields.js';
import {emailAuthRequest,AuthRequestError} from './email-api.js';
export const LoginForm:React.FC=()=>{
 const auth=useAuth(),location=useLocation(),navigate=useNavigate(),[search]=useSearchParams(),register=location.pathname==='/register';
 const [email,setEmail]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[needsVerification,setNeedsVerification]=useState(false);
 const state=useAuthAction(),refresh=useRefreshAuth(),[discordAttempt,setDiscordAttempt]=useState(false);
 const submit=(event:React.FormEvent)=>{event.preventDefault();void state.run(async()=>{
  setNeedsVerification(false);setDiscordAttempt(false);
  if(register){if(password!==confirmation)throw new Error('Hai mật khẩu chưa khớp.');const body=SignUpEmailRequestSchema.safeParse({name,email,password,callbackURL:'/login?verified=1'});if(!body.success)throw new Error(`Kiểm tra tên và email. ${PASSWORD_POLICY_HELP}`);await emailAuthRequest('/sign-up/email',body.data);setPassword('');setConfirmation('');state.setNotice('Nếu email có thể đăng ký, bạn sẽ nhận thư xác minh. Hãy kiểm tra hộp thư rồi đăng nhập.');return;}
  const alias=email==='kingame',body=alias?SignInAdminRequestSchema.safeParse({username:email,password}):SignInEmailRequestSchema.safeParse({email,password});if(!body.success)throw new Error('Kiểm tra email hoặc tên đăng nhập và mật khẩu.');
  try{await emailAuthRequest(alias?'/fg/sign-in/admin':'/sign-in/email',body.data);}catch(error){if(error instanceof AuthRequestError&&error.code==='EMAIL_NOT_VERIFIED')setNeedsVerification(true);throw error;}
  if(!state.isCurrent())return;
  const user=await refresh();if(!user)throw new Error('Chưa xác nhận được phiên đăng nhập. Hãy thử lại.');
  const destination=AuthCallbackPathSchema.safeParse(search.get('next')??'/');if(state.isCurrent())navigate(destination.success?destination.data:'/',{replace:true});
 });};
 const discord=()=>{setDiscordAttempt(true);void state.run(async()=>{await auth.signIn();});};
 const oauthError=search.has('error')?'Đăng nhập Discord bị hủy hoặc thất bại. Vui lòng thử lại.':'';
 return <AuthCard title={register?'Đăng ký FG':'Đăng nhập FG'}><nav className="fg-auth-tabs" aria-label="Phương thức truy cập"><Link to="/login" aria-current={!register?'page':undefined}>Đăng nhập</Link><Link to="/register" aria-current={register?'page':undefined}>Đăng ký</Link></nav>
 <AuthFeedback error={state.error||oauthError} notice={state.notice} testId="oauth-error-banner"/>{needsVerification&&<div className="fg-auth-links"><Link to="/auth/verify">Gửi lại xác minh</Link></div>}
 <form onSubmit={submit}>{register&&<div className="fg-auth-field"><label htmlFor="fg-auth-name">Tên hiển thị</label><input id="fg-auth-name" autoComplete="nickname" value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={50} required disabled={state.pending}/></div>}
 {register?<EmailField value={email} onChange={setEmail} disabled={state.pending}/>:<LoginIdentifierField value={email} onChange={setEmail} disabled={state.pending}/>}<PasswordField value={password} onChange={setPassword} autoComplete={register?'new-password':'current-password'} disabled={state.pending}/>
 {register?<><PasswordField label="Nhập lại mật khẩu" value={confirmation} onChange={setConfirmation} disabled={state.pending}/><p className="fg-auth-help">{PASSWORD_POLICY_HELP}</p></>:<Link className="fg-auth-forgot" to="/auth/forgot">Quên mật khẩu?</Link>}
 <Button type="submit" size="lg" isLoading={state.pending}>{register?'Tạo tài khoản':'Đăng nhập'}</Button></form>
 <div className="fg-auth-divider">hoặc</div><Button type="button" variant="outline" size="lg" isLoading={state.pending} onClick={discord} leftIcon={<DiscordIcon/>}>Tiếp tục với Discord</Button>
 {(oauthError||(discordAttempt&&state.error))&&<Button type="button" variant="ghost" onClick={discord} isLoading={state.pending}>Thử lại</Button>}
 <p className="fg-auth-footer">{register?'Đã có tài khoản?':'Chưa có tài khoản?'} <Link to={register?'/login':'/register'}>{register?'Đăng nhập ngay':'Đăng ký ngay'}</Link></p></AuthCard>;
};
