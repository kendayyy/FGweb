import {pgTable,text,bigint,jsonb,timestamp,foreignKey,unique,primaryKey,check,index} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {messages,attachments} from './messages.js';
import {chatCryptoDevices} from './chat-crypto-devices.js';
import {chatCryptoLegacyMigrations,chatCryptoHistoryCohorts,chatCryptoCohortMembers} from './chat-crypto.js';
import {chatCryptoUploadDrafts} from './chat-crypto-transport.js';
const utc=(name:string)=>timestamp(name,{withTimezone:true,mode:'date'});
/** Prepared archives retain ciphertext/public bindings. They never grant reconciliation. */
export const chatCryptoLegacyCandidates=pgTable('chat_crypto_legacy_candidates',{
 id:text('id').primaryKey(),messageId:text('message_id').notNull().references(()=>chatCryptoLegacyMigrations.messageId,{onDelete:'restrict'}),conversationId:text('conversation_id').notNull(),cohortId:text('cohort_id').notNull(),membershipRevision:bigint('membership_revision',{mode:'number'}).notNull(),originalSha256:text('original_sha256').notNull(),envelopeSha256:text('envelope_sha256').notNull(),importerUserId:text('importer_user_id').notNull(),importerDeviceId:text('importer_device_id').notNull(),envelope:jsonb('envelope').notNull(),preparedAt:utc('prepared_at').notNull().defaultNow(),
},t=>[
 foreignKey({columns:[t.messageId,t.conversationId],foreignColumns:[messages.id,messages.conversationId]}).onDelete('restrict'),
 foreignKey({columns:[t.cohortId,t.conversationId],foreignColumns:[chatCryptoHistoryCohorts.id,chatCryptoHistoryCohorts.conversationId]}).onDelete('restrict'),
 foreignKey({columns:[t.cohortId,t.importerUserId],foreignColumns:[chatCryptoCohortMembers.cohortId,chatCryptoCohortMembers.userId]}).onDelete('restrict'),
 foreignKey({columns:[t.importerUserId,t.importerDeviceId],foreignColumns:[chatCryptoDevices.userId,chatCryptoDevices.deviceId]}).onDelete('restrict'),
 unique('crypto_legacy_candidate_source_epoch_unique').on(t.messageId,t.membershipRevision),unique('crypto_legacy_candidate_cohort_unique').on(t.id,t.cohortId),
 unique('crypto_legacy_candidate_stage_binding_unique').on(t.id,t.messageId,t.conversationId,t.cohortId,t.membershipRevision),
 check('crypto_legacy_candidate_revision_check',sql`${t.membershipRevision} BETWEEN 1 AND 9007199254740991`),
 check('crypto_legacy_candidate_digests_check',sql`${t.originalSha256} ~ '^[A-Za-z0-9+/]{43}=?$' AND ${t.envelopeSha256} ~ '^[A-Za-z0-9+/]{43}=?$'`),
 check('crypto_legacy_candidate_envelope_check',sql`chat_crypto_valid_envelope(${t.envelope},'E2EE','fg-lobby')`),
 index('crypto_legacy_candidate_conversation_idx').on(t.conversationId,t.membershipRevision,t.messageId),
]);
/** Image secrets and filenames remain in the client archive, never in this mapping. */
export const chatCryptoLegacyCandidateImages=pgTable('chat_crypto_legacy_candidate_images',{
 candidateId:text('candidate_id').notNull().references(()=>chatCryptoLegacyCandidates.id,{onDelete:'cascade'}),attachmentId:text('attachment_id').notNull().references(()=>attachments.id,{onDelete:'restrict'}),draftId:text('draft_id').notNull().references(()=>chatCryptoUploadDrafts.id,{onDelete:'restrict'}),plaintextSha256:text('plaintext_sha256').notNull(),ciphertextSha256:text('ciphertext_sha256').notNull(),
},t=>[primaryKey({columns:[t.candidateId,t.attachmentId]}),unique('crypto_legacy_candidate_draft_unique').on(t.draftId),unique('crypto_legacy_image_stage_binding_unique').on(t.candidateId,t.attachmentId,t.draftId),check('crypto_legacy_candidate_image_digests_check',sql`${t.plaintextSha256} ~ '^[A-Za-z0-9+/]{43}=?$' AND ${t.ciphertextSha256} ~ '^[A-Za-z0-9+/]{43}=?$'`)]);
/** Immutable signed client claims; native decryption/parity are separate acceptance proofs. */
export const chatCryptoLegacyAttestations=pgTable('chat_crypto_legacy_attestations',{
 candidateId:text('candidate_id').notNull(),cohortId:text('cohort_id').notNull(),userId:text('user_id').notNull(),deviceId:text('device_id').notNull(),attestation:jsonb('attestation').notNull(),createdAt:utc('created_at').notNull().defaultNow(),
},t=>[
 primaryKey({columns:[t.candidateId,t.userId,t.deviceId]}),
 foreignKey({columns:[t.candidateId,t.cohortId],foreignColumns:[chatCryptoLegacyCandidates.id,chatCryptoLegacyCandidates.cohortId]}).onDelete('cascade'),
 foreignKey({columns:[t.cohortId,t.userId],foreignColumns:[chatCryptoCohortMembers.cohortId,chatCryptoCohortMembers.userId]}).onDelete('restrict'),
 foreignKey({columns:[t.userId,t.deviceId],foreignColumns:[chatCryptoDevices.userId,chatCryptoDevices.deviceId]}).onDelete('restrict'),
 check('crypto_legacy_attestation_object_check',sql`jsonb_typeof(${t.attestation})='object' AND octet_length(${t.attestation}::text)<=16384`),
]);
