CREATE TABLE "chat_crypto_devices" (
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"device_keys" jsonb NOT NULL,
	"ed25519_key" text NOT NULL,
	"curve25519_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "chat_crypto_devices_user_id_device_id_pk" PRIMARY KEY("user_id","device_id"),
	CONSTRAINT "chat_crypto_device_curve_unique" UNIQUE("curve25519_key"),
	CONSTRAINT "chat_crypto_device_id_check" CHECK (length("chat_crypto_devices"."device_id") BETWEEN 1 AND 128),
	CONSTRAINT "chat_crypto_device_public_keys_check" CHECK ("chat_crypto_devices"."ed25519_key" ~ '^[A-Za-z0-9+/]{43}=?$' AND "chat_crypto_devices"."curve25519_key" ~ '^[A-Za-z0-9+/]{43}=?$' AND jsonb_typeof("chat_crypto_devices"."device_keys")='object' AND "chat_crypto_devices"."device_keys" - ARRAY['user_id','device_id','algorithms','keys','signatures'] = '{}'::jsonb AND "chat_crypto_devices"."device_keys"->>'device_id'="chat_crypto_devices"."device_id")
);
--> statement-breakpoint
CREATE TABLE "chat_crypto_identity_keys" (
	"user_id" text PRIMARY KEY NOT NULL,
	"public_keys" jsonb NOT NULL,
	"revision" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_crypto_identity_revision_check" CHECK ("chat_crypto_identity_keys"."revision" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "chat_crypto_identity_public_only_check" CHECK (jsonb_typeof("chat_crypto_identity_keys"."public_keys")='object' AND "chat_crypto_identity_keys"."public_keys" - ARRAY['masterKey','selfSigningKey','userSigningKey'] = '{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "chat_crypto_one_time_keys" (
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"key_id" text NOT NULL,
	"signed_key" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	CONSTRAINT "chat_crypto_one_time_keys_user_id_device_id_key_id_pk" PRIMARY KEY("user_id","device_id","key_id"),
	CONSTRAINT "chat_crypto_otk_public_only_check" CHECK ("chat_crypto_one_time_keys"."key_id" ~ '^signed_curve25519:[A-Za-z0-9_.-]+$' AND jsonb_typeof("chat_crypto_one_time_keys"."signed_key")='object' AND "chat_crypto_one_time_keys"."signed_key" - ARRAY['key','signatures'] = '{}'::jsonb AND "chat_crypto_one_time_keys"."signed_key"->>'key' ~ '^[A-Za-z0-9+/]{43}=?$')
);
--> statement-breakpoint
CREATE TABLE "chat_crypto_recovery_backups" (
	"user_id" text PRIMARY KEY NOT NULL,
	"backup_version" bigint NOT NULL,
	"ciphertext" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_crypto_recovery_version_check" CHECK ("chat_crypto_recovery_backups"."backup_version" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "chat_crypto_recovery_cipher_check" CHECK (octet_length("chat_crypto_recovery_backups"."ciphertext") BETWEEN 100 AND 16777216 AND "chat_crypto_recovery_backups"."ciphertext" LIKE '-----BEGIN MEGOLM SESSION DATA-----%' AND "chat_crypto_recovery_backups"."ciphertext" LIKE '%-----END MEGOLM SESSION DATA-----')
);
--> statement-breakpoint
CREATE TABLE "chat_crypto_cohort_members" (
	"cohort_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "chat_crypto_cohort_members_cohort_id_user_id_pk" PRIMARY KEY("cohort_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "chat_crypto_history_cohorts" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"verification_basis" text NOT NULL,
	CONSTRAINT "chat_crypto_cohort_conversation_unique" UNIQUE("id","conversation_id"),
	CONSTRAINT "chat_crypto_cohort_basis_check" CHECK ("chat_crypto_history_cohorts"."verification_basis" IN ('MEMBERSHIP_INTERVALS','EXPLICIT_RECONCILIATION'))
);
--> statement-breakpoint
CREATE TABLE "chat_crypto_legacy_migrations" (
	"message_id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"cohort_id" text NOT NULL,
	"original_sha256" text NOT NULL,
	"state" text NOT NULL,
	"prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reconciled_at" timestamp with time zone,
	CONSTRAINT "chat_crypto_original_digest_check" CHECK ("chat_crypto_legacy_migrations"."original_sha256" ~ '^[A-Za-z0-9+/]{43}=?$'),
	CONSTRAINT "chat_crypto_receipt_state_check" CHECK (("chat_crypto_legacy_migrations"."state"='PREPARED' AND "chat_crypto_legacy_migrations"."reconciled_at" IS NULL) OR ("chat_crypto_legacy_migrations"."state"='RECONCILED' AND "chat_crypto_legacy_migrations"."reconciled_at">="chat_crypto_legacy_migrations"."prepared_at"))
);
--> statement-breakpoint
CREATE TABLE "chat_crypto_membership_intervals" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"start_revision" bigint NOT NULL,
	"end_revision" bigint,
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "chat_crypto_interval_check" CHECK ("chat_crypto_membership_intervals"."start_revision" BETWEEN 1 AND 9007199254740991 AND (("chat_crypto_membership_intervals"."end_revision" IS NULL AND "chat_crypto_membership_intervals"."left_at" IS NULL) OR ("chat_crypto_membership_intervals"."end_revision">"chat_crypto_membership_intervals"."start_revision" AND "chat_crypto_membership_intervals"."end_revision"<=9007199254740991 AND "chat_crypto_membership_intervals"."left_at">="chat_crypto_membership_intervals"."joined_at")))
);
--> statement-breakpoint
CREATE TABLE "chat_crypto_report_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"envelope" jsonb NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chat_crypto_report_source_check" CHECK ("chat_crypto_report_evidence"."source" IN ('USER_DISCLOSED','LEGACY_IMPORT')),
	CONSTRAINT "chat_crypto_report_envelope_check" CHECK (jsonb_typeof("chat_crypto_report_evidence"."envelope")='object' AND "chat_crypto_report_evidence"."envelope"->>'protocol'='OPENBAO_TRANSIT_AES256GCM' AND "chat_crypto_report_evidence"."envelope"->>'keyId'='fg-report' AND "chat_crypto_report_evidence"."envelope" - ARRAY['version','protocol','keyId','keyVersion','ciphertext'] = '{}'::jsonb),
	CONSTRAINT "chat_crypto_report_expiry_check" CHECK ("chat_crypto_report_evidence"."expires_at">"chat_crypto_report_evidence"."created_at")
);
--> statement-breakpoint
CREATE TABLE "chat_crypto_state" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"membership_revision" bigint DEFAULT 1 NOT NULL,
	"migration_state" text DEFAULT 'LEGACY_PENDING' NOT NULL,
	"history_status" text DEFAULT 'UNKNOWN' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_crypto_mode_check" CHECK ("chat_crypto_state"."mode" IN ('E2EE','LOBBY_AEAD')),
	CONSTRAINT "chat_crypto_revision_check" CHECK ("chat_crypto_state"."membership_revision" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "chat_crypto_migration_state_check" CHECK ("chat_crypto_state"."migration_state" IN ('LEGACY_PENDING','MIGRATING','RECONCILED')),
	CONSTRAINT "chat_crypto_history_status_check" CHECK ("chat_crypto_state"."history_status" IN ('KNOWN','UNKNOWN'))
);
--> statement-breakpoint
CREATE TABLE "chat_crypto_to_device_events" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"membership_revision" bigint NOT NULL,
	"sender_user_id" text NOT NULL,
	"sender_device_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"recipient_device_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "chat_crypto_to_device_dedup" UNIQUE("sender_user_id","sender_device_id","transaction_id","recipient_user_id","recipient_device_id"),
	CONSTRAINT "chat_crypto_to_device_revision_check" CHECK ("chat_crypto_to_device_events"."membership_revision" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "chat_crypto_to_device_expiry_check" CHECK ("chat_crypto_to_device_events"."expires_at">"chat_crypto_to_device_events"."created_at"),
	CONSTRAINT "chat_crypto_to_device_cipher_check" CHECK (jsonb_typeof("chat_crypto_to_device_events"."content")='object' AND "chat_crypto_to_device_events"."content"->>'algorithm'='m.olm.v1.curve25519-aes-sha2' AND "chat_crypto_to_device_events"."content" - ARRAY['algorithm','sender_key','ciphertext'] = '{}'::jsonb AND jsonb_typeof("chat_crypto_to_device_events"."content"->'ciphertext')='object' AND octet_length("chat_crypto_to_device_events"."content"::text)<=262144)
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "encryption_mode" text DEFAULT 'LEGACY_PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "crypto_envelope" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "encryption_mode" text DEFAULT 'LEGACY_PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "crypto_envelope" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "crypto_revision" bigint;--> statement-breakpoint
ALTER TABLE "chat_crypto_devices" ADD CONSTRAINT "chat_crypto_devices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_identity_keys" ADD CONSTRAINT "chat_crypto_identity_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_one_time_keys" ADD CONSTRAINT "chat_crypto_one_time_keys_user_id_device_id_chat_crypto_devices_user_id_device_id_fk" FOREIGN KEY ("user_id","device_id") REFERENCES "chat_crypto_devices"("user_id","device_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_recovery_backups" ADD CONSTRAINT "chat_crypto_recovery_backups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_cohort_members" ADD CONSTRAINT "chat_crypto_cohort_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_cohort_members" ADD CONSTRAINT "chat_crypto_cohort_members_cohort_id_conversation_id_chat_crypto_history_cohorts_id_conversation_id_fk" FOREIGN KEY ("cohort_id","conversation_id") REFERENCES "chat_crypto_history_cohorts"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_history_cohorts" ADD CONSTRAINT "chat_crypto_history_cohorts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_migrations" ADD CONSTRAINT "chat_crypto_legacy_migrations_message_id_conversation_id_messages_id_conversation_id_fk" FOREIGN KEY ("message_id","conversation_id") REFERENCES "messages"("id","conversation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_legacy_migrations" ADD CONSTRAINT "chat_crypto_legacy_migrations_cohort_id_conversation_id_chat_crypto_history_cohorts_id_conversation_id_fk" FOREIGN KEY ("cohort_id","conversation_id") REFERENCES "chat_crypto_history_cohorts"("id","conversation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_membership_intervals" ADD CONSTRAINT "chat_crypto_membership_intervals_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_membership_intervals" ADD CONSTRAINT "chat_crypto_membership_intervals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_report_evidence" ADD CONSTRAINT "chat_crypto_report_evidence_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_report_evidence" ADD CONSTRAINT "chat_crypto_report_evidence_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_state" ADD CONSTRAINT "chat_crypto_state_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_to_device_events" ADD CONSTRAINT "chat_crypto_to_device_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_to_device_events" ADD CONSTRAINT "chat_crypto_to_device_events_sender_user_id_sender_device_id_chat_crypto_devices_user_id_device_id_fk" FOREIGN KEY ("sender_user_id","sender_device_id") REFERENCES "chat_crypto_devices"("user_id","device_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_to_device_events" ADD CONSTRAINT "chat_crypto_to_device_events_recipient_user_id_recipient_device_id_chat_crypto_devices_user_id_device_id_fk" FOREIGN KEY ("recipient_user_id","recipient_device_id") REFERENCES "chat_crypto_devices"("user_id","device_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_crypto_otk_available_idx" ON "chat_crypto_one_time_keys" USING btree ("user_id","device_id") WHERE "chat_crypto_one_time_keys"."claimed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_crypto_one_active_interval_idx" ON "chat_crypto_membership_intervals" USING btree ("conversation_id","user_id") WHERE "chat_crypto_membership_intervals"."end_revision" IS NULL;--> statement-breakpoint
CREATE INDEX "chat_crypto_history_access_idx" ON "chat_crypto_membership_intervals" USING btree ("conversation_id","user_id","start_revision");--> statement-breakpoint
CREATE INDEX "chat_crypto_device_sync_idx" ON "chat_crypto_to_device_events" USING btree ("recipient_user_id","recipient_device_id","created_at","id") WHERE "chat_crypto_to_device_events"."acknowledged_at" IS NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachment_encryption_shape_check" CHECK (("attachments"."encryption_mode"='LEGACY_PENDING' AND "attachments"."crypto_envelope" IS NULL) OR ("attachments"."encryption_mode"='E2EE' AND "attachments"."file_name"='' AND "attachments"."mime_type"='application/octet-stream' AND "attachments"."crypto_envelope" IS NULL AND "attachments"."file_size" BETWEEN 1 AND 5242880) OR ("attachments"."encryption_mode"='LOBBY_AEAD' AND jsonb_typeof("attachments"."crypto_envelope")='object' AND "attachments"."crypto_envelope"->>'protocol'='OPENBAO_TRANSIT_AES256GCM'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "message_encryption_shape_check" CHECK (("messages"."encryption_mode"='LEGACY_PENDING' AND "messages"."crypto_envelope" IS NULL AND "messages"."crypto_revision" IS NULL) OR ("messages"."content"='' AND "messages"."crypto_revision" BETWEEN 1 AND 9007199254740991 AND jsonb_typeof("messages"."crypto_envelope")='object' AND (("messages"."encryption_mode"='E2EE' AND "messages"."crypto_envelope"->>'protocol'='MATRIX_MEGOLM' AND "messages"."crypto_envelope"->>'version'='1' AND "messages"."crypto_envelope"#>>'{event,algorithm}'='m.megolm.v1.aes-sha2' AND "messages"."crypto_envelope" - ARRAY['version','protocol','event'] = '{}'::jsonb) OR ("messages"."encryption_mode"='LOBBY_AEAD' AND "messages"."crypto_envelope"->>'protocol'='OPENBAO_TRANSIT_AES256GCM' AND "messages"."crypto_envelope"->>'keyId'='fg-lobby' AND "messages"."crypto_envelope" - ARRAY['version','protocol','keyId','keyVersion','ciphertext'] = '{}'::jsonb))));
--> statement-breakpoint
INSERT INTO chat_crypto_state(conversation_id,mode,membership_revision,migration_state,history_status)
SELECT id,CASE WHEN kind='LOBBY' THEN 'LOBBY_AEAD' ELSE 'E2EE' END,1,'LEGACY_PENDING','UNKNOWN' FROM conversations;
--> statement-breakpoint
CREATE FUNCTION chat_crypto_guard_message() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conversation_kind text; migration_status text;
BEGIN
 IF TG_OP='UPDATE' AND OLD.encryption_mode<>'LEGACY_PENDING' AND NEW.encryption_mode='LEGACY_PENDING' THEN
  RAISE EXCEPTION 'Encrypted message cannot downgrade' USING ERRCODE='23514';
 END IF;
 SELECT kind INTO conversation_kind FROM conversations WHERE id=NEW.conversation_id;
 IF (NEW.encryption_mode='E2EE' AND conversation_kind='LOBBY') OR (NEW.encryption_mode='LOBBY_AEAD' AND conversation_kind<>'LOBBY') THEN
  RAISE EXCEPTION 'Conversation crypto mode mismatch' USING ERRCODE='23514';
 END IF;
 SELECT migration_state INTO migration_status FROM chat_crypto_state WHERE conversation_id=NEW.conversation_id;
 IF NEW.encryption_mode='LEGACY_PENDING' AND migration_status='RECONCILED' THEN
  RAISE EXCEPTION 'Plaintext writes are closed after reconciliation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER chat_crypto_message_policy BEFORE INSERT OR UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION chat_crypto_guard_message();
