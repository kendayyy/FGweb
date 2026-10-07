import {describe,it,expect} from 'vitest';
import * as c from '../src/index.js';
const stamp='2026-10-07T00:00:00.000Z';
const me={id:'u',displayName:'FG Gamer',email:'owner@example.com',emailVerified:true,discordId:null,createdAt:stamp,updatedAt:stamp};
const profile={...me,gameProfiles:[]};
describe('AUTH02 owner identity and auth transports',()=>{
 it('accepts email-only owner identity without weakening public privacy or Discord compatibility',()=>{
  expect(c.MeDTOSchema.parse(me).discordId).toBeNull();expect(c.PrivateProfileSchema.parse(profile).discordId).toBeNull();
  expect(c.MeDTOSchema.parse({...me,discordId:'discord-existing'}).discordId).toBe('discord-existing');
  const publicData=c.PublicProfileSchema.parse({...profile,password:'private-password',accessToken:'private-token',providerId:'credential'});
  for(const key of ['email','emailVerified','discordId','password','accessToken','providerId'])expect(publicData).not.toHaveProperty(key);
  expect(c.MeDTOSchema.safeParse({...me,discordId:''}).success).toBe(false);
 });
 it('keeps native signup response separate from an authenticated FG session',()=>{
  const endpoint=c.ApiEndpointRegistry.find(e=>e.path==='/api/auth/sign-up/email');expect(endpoint?.auth).toBe('Public');
  expect(endpoint?.requestSchema?.parse({name:'FG Gamer',email:me.email,password:'  mật khẩu Ω  '})).toHaveProperty('password','  mật khẩu Ω  ');
  expect(endpoint?.responseSchema.safeParse({token:null,user:{id:'signup-result',name:'FG Gamer',email:me.email,emailVerified:false,image:null,createdAt:stamp,updatedAt:stamp}}).success).toBe(true);
  expect(endpoint?.responseSchema.safeParse({token:'unexpected-session',user:{}}).success).toBe(false);
 });
 it('bounds signup/reset/change passwords and preserves spaces and Unicode verbatim',()=>{
  for(const path of ['/api/auth/sign-up/email','/api/auth/reset-password','/api/auth/change-password','/api/auth/fg/password-attach']){
   const endpoint=c.ApiEndpointRegistry.find(e=>e.path===path);expect(endpoint?.requestSchema).toBeDefined();
   const base=path.endsWith('sign-up/email')?{name:'FG',email:me.email}:path.endsWith('change-password')?{currentPassword:'current-long-password'}:{token:'opaque-email-token'};
   const field=path.endsWith('sign-up/email')?'password':'newPassword';
   for(const pass of ['  mật khẩu Ω  ',' '.repeat(12),'x'.repeat(128)])expect(endpoint?.requestSchema?.parse({...base,[field]:pass})).toHaveProperty(field,pass);
   for(const pass of ['x'.repeat(11),'x'.repeat(129)])expect(endpoint?.requestSchema?.safeParse({...base,[field]:pass}).success).toBe(false);
  }
 });
 it('requires current password for change, and rejects client actor/hash/grant overrides on all new mutations',()=>{
  const requests=[['/api/auth/sign-up/email',{name:'FG',email:me.email,password:'long-password-12'}],['/api/auth/sign-in/email',{email:me.email,password:'long-password-12'}],['/api/auth/send-verification-email',{email:me.email}],['/api/auth/request-password-reset',{email:me.email}],['/api/auth/reset-password',{token:'email-token',newPassword:'long-password-12'}],['/api/auth/change-password',{currentPassword:'old-password-12',newPassword:'new-password-12'}],['/api/auth/fg/password-challenge',{}],['/api/auth/fg/password-attach',{token:'email-token',newPassword:'long-password-12'}]] as const;
  for(const [path,request]of requests){const schema=c.ApiEndpointRegistry.find(e=>e.path===path)?.requestSchema;expect(schema?.safeParse(request).success).toBe(true);for(const key of ['userId','sessionId','emailVerified','hash','providerId'])expect(schema?.safeParse({...request,[key]:'forged'}).success).toBe(false);}
  const change=c.ApiEndpointRegistry.find(e=>e.path==='/api/auth/change-password')?.requestSchema;
  expect(change?.safeParse({newPassword:'long-password-12'}).success).toBe(false);expect(change?.safeParse({currentPassword:'old-password-12',newPassword:'long-password-12',revokeOtherSessions:false}).success).toBe(false);
 });
 it('allows only bounded relative same-origin callbacks and token queries',()=>{
  for(const [path,field]of [['/api/auth/sign-up/email','callbackURL'],['/api/auth/send-verification-email','callbackURL'],['/api/auth/request-password-reset','redirectTo']] as const){
   const schema=c.ApiEndpointRegistry.find(e=>e.path===path)?.requestSchema;const base=path.endsWith('sign-up/email')?{name:'FG',email:me.email,password:'long-password-12'}:{email:me.email};
   expect(schema?.safeParse({...base,[field]:'/auth/verify?source=FG'}).success).toBe(true);
   for(const value of ['https://evil.example/','//evil.example/','/\\evil.example/','/auth\nwrong','x'.repeat(2049)])expect(schema?.safeParse({...base,[field]:value}).success).toBe(false);
  }
  const verify=c.ApiEndpointRegistry.find(e=>e.path==='/api/auth/verify-email');expect(verify?.method).toBe('GET');expect(verify?.requestSchema?.safeParse({token:'opaque-token'}).success).toBe(true);expect(verify?.requestSchema?.safeParse({token:''}).success).toBe(false);expect(verify?.requestSchema?.safeParse({token:'opaque-token',userId:'forged'}).success).toBe(false);
 });
 it('labels fresh attachment/status as session-only and excludes unsafe direct set-password transport',()=>{
  for(const path of ['/api/auth/fg/password-status','/api/auth/fg/password-challenge','/api/auth/fg/password-attach','/api/auth/change-password'])expect(c.ApiEndpointRegistry.find(e=>e.path===path)?.auth).toBe('Authenticated');
  expect(c.ApiEndpointRegistry.find(e=>e.path==='/api/auth/fg/password-status')?.responseSchema.parse({hasPassword:false})).toEqual({hasPassword:false});
  expect(c.ApiEndpointRegistry.some(e=>e.path==='/api/auth/set-password')).toBe(false);
 });
 it('validates native signin and generic mail/reset results without public provider/hash fields',()=>{
  const signin=c.ApiEndpointRegistry.find(e=>e.path==='/api/auth/sign-in/email');expect(signin?.responseSchema.safeParse({redirect:false,token:'private-session',user:{id:'u',name:'FG',email:me.email,emailVerified:true,image:null,createdAt:stamp,updatedAt:stamp}}).success).toBe(true);
  for(const path of ['/api/auth/send-verification-email','/api/auth/reset-password','/api/auth/fg/password-challenge','/api/auth/fg/password-attach'])expect(c.ApiEndpointRegistry.find(e=>e.path===path)?.responseSchema.parse({status:true})).toEqual({status:true});
  expect(c.ApiEndpointRegistry.find(e=>e.path==='/api/auth/request-password-reset')?.responseSchema.safeParse({status:true,message:'If this email exists, check your email.'}).success).toBe(true);
 });
});
