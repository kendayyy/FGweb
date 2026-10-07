import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {AuthProvider,AUTH_QUERY_KEY} from '../src/features/auth/AuthProvider.js';
import App from '../src/App.js';
const clients:QueryClient[]=[];
afterEach(()=>{for(const client of clients.splice(0))client.clear();vi.restoreAllMocks();});
function show(path='/login'){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);client.setQueryData(AUTH_QUERY_KEY,null);render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={[path]}><App/></MemoryRouter></AuthProvider></QueryClientProvider>);return client;}
const input=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label,{exact:true}),{target:{value}});
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
describe('AUTH-ADMIN-SINGLE shared login and password policy',()=>{
 it('accepts email or username in the existing login card without native email validation',()=>{show();expect(screen.getByLabelText('Email hoặc tên đăng nhập')).toHaveAttribute('type','text');expect(screen.getByLabelText('Email hoặc tên đăng nhập')).toHaveAttribute('autocomplete','username');expect(screen.getByLabelText('Mật khẩu',{exact:true})).toHaveAttribute('maxlength','256');expect(screen.getByRole('button',{name:'Tiếp tục với Discord'})).toBeVisible();});
 it('sends the alias with credential proof only and shows genuine failed-login state',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(response({code:'INVALID_EMAIL_OR_PASSWORD'},401)),client=show();
  input('Email hoặc tên đăng nhập','kingame');input('Mật khẩu','old lower only');fireEvent.click(screen.getByRole('button',{name:'Đăng nhập'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('không đúng');expect(fetch).toHaveBeenCalledTimes(1);
  const [url,options]=fetch.mock.calls[0];expect(url).toBe('/api/auth/fg/sign-in/admin');expect(JSON.parse(String(options?.body))).toEqual({username:'kingame',password:'old lower only'});expect(client.getQueryData(AUTH_QUERY_KEY)).toBeNull();
 });
 it('keeps ordinary email signin on its native endpoint without a new composition gate',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(response({code:'INVALID_EMAIL_OR_PASSWORD'},401));show();input('Email hoặc tên đăng nhập','ordinary@fixture.invalid');input('Mật khẩu','old lower only');fireEvent.click(screen.getByRole('button',{name:'Đăng nhập'}));await screen.findByRole('alert');expect(fetch.mock.calls[0][0]).toBe('/api/auth/sign-in/email');
 });
 it('rejects missing uppercase or special locally and shows the new policy',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch');show('/register');expect(screen.getByText(/8–128.*chữ hoa.*ký tự đặc biệt/)).toBeVisible();
  input('Tên hiển thị','FG player');input('Email','owner@fixture.invalid');
  for(const password of ['abcdefg!','ABCDEFGx','Aa      ']){input('Mật khẩu',password);input('Nhập lại mật khẩu',password);fireEvent.click(screen.getByRole('button',{name:'Tạo tài khoản'}));await screen.findByRole('alert');await waitFor(()=>expect(screen.getByRole('button',{name:'Tạo tài khoản'})).toBeEnabled());}
  expect(fetch).not.toHaveBeenCalled();
 });
 it('accepts128 astral code points unchanged and retains generic unverified registration',async()=>{
  const user={id:'new-user',name:'FG player',email:'owner@fixture.invalid',emailVerified:false,createdAt:'2026-10-07T00:00:00.000Z',updatedAt:'2026-10-07T00:00:00.000Z'};
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(response({token:null,user})),client=show('/register'),password=`A${'😀'.repeat(127)}`;
  input('Tên hiển thị','FG player');input('Email',user.email);input('Mật khẩu',password);input('Nhập lại mật khẩu',password);fireEvent.click(screen.getByRole('button',{name:'Tạo tài khoản'}));expect(await screen.findByRole('status')).toHaveTextContent('Nếu');expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).password).toBe(password);expect(client.getQueryData(AUTH_QUERY_KEY)).toBeNull();
 });
});
