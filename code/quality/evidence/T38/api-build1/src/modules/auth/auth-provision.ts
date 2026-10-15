import {createHash,randomUUID} from 'node:crypto';
import {NodePgDatabase} from 'drizzle-orm/node-postgres';
import {and,eq,or,sql} from 'drizzle-orm';
import * as schema from '@fg/database';
import {AuthEmailSchema,AuthPasswordSchema,IdSchema} from '@fg/contracts';
import {hashFgPassword} from './auth-password.js';

const ownerIdentifier='fg-admin-provision:v1';
export async function provisionAdminAccount(db:NodePgDatabase<typeof schema>,input:{userId:string;email:string;password:string}):Promise<{created:boolean;verified:boolean}>{
 const userId=IdSchema.parse(input.userId),email=AuthEmailSchema.parse(input.email).toLowerCase(),password=AuthPasswordSchema.parse(input.password);
 if(/[\s,]/.test(userId))throw new Error('Invalid fixed admin identity');
 const binding=createHash('sha256').update(`${userId}\0${email}`).digest('hex');
 return db.transaction(async tx=>{
  // Serialize even different IDs/emails so provisioning cannot create two
  // independent administrators. This protected marker is not a login token.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ownerIdentifier}))`);
  const [marker]=await tx.select().from(schema.verification).where(eq(schema.verification.identifier,ownerIdentifier)).limit(1);
  if(marker){
   if(marker.value!==binding)throw new Error('Admin owner binding conflicts; no identity was changed');
   const [user]=await tx.select().from(schema.user).where(eq(schema.user.id,userId)).limit(1);
   const [credential]=await tx.select().from(schema.account).where(and(eq(schema.account.userId,userId),eq(schema.account.accountId,userId),eq(schema.account.providerId,'credential'))).limit(1);
   if(!user||user.name!=='kingame'||user.email!==email||!credential?.password?.startsWith('fgscrypt-v1:'))throw new Error('Provisioned owner is inconsistent; no repair or password reset performed');
   return {created:false,verified:user.emailVerified};
  }
  const collisions=await tx.select({id:schema.user.id}).from(schema.user).where(or(eq(schema.user.id,userId),sql`lower(${schema.user.email})=${email}`,sql`lower(btrim(normalize(${schema.user.name},NFKC)))='kingame'`)).limit(1);
  const profileCollisions=await tx.select({id:schema.profiles.userId}).from(schema.profiles).where(sql`lower(btrim(normalize(${schema.profiles.displayName},NFKC)))='kingame'`).limit(1);
  if(collisions.length||profileCollisions.length)throw new Error('Admin identity is occupied; refusing takeover or automatic account linking');
  const now=new Date(),hash=await hashFgPassword(password);
  await tx.insert(schema.user).values({id:userId,name:'kingame',email,emailVerified:false,createdAt:now,updatedAt:now});
  await tx.insert(schema.account).values({id:randomUUID(),accountId:userId,providerId:'credential',userId,password:hash,createdAt:now,updatedAt:now});
  await tx.insert(schema.verification).values({id:randomUUID(),identifier:ownerIdentifier,value:binding,expiresAt:new Date('2099-12-31T00:00:00.000Z'),createdAt:now,updatedAt:now});
  return {created:true,verified:false};
 });
}
