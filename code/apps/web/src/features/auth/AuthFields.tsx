import React,{useId,useState,useEffect,useRef} from 'react';
import {Eye,EyeOff} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useQueryClient} from '@tanstack/react-query';
import {useAuth,AUTH_QUERY_KEY} from './AuthProvider.js';
import {runAuthCleanups} from './lifecycle.js';
import './auth.css';
export function PasswordField({label='Mật khẩu',value,onChange,autoComplete='new-password',disabled=false}:{label?:string;value:string;onChange:(value:string)=>void;autoComplete?:string;disabled?:boolean}){
 const id=useId(),[visible,setVisible]=useState(false);
 return <div className="fg-auth-field"><label htmlFor={id}>{label}</label><div className="fg-auth-password"><input id={id} type={visible?'text':'password'} autoComplete={autoComplete} value={value} onChange={event=>onChange(event.target.value)} maxLength={128} required disabled={disabled}/><button type="button" aria-label={visible?'Ẩn mật khẩu':'Hiện mật khẩu'} aria-pressed={visible} disabled={disabled} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={20}/>:<Eye size={20}/>}</button></div></div>;
}
export function EmailField({value,onChange,disabled=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean}){const id=useId();return <div className="fg-auth-field"><label htmlFor={id}>Email</label><input id={id} type="email" autoComplete="email" placeholder="ban@example.com" maxLength={254} value={value} onChange={event=>onChange(event.target.value)} required disabled={disabled}/></div>;}
export function AuthCard({title,children}:{title:string;children:React.ReactNode}){return <div className="fg-auth-page"><section className="fg-auth-card" aria-labelledby="fg-auth-title"><h1 id="fg-auth-title">{title}</h1><p className="fg-auth-intro">Kết nối cùng cộng đồng game thủ</p>{children}</section></div>;}
export function AuthHeader(){return <header className="fg-auth-header"><Link to="/" className="fg-auth-logo">FG</Link><Link to="/">← Về Lobby</Link></header>;}
export function useAuthAction(){
 const [pending,setPending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),alive=useRef(true),busy=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const run=async(action:()=>Promise<void>)=>{if(busy.current)return;busy.current=true;setPending(true);setError('');setNotice('');try{await action();}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Không thể kết nối. Hãy thử lại.');}finally{busy.current=false;if(alive.current)setPending(false);}};
 return {pending,error,notice,isCurrent:()=>alive.current,setNotice:(value:string)=>{if(alive.current)setNotice(value);},clearFeedback:()=>{if(alive.current){setError('');setNotice('');}},run};
}
export function AuthFeedback({error,notice,testId}:{error:string;notice:string;testId?:string}){return <>{error&&<p data-testid={testId} className="fg-auth-feedback fg-auth-error" role="alert">{error}</p>}{notice&&<p className="fg-auth-feedback" role="status">{notice}</p>}</>;}
export function useRefreshAuth(){const client=useQueryClient(),auth=useAuth();return async()=>{await client.cancelQueries();await runAuthCleanups();client.removeQueries({predicate:query=>query.queryKey[0]!==AUTH_QUERY_KEY[0]});client.setQueryData(AUTH_QUERY_KEY,null);await auth.refetchUser();const current=client.getQueryData(AUTH_QUERY_KEY);return current;};}
