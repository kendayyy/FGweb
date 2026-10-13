CREATE TABLE "chat_crypto_legacy_stage_objects" (
	"stage_id" text NOT NULL,
	"message_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"draft_id" text NOT NULL,
	"plaintext_sha256" text NOT NULL,
	"ciphertext_sha256" text NOT NULL,
	"cleanup_state" text DEFAULT 'PENDING' NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "chat_crypto_legacy_stage_objects_stage_id_attachment_id_pk" PRIMARY KEY("stage_id","attachment_id"),
	CONSTRAINT "crypto_legacy_stage_object_draft_unique" UNIQUE("stage_id","draft_id"),
	CONSTRAINT "crypto_legacy_stage_object_digests_check" CHECK ("chat_crypto_legacy_stage_objects"."plaintext_sha256" ~ '^[A-Za-z0-9+/]{43}=?$' AND "chat_crypto_legacy_stage_objects"."ciphertext_sha256" ~ '^[A-Za-z0-9+/]{43}=?$'),
	CONSTRAINT "crypto_legacy_stage_object_cleanup_check" CHECK (("chat_crypto_legacy_stage_objects"."cleanup_state"='PENDING' AND "chat_crypto_legacy_stage_objects"."removed_at" IS NULL) OR ("chat_crypto_legacy_stage_objects"."cleanup_state"='REMOVED' AND "chat_crypto_legacy_stage_objects"."removed_at" IS NOT NULL))
);--> statement-breakpoint
CREATE TABLE "chat_crypto_legacy_stage_sources" (
	"stage_id" text NOT NULL,
	"message_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"cohort_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"membership_revision" bigint NOT NULL,
	"original_sha256" text NOT NULL,
	"envelope_sha256" text NOT NULL,
	CONSTRAINT "chat_crypto_legacy_stage_sources_stage_id_message_id_pk" PRIMARY KEY("stage_id","message_id"),
	CONSTRAINT "crypto_legacy_stage_source_binding_unique" UNIQUE("stage_id","message_id","candidate_id"),
	CONSTRAINT "crypto_legacy_stage_source_digests_check" CHECK ("chat_crypto_legacy_stage_sources"."original_sha256" ~ '^[A-Za-z0-9+/]{43}=?$' AND "chat_crypto_legacy_stage_sources"."envelope_sha256" ~ '^[A-Za-z0-9+/]{43}=?$')
);--> statement-breakpoint
CREATE TABLE "chat_crypto_legacy_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"seed_cohort_id" text NOT NULL,
	"reviewer_user_id" text NOT NULL,
	"reviewer_device_id" text NOT NULL,
	"membership_revision" bigint NOT NULL,
	"next_live_revision" bigint NOT NULL,
	"source_count" bigint NOT NULL,
	"attachment_count" bigint NOT NULL,
	"required_claims" bigint NOT NULL,
	"manifest_sha256" text NOT NULL,
	"phase" text DEFAULT 'STAGED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"converted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "crypto_legacy_stage_conversation_unique" UNIQUE("conversation_id"),
	CONSTRAINT "crypto_legacy_stage_context_unique" UNIQUE("id","conversation_id","membership_revision"),
	CONSTRAINT "crypto_legacy_stage_revision_check" CHECK ("chat_crypto_legacy_stages"."membership_revision" BETWEEN 1 AND 9007199254740990 AND "chat_crypto_legacy_stages"."next_live_revision"="chat_crypto_legacy_stages"."membership_revision"+1),
	CONSTRAINT "crypto_legacy_stage_counts_check" CHECK ("chat_crypto_legacy_stages"."source_count" BETWEEN 1 AND 9007199254740991 AND "chat_crypto_legacy_stages"."attachment_count" BETWEEN 0 AND 9007199254740991 AND "chat_crypto_legacy_stages"."required_claims" BETWEEN "chat_crypto_legacy_stages"."source_count" AND 9007199254740991),
	CONSTRAINT "crypto_legacy_stage_manifest_check" CHECK ("chat_crypto_legacy_stages"."manifest_sha256" ~ '^[A-Za-z0-9+/]{43}=?$'),
	CONSTRAINT "crypto_legacy_stage_phase_clocks_check" CHECK (("chat_crypto_legacy_stages"."phase"='STAGED' AND "chat_crypto_legacy_stages"."converted_at" IS NULL AND "chat_crypto_legacy_stages"."completed_at" IS NULL) OR ("chat_crypto_legacy_stages"."phase" IN ('DB_CONVERTED','CLEANING') AND "chat_crypto_legacy_stages"."converted_at" IS NOT NULL AND "chat_crypto_legacy_stages"."converted_at">="chat_crypto_legacy_stages"."created_at" AND "chat_crypto_legacy_stages"."completed_at" IS NULL) OR ("chat_crypto_legacy_stages"."phase"='RECONCILED' AND "chat_crypto_legacy_stages"."converted_at" IS NOT NULL AND "chat_crypto_legacy_stages"."completed_at" IS NOT NULL AND "chat_crypto_legacy_stages"."converted_at">="chat_crypto_legacy_stages"."created_at" AND "chat_crypto_legacy_stages"."completed_at">="chat_crypto_legacy_stages"."converted_at"))
);--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_candidate_images" ADD CONSTRAINT "crypto_legacy_image_stage_binding_unique" UNIQUE("candidate_id","attachment_id","draft_id");--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_candidates" ADD CONSTRAINT "crypto_legacy_candidate_stage_binding_unique" UNIQUE("id","message_id","conversation_id","cohort_id","membership_revision");--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_stage_objects" ADD CONSTRAINT "chat_crypto_legacy_stage_objects_stage_id_message_id_candidate_id_chat_crypto_legacy_stage_sources_stage_id_message_id_candidate_id_fk" FOREIGN KEY ("stage_id","message_id","candidate_id") REFERENCES "chat_crypto_legacy_stage_sources"("stage_id","message_id","candidate_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_stage_objects" ADD CONSTRAINT "chat_crypto_legacy_stage_objects_candidate_id_attachment_id_draft_id_chat_crypto_legacy_candidate_images_candidate_id_attachment_id_draft_id_fk" FOREIGN KEY ("candidate_id","attachment_id","draft_id") REFERENCES "chat_crypto_legacy_candidate_images"("candidate_id","attachment_id","draft_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_stage_sources" ADD CONSTRAINT "chat_crypto_legacy_stage_sources_stage_id_conversation_id_membership_revision_chat_crypto_legacy_stages_id_conversation_id_membership_revision_fk" FOREIGN KEY ("stage_id","conversation_id","membership_revision") REFERENCES "chat_crypto_legacy_stages"("id","conversation_id","membership_revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_stage_sources" ADD CONSTRAINT "chat_crypto_legacy_stage_sources_candidate_id_message_id_conversation_id_cohort_id_membership_revision_chat_crypto_legacy_candidates_id_message_id_conversation_id_cohort_id_membership_revision_fk" FOREIGN KEY ("candidate_id","message_id","conversation_id","cohort_id","membership_revision") REFERENCES "chat_crypto_legacy_candidates"("id","message_id","conversation_id","cohort_id","membership_revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_stages" ADD CONSTRAINT "chat_crypto_legacy_stages_seed_cohort_id_conversation_id_chat_crypto_history_cohorts_id_conversation_id_fk" FOREIGN KEY ("seed_cohort_id","conversation_id") REFERENCES "chat_crypto_history_cohorts"("id","conversation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_stages" ADD CONSTRAINT "chat_crypto_legacy_stages_seed_cohort_id_reviewer_user_id_chat_crypto_cohort_members_cohort_id_user_id_fk" FOREIGN KEY ("seed_cohort_id","reviewer_user_id") REFERENCES "chat_crypto_cohort_members"("cohort_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_stages" ADD CONSTRAINT "chat_crypto_legacy_stages_reviewer_user_id_reviewer_device_id_chat_crypto_devices_user_id_device_id_fk" FOREIGN KEY ("reviewer_user_id","reviewer_device_id") REFERENCES "chat_crypto_devices"("user_id","device_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crypto_legacy_stage_object_cleanup_idx" ON "chat_crypto_legacy_stage_objects" USING btree ("stage_id","cleanup_state","attachment_id");--> statement-breakpoint
CREATE INDEX "crypto_legacy_stage_source_cohort_idx" ON "chat_crypto_legacy_stage_sources" USING btree ("stage_id","cohort_id","message_id");
