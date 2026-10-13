import {pgTable,text,timestamp,bigint,jsonb,primaryKey,unique,check,foreignKey,index} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {user} from './auth.js';
const utc=(name:string)=>timestamp(name,{withTimezone:true,mode:'date'});
export const chatCryptoDevices=pgTable('chat_crypto_devices',{
 userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),deviceId:text('device_id').notNull(),
 deviceKeys:jsonb('device_keys').notNull(),ed25519Key:text('ed25519_key').notNull(),curve25519Key:text('curve25519_key').notNull(),
 createdAt:utc('created_at').notNull().defaultNow(),revokedAt:utc('revoked_at'),
},t=>[primaryKey({columns:[t.userId,t.deviceId]}),unique('chat_crypto_device_curve_unique').on(t.curve25519Key),check('chat_crypto_device_id_check',sql`length(${t.deviceId}) BETWEEN 1 AND 128`),check('chat_crypto_device_public_keys_check',sql`chat_crypto_valid_device_keys(${t.deviceKeys},${t.deviceId},${t.ed25519Key},${t.curve25519Key})`)]);
export const chatCryptoOneTimeKeys=pgTable('chat_crypto_one_time_keys',{
 userId:text('user_id').notNull(),deviceId:text('device_id').notNull(),keyId:text('key_id').notNull(),signedKey:jsonb('signed_key').notNull(),createdAt:utc('created_at').notNull().defaultNow(),claimedAt:utc('claimed_at'),
},t=>[primaryKey({columns:[t.userId,t.deviceId,t.keyId]}),foreignKey({columns:[t.userId,t.deviceId],foreignColumns:[chatCryptoDevices.userId,chatCryptoDevices.deviceId]}).onDelete('cascade'),check('chat_crypto_otk_public_only_check',sql`${t.keyId} ~ '^signed_curve25519:[A-Za-z0-9_.-]+$' AND chat_crypto_valid_one_time_key(${t.signedKey})`),index('chat_crypto_otk_available_idx').on(t.userId,t.deviceId).where(sql`${t.claimedAt} IS NULL`)]);
export const chatCryptoIdentityKeys=pgTable('chat_crypto_identity_keys',{
 userId:text('user_id').primaryKey().references(()=>user.id,{onDelete:'cascade'}),publicKeys:jsonb('public_keys').notNull(),revision:bigint('revision',{mode:'number'}).notNull(),updatedAt:utc('updated_at').notNull().defaultNow(),
},t=>[check('chat_crypto_identity_revision_check',sql`${t.revision} BETWEEN 1 AND 9007199254740991`),check('chat_crypto_identity_public_only_check',sql`chat_crypto_valid_identity_keys(${t.publicKeys})`)]);
export const chatCryptoRecoveryBackups=pgTable('chat_crypto_recovery_backups',{
 userId:text('user_id').primaryKey().references(()=>user.id,{onDelete:'cascade'}),backupVersion:bigint('backup_version',{mode:'number'}).notNull(),ciphertext:text('ciphertext').notNull(),updatedAt:utc('updated_at').notNull().defaultNow(),
},t=>[check('chat_crypto_recovery_version_check',sql`${t.backupVersion} BETWEEN 1 AND 9007199254740991`),check('chat_crypto_recovery_cipher_check',sql`octet_length(${t.ciphertext}) BETWEEN 100 AND 16777216 AND ${t.ciphertext} ~ '^-----BEGIN MEGOLM SESSION DATA-----[\r\n]+[A-Za-z0-9+/=\r\n]+[\r\n]+-----END MEGOLM SESSION DATA-----$' AND ${t.ciphertext} LIKE '%-----END MEGOLM SESSION DATA-----'`)]);
