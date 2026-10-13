import {pgTable,text,bigint,timestamp,foreignKey,unique,primaryKey,check,index} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {chatCryptoDevices} from './chat-crypto-devices.js';
import {chatCryptoHistoryCohorts,chatCryptoCohortMembers} from './chat-crypto.js';
import {chatCryptoLegacyCandidates,chatCryptoLegacyCandidateImages} from './chat-crypto-legacy-candidates.js';
const utc=(name:string)=>timestamp(name,{withTimezone:true,mode:'date'});
/** Durable public recovery bindings. A stage is not evidence of source conversion. */
export const chatCryptoLegacyStages=pgTable('chat_crypto_legacy_stages',{
 id:text('id').primaryKey(),conversationId:text('conversation_id').notNull(),seedCohortId:text('seed_cohort_id').notNull(),reviewerUserId:text('reviewer_user_id').notNull(),reviewerDeviceId:text('reviewer_device_id').notNull(),membershipRevision:bigint('membership_revision',{mode:'number'}).notNull(),nextLiveRevision:bigint('next_live_revision',{mode:'number'}).notNull(),sourceCount:bigint('source_count',{mode:'number'}).notNull(),attachmentCount:bigint('attachment_count',{mode:'number'}).notNull(),requiredClaims:bigint('required_claims',{mode:'number'}).notNull(),manifestSha256:text('manifest_sha256').notNull(),phase:text('phase').notNull().default('STAGED'),createdAt:utc('created_at').notNull().defaultNow(),convertedAt:utc('converted_at'),completedAt:utc('completed_at'),
},t=>[
 unique('crypto_legacy_stage_conversation_unique').on(t.conversationId),unique('crypto_legacy_stage_context_unique').on(t.id,t.conversationId,t.membershipRevision),
 foreignKey({columns:[t.seedCohortId,t.conversationId],foreignColumns:[chatCryptoHistoryCohorts.id,chatCryptoHistoryCohorts.conversationId]}).onDelete('restrict'),
 foreignKey({columns:[t.seedCohortId,t.reviewerUserId],foreignColumns:[chatCryptoCohortMembers.cohortId,chatCryptoCohortMembers.userId]}).onDelete('restrict'),
 foreignKey({columns:[t.reviewerUserId,t.reviewerDeviceId],foreignColumns:[chatCryptoDevices.userId,chatCryptoDevices.deviceId]}).onDelete('restrict'),
 check('crypto_legacy_stage_revision_check',sql`${t.membershipRevision} BETWEEN 1 AND 9007199254740990 AND ${t.nextLiveRevision}=${t.membershipRevision}+1`),
 check('crypto_legacy_stage_counts_check',sql`${t.sourceCount} BETWEEN 1 AND 9007199254740991 AND ${t.attachmentCount} BETWEEN 0 AND 9007199254740991 AND ${t.requiredClaims} BETWEEN ${t.sourceCount} AND 9007199254740991`),
 check('crypto_legacy_stage_manifest_check',sql`${t.manifestSha256} ~ '^[A-Za-z0-9+/]{43}=?$'`),
 check('crypto_legacy_stage_phase_clocks_check',sql`(${t.phase}='STAGED' AND ${t.convertedAt} IS NULL AND ${t.completedAt} IS NULL) OR (${t.phase} IN ('DB_CONVERTED','CLEANING') AND ${t.convertedAt} IS NOT NULL AND ${t.convertedAt}>=${t.createdAt} AND ${t.completedAt} IS NULL) OR (${t.phase}='RECONCILED' AND ${t.convertedAt} IS NOT NULL AND ${t.completedAt} IS NOT NULL AND ${t.convertedAt}>=${t.createdAt} AND ${t.completedAt}>=${t.convertedAt})`,),
]);
/** Exact candidate context per original message; decoded source stays in Megolm. */
export const chatCryptoLegacyStageSources=pgTable('chat_crypto_legacy_stage_sources',{
 stageId:text('stage_id').notNull(),messageId:text('message_id').notNull(),candidateId:text('candidate_id').notNull(),cohortId:text('cohort_id').notNull(),conversationId:text('conversation_id').notNull(),membershipRevision:bigint('membership_revision',{mode:'number'}).notNull(),originalSha256:text('original_sha256').notNull(),envelopeSha256:text('envelope_sha256').notNull(),
},t=>[
 primaryKey({columns:[t.stageId,t.messageId]}),unique('crypto_legacy_stage_source_binding_unique').on(t.stageId,t.messageId,t.candidateId),
 foreignKey({columns:[t.stageId,t.conversationId,t.membershipRevision],foreignColumns:[chatCryptoLegacyStages.id,chatCryptoLegacyStages.conversationId,chatCryptoLegacyStages.membershipRevision]}).onDelete('restrict'),
 foreignKey({columns:[t.candidateId,t.messageId,t.conversationId,t.cohortId,t.membershipRevision],foreignColumns:[chatCryptoLegacyCandidates.id,chatCryptoLegacyCandidates.messageId,chatCryptoLegacyCandidates.conversationId,chatCryptoLegacyCandidates.cohortId,chatCryptoLegacyCandidates.membershipRevision]}).onDelete('restrict'),
 check('crypto_legacy_stage_source_digests_check',sql`${t.originalSha256} ~ '^[A-Za-z0-9+/]{43}=?$' AND ${t.envelopeSha256} ~ '^[A-Za-z0-9+/]{43}=?$'`),
 index('crypto_legacy_stage_source_cohort_idx').on(t.stageId,t.cohortId,t.messageId),
]);
/** Resumable source-file cleanup markers; never contain filenames or image keys. */
export const chatCryptoLegacyStageObjects=pgTable('chat_crypto_legacy_stage_objects',{
 stageId:text('stage_id').notNull(),messageId:text('message_id').notNull(),candidateId:text('candidate_id').notNull(),attachmentId:text('attachment_id').notNull(),draftId:text('draft_id').notNull(),plaintextSha256:text('plaintext_sha256').notNull(),ciphertextSha256:text('ciphertext_sha256').notNull(),cleanupState:text('cleanup_state').notNull().default('PENDING'),removedAt:utc('removed_at'),
},t=>[
 primaryKey({columns:[t.stageId,t.attachmentId]}),unique('crypto_legacy_stage_object_draft_unique').on(t.stageId,t.draftId),
 foreignKey({columns:[t.stageId,t.messageId,t.candidateId],foreignColumns:[chatCryptoLegacyStageSources.stageId,chatCryptoLegacyStageSources.messageId,chatCryptoLegacyStageSources.candidateId]}).onDelete('restrict'),
 foreignKey({columns:[t.candidateId,t.attachmentId,t.draftId],foreignColumns:[chatCryptoLegacyCandidateImages.candidateId,chatCryptoLegacyCandidateImages.attachmentId,chatCryptoLegacyCandidateImages.draftId]}).onDelete('restrict'),
 check('crypto_legacy_stage_object_digests_check',sql`${t.plaintextSha256} ~ '^[A-Za-z0-9+/]{43}=?$' AND ${t.ciphertextSha256} ~ '^[A-Za-z0-9+/]{43}=?$'`),
 check('crypto_legacy_stage_object_cleanup_check',sql`(${t.cleanupState}='PENDING' AND ${t.removedAt} IS NULL) OR (${t.cleanupState}='REMOVED' AND ${t.removedAt} IS NOT NULL)`),
 index('crypto_legacy_stage_object_cleanup_idx').on(t.stageId,t.cleanupState,t.attachmentId),
]);
