import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {NodePgDatabase} from 'drizzle-orm/node-postgres';
import {and,eq,inArray,desc,gt,sql} from 'drizzle-orm';
import {APIError,createAuthEndpoint,createAuthMiddleware,sessionMiddleware,getSessionFromCtx} from 'better-auth/api';
import {hashPassword} from 'better-auth/crypto';
import type {Transporter} from 'nodemailer';
import * as schema from '@fg/database';
import {ApiEndpointRegistry,PasswordChallengeRequestSchema,AttachPasswordRequestSchema,VerifyEmailQuerySchema,RequestPasswordResetSchema,ResetPasswordRequestSchema} from '@fg/contracts';
import {sendAuthMail} from './auth-mail.js';

type Db=NodePgDatabase<typeof schema>;
type Session={session:{id:string;userId:string};user:{id:string;email:string}};
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const invalid=()=>new APIError('BAD_REQUEST',{code:'INVALID_TOKEN',message:'Liên kết không hợp lệ hoặc đã hết hạn.'});
const genericReset={status:true,message:'If this email exists in our system, check your email for the reset link'};
export function createAuthSecurity(db:Db,mail:Transporter,from:string,baseURL:string){
 const banned=async(userId:string,queryDb:Db=db)=>{
  const [latest]=await queryDb.select().from(schema.adminActions).where(and(eq(schema.adminActions.targetUserId,userId),inArray(schema.adminActions.action,['BAN','UNBAN']))).orderBy(desc(schema.adminActions.createdAt),desc(schema.adminActions.id)).limit(1);
  return latest?.action==='BAN';
 };
 const requireCurrent=async(session:Session|null,queryDb:Db=db)=>{
  if(!session)throw new APIError('UNAUTHORIZED',{code:'UNAUTHORIZED',message:'Phiên đăng nhập không hợp lệ.'});
  const [current]=await queryDb.select().from(schema.session).where(and(eq(schema.session.id,session.session.id),eq(schema.session.userId,session.user.id),gt(schema.session.expiresAt,sql`clock_timestamp() AT TIME ZONE 'UTC'`))).limit(1);
  if(!current)throw new APIError('UNAUTHORIZED',{code:'UNAUTHORIZED',message:'Phiên đăng nhập không hợp lệ.'});
  if(await banned(session.user.id,queryDb))throw new APIError('FORBIDDEN',{code:'ACCOUNT_BANNED',message:'Tài khoản đã bị khóa.'});
  const [user]=await queryDb.select().from(schema.user).where(eq(schema.user.id,session.user.id)).limit(1);if(!user)throw new APIError('UNAUTHORIZED',{code:'UNAUTHORIZED',message:'Phiên đăng nhập không hợp lệ.'});return user;
 };
 const hasPassword=async(userId:string,queryDb:Db=db)=>Boolean((await queryDb.select({id:schema.account.id}).from(schema.account).where(and(eq(schema.account.userId,userId),eq(schema.account.providerId,'credential'),eq(schema.account.accountId,userId))).limit(1))[0]);
 const recordEmailToken=async(userId:string,token:string)=>{
  const identifier=`fg-email:${digest(token)}`,now=new Date();
  await db.transaction(async tx=>{await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${identifier}))`);await tx.delete(schema.verification).where(eq(schema.verification.identifier,identifier));await tx.insert(schema.verification).values({id:randomUUID(),identifier,value:userId,expiresAt:new Date(now.getTime()+86400000),createdAt:now,updatedAt:now});});
 };
 const consumeEmailToken=async(token:string)=>{
  const consumed=await db.delete(schema.verification).where(and(eq(schema.verification.identifier,`fg-email:${digest(token)}`),gt(schema.verification.expiresAt,sql`clock_timestamp() AT TIME ZONE 'UTC'`))).returning({value:schema.verification.value});if(consumed.length!==1)throw invalid();
 };
 const plugin={id:'fg-password-ownership',init:()=>({context:{
  // FG verification/reset mail is mandatory. The native background helper
  // catches callback errors, so the supported plugin context must await and
  // propagate them instead of returning success after SMTP failure.
  runInBackgroundOrAwait:async(task:Promise<unknown>|unknown)=>{await task;},
 }}),endpoints:{
  fgPasswordStatus:createAuthEndpoint('/fg/password-status',{method:'GET',use:[sessionMiddleware],metadata:{noStore:true}},async ctx=>{await requireCurrent(ctx.context.session);return ctx.json({hasPassword:await hasPassword(ctx.context.session.user.id)});}),
  fgPasswordChallenge:createAuthEndpoint('/fg/password-challenge',{method:'POST',body:PasswordChallengeRequestSchema,use:[sessionMiddleware],metadata:{noStore:true}},async ctx=>{
   const session=ctx.context.session,token=randomBytes(32).toString('base64url'),now=new Date();
   const user=await db.transaction(async tx=>{await tx.select().from(schema.user).where(eq(schema.user.id,session.user.id)).for('update');const user=await requireCurrent(session,tx);if(await hasPassword(user.id,tx))throw new APIError('CONFLICT',{code:'PASSWORD_ALREADY_SET',message:'Tài khoản đã có mật khẩu.'});await tx.insert(schema.verification).values({id:randomUUID(),identifier:`fg-password:${digest(token)}`,value:JSON.stringify({userId:user.id,sessionId:session.session.id,email:user.email}),expiresAt:new Date(now.getTime()+86400000),createdAt:now,updatedAt:now});return user;});
   try{await sendAuthMail(mail,from,user.email,'ATTACH',`${baseURL}/auth/add-password?token=${encodeURIComponent(token)}`);}catch(error){await db.delete(schema.verification).where(eq(schema.verification.identifier,`fg-password:${digest(token)}`));throw error;}
   return ctx.json({status:true});
  }),
  fgPasswordAttach:createAuthEndpoint('/fg/password-attach',{method:'POST',body:AttachPasswordRequestSchema,use:[sessionMiddleware],metadata:{noStore:true}},async ctx=>{
   const session=ctx.context.session,hashed=await hashPassword(ctx.body.newPassword);
   await db.transaction(async tx=>{
    await tx.select().from(schema.user).where(eq(schema.user.id,session.user.id)).for('update');const user=await requireCurrent(session,tx);
    const [challenge]=await tx.select().from(schema.verification).where(and(eq(schema.verification.identifier,`fg-password:${digest(ctx.body.token)}`),gt(schema.verification.expiresAt,sql`clock_timestamp() AT TIME ZONE 'UTC'`))).for('update');if(!challenge)throw invalid();
    let metadata:{userId:string;sessionId:string;email:string};try{metadata=JSON.parse(challenge.value);}catch{throw invalid();}
    if(metadata.userId!==user.id||metadata.sessionId!==session.session.id||metadata.email!==user.email)throw new APIError('FORBIDDEN',{code:'EMAIL_OWNERSHIP_MISMATCH',message:'Liên kết thuộc phiên đăng nhập khác.'});
    if(await hasPassword(user.id,tx))throw new APIError('CONFLICT',{code:'PASSWORD_ALREADY_SET',message:'Tài khoản đã có mật khẩu.'});
    await tx.delete(schema.verification).where(eq(schema.verification.id,challenge.id));
    const now=new Date();await tx.insert(schema.account).values({id:randomUUID(),accountId:user.id,providerId:'credential',userId:user.id,password:hashed,createdAt:now,updatedAt:now});await tx.update(schema.user).set({emailVerified:true,updatedAt:now}).where(eq(schema.user.id,user.id));
   });return ctx.json({status:true});
  }),
 }};
 const before=createAuthMiddleware(async ctx=>{
  const endpoint=ApiEndpointRegistry.find(e=>e.path===`/api/auth${ctx.path}`),isQuery=ctx.path==='/verify-email';
  const parsed=endpoint?.requestSchema?.safeParse(isQuery?ctx.query:ctx.body);if(parsed&&!parsed.success)throw new APIError('BAD_REQUEST',{code:'INVALID_AUTH_REQUEST',message:'Thông tin xác thực không hợp lệ.'});
  if(ctx.path==='/verify-email')await consumeEmailToken(VerifyEmailQuerySchema.parse(ctx.query).token);
  if(ctx.path==='/change-password')await requireCurrent(await getSessionFromCtx(ctx));
  if(ctx.path==='/request-password-reset'){
   const request=RequestPasswordResetSchema.parse(ctx.body);
   const [user]=await db.select().from(schema.user).where(eq(schema.user.email,request.email.toLowerCase())).limit(1);
   if(!user||!user.emailVerified||!await hasPassword(user.id)||await banned(user.id))return ctx.json(genericReset);
  }
  if(ctx.path==='/reset-password'){
   const request=ResetPasswordRequestSchema.parse(ctx.body);
   const [verification]=await db.select().from(schema.verification).where(eq(schema.verification.identifier,`reset-password:${request.token}`)).limit(1);
   if(!verification||!await hasPassword(verification.value)||await banned(verification.value))throw invalid();
  }
  if(parsed?.success)return {context:isQuery?{query:parsed.data}:{body:parsed.data}};
 });
 return {plugin,before,banned,recordEmailToken};
}
