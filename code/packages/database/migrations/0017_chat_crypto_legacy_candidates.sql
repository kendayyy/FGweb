CREATE TABLE "chat_crypto_legacy_attestations" (
	"candidate_id" text NOT NULL,
	"cohort_id" text NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"attestation" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_crypto_legacy_attestations_candidate_id_user_id_device_id_pk" PRIMARY KEY("candidate_id","user_id","device_id"),
	CONSTRAINT "crypto_legacy_attestation_object_check" CHECK (jsonb_typeof("chat_crypto_legacy_attestations"."attestation")='object' AND octet_length("chat_crypto_legacy_attestations"."attestation"::text)<=16384)
);
--> statement-breakpoint
CREATE TABLE "chat_crypto_legacy_candidate_images" (
	"candidate_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"draft_id" text NOT NULL,
	"plaintext_sha256" text NOT NULL,
	"ciphertext_sha256" text NOT NULL,
	CONSTRAINT "chat_crypto_legacy_candidate_images_candidate_id_attachment_id_pk" PRIMARY KEY("candidate_id","attachment_id"),
	CONSTRAINT "crypto_legacy_candidate_draft_unique" UNIQUE("draft_id"),
	CONSTRAINT "crypto_legacy_candidate_image_digests_check" CHECK ("chat_crypto_legacy_candidate_images"."plaintext_sha256" ~ '^[A-Za-z0-9+/]{43}=?$' AND "chat_crypto_legacy_candidate_images"."ciphertext_sha256" ~ '^[A-Za-z0-9+/]{43}=?$')
);
--> statement-breakpoint
CREATE TABLE "chat_crypto_legacy_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"cohort_id" text NOT NULL,
	"membership_revision" bigint NOT NULL,
	"original_sha256" text NOT NULL,
	"envelope_sha256" text NOT NULL,
	"importer_user_id" text NOT NULL,
	"importer_device_id" text NOT NULL,
	"envelope" jsonb NOT NULL,
	"prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_legacy_candidate_source_epoch_unique" UNIQUE("message_id","membership_revision"),
	CONSTRAINT "crypto_legacy_candidate_cohort_unique" UNIQUE("id","cohort_id"),
	CONSTRAINT "crypto_legacy_candidate_revision_check" CHECK ("chat_crypto_legacy_candidates"."membership_revision" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "crypto_legacy_candidate_digests_check" CHECK ("chat_crypto_legacy_candidates"."original_sha256" ~ '^[A-Za-z0-9+/]{43}=?$' AND "chat_crypto_legacy_candidates"."envelope_sha256" ~ '^[A-Za-z0-9+/]{43}=?$'),
	CONSTRAINT "crypto_legacy_candidate_envelope_check" CHECK (chat_crypto_valid_envelope("chat_crypto_legacy_candidates"."envelope",'E2EE','fg-lobby'))
);
--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_attestations" ADD CONSTRAINT "chat_crypto_legacy_attestations_candidate_id_cohort_id_chat_crypto_legacy_candidates_id_cohort_id_fk" FOREIGN KEY ("candidate_id","cohort_id") REFERENCES "chat_crypto_legacy_candidates"("id","cohort_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_attestations" ADD CONSTRAINT "chat_crypto_legacy_attestations_cohort_id_user_id_chat_crypto_cohort_members_cohort_id_user_id_fk" FOREIGN KEY ("cohort_id","user_id") REFERENCES "chat_crypto_cohort_members"("cohort_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_attestations" ADD CONSTRAINT "chat_crypto_legacy_attestations_user_id_device_id_chat_crypto_devices_user_id_device_id_fk" FOREIGN KEY ("user_id","device_id") REFERENCES "chat_crypto_devices"("user_id","device_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_candidate_images" ADD CONSTRAINT "chat_crypto_legacy_candidate_images_candidate_id_chat_crypto_legacy_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "chat_crypto_legacy_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_candidate_images" ADD CONSTRAINT "chat_crypto_legacy_candidate_images_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_candidate_images" ADD CONSTRAINT "chat_crypto_legacy_candidate_images_draft_id_chat_crypto_upload_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "chat_crypto_upload_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_candidates" ADD CONSTRAINT "chat_crypto_legacy_candidates_message_id_chat_crypto_legacy_migrations_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "chat_crypto_legacy_migrations"("message_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_candidates" ADD CONSTRAINT "chat_crypto_legacy_candidates_message_id_conversation_id_messages_id_conversation_id_fk" FOREIGN KEY ("message_id","conversation_id") REFERENCES "messages"("id","conversation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_candidates" ADD CONSTRAINT "chat_crypto_legacy_candidates_cohort_id_conversation_id_chat_crypto_history_cohorts_id_conversation_id_fk" FOREIGN KEY ("cohort_id","conversation_id") REFERENCES "chat_crypto_history_cohorts"("id","conversation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_candidates" ADD CONSTRAINT "chat_crypto_legacy_candidates_cohort_id_importer_user_id_chat_crypto_cohort_members_cohort_id_user_id_fk" FOREIGN KEY ("cohort_id","importer_user_id") REFERENCES "chat_crypto_cohort_members"("cohort_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_candidates" ADD CONSTRAINT "chat_crypto_legacy_candidates_importer_user_id_importer_device_id_chat_crypto_devices_user_id_device_id_fk" FOREIGN KEY ("importer_user_id","importer_device_id") REFERENCES "chat_crypto_devices"("user_id","device_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crypto_legacy_candidate_conversation_idx" ON "chat_crypto_legacy_candidates" USING btree ("conversation_id","membership_revision","message_id");