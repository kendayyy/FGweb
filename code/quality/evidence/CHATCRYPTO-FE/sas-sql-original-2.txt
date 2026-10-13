-- Public verification metadata only. Authorization, signatures and SAS equality
-- are verified by the current-member API and the native SDK, not by this guard.
CREATE FUNCTION chat_crypto_valid_protocol_event(payload jsonb, sender_device text, transaction_id text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE kind text; body jsonb; allowed text[]; required text[]; field text; value jsonb;
BEGIN
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR payload - ARRAY['eventType','content']<>'{}'::jsonb OR octet_length(payload::text)>8192 THEN RETURN false; END IF;
 kind:=payload->>'eventType';body:=payload->'content';
 IF body IS NULL OR jsonb_typeof(body)<>'object' THEN RETURN false; END IF;
 CASE kind
 WHEN 'm.key.verification.request' THEN allowed:=ARRAY['transaction_id','from_device','methods','timestamp'];required:=allowed;
 WHEN 'm.key.verification.ready' THEN allowed:=ARRAY['transaction_id','from_device','methods'];required:=allowed;
 WHEN 'm.key.verification.start' THEN allowed:=ARRAY['transaction_id','from_device','method','key_agreement_protocols','hashes','message_authentication_codes','short_authentication_string'];required:=allowed;
 WHEN 'm.key.verification.accept' THEN allowed:=ARRAY['transaction_id','method','key_agreement_protocol','hash','message_authentication_code','short_authentication_string','commitment'];required:=ARRAY['transaction_id','key_agreement_protocol','hash','message_authentication_code','short_authentication_string','commitment'];
 WHEN 'm.key.verification.key' THEN allowed:=ARRAY['transaction_id','key'];required:=allowed;
 WHEN 'm.key.verification.mac' THEN allowed:=ARRAY['transaction_id','mac','keys'];required:=allowed;
 WHEN 'm.key.verification.done' THEN allowed:=ARRAY['transaction_id'];required:=allowed;
 WHEN 'm.key.verification.cancel' THEN allowed:=ARRAY['transaction_id','code','reason'];required:=allowed;
 WHEN 'm.room_key.withheld' THEN allowed:=ARRAY['algorithm','code','reason','room_id','sender_key','session_id','from_device'];required:=ARRAY['algorithm','code','sender_key'];
 ELSE RETURN false;
 END CASE;
 IF body - allowed <> '{}'::jsonb OR NOT body ?& required THEN RETURN false; END IF;
 IF kind<>'m.room_key.withheld' AND (jsonb_typeof(body->'transaction_id') IS DISTINCT FROM 'string' OR body->>'transaction_id' IS DISTINCT FROM transaction_id) THEN RETURN false; END IF;
 IF body ? 'from_device' AND (jsonb_typeof(body->'from_device') IS DISTINCT FROM 'string' OR body->>'from_device' IS DISTINCT FROM sender_device) THEN RETURN false; END IF;
 FOR field,value IN SELECT * FROM jsonb_each(body) LOOP
  IF field IN ('methods','key_agreement_protocols','hashes','message_authentication_codes','short_authentication_string') THEN
   IF jsonb_typeof(value)<>'array' OR jsonb_array_length(value) NOT BETWEEN 1 AND 8 THEN RETURN false; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(value) e WHERE jsonb_typeof(e)<>'string' OR length(e#>>'{}') NOT BETWEEN 1 AND 64) THEN RETURN false; END IF;
  ELSIF field='mac' THEN
   IF jsonb_typeof(value)<>'object' THEN RETURN false; END IF;
   IF (SELECT count(*) FROM jsonb_each(value)) NOT BETWEEN 1 AND 16 OR EXISTS(SELECT 1 FROM jsonb_each(value) e WHERE length(e.key) NOT BETWEEN 1 AND 128 OR jsonb_typeof(e.value)<>'string' OR e.value#>>'{}' !~ '^[A-Za-z0-9+/]{43}=?$') THEN RETURN false; END IF;
  ELSIF field='timestamp' THEN
   IF jsonb_typeof(value)<>'number' OR (value#>>'{}')::numeric NOT BETWEEN 1 AND 9007199254740991 OR trunc((value#>>'{}')::numeric)<>(value#>>'{}')::numeric THEN RETURN false; END IF;
  ELSE
   IF jsonb_typeof(value)<>'string' OR length(value#>>'{}') NOT BETWEEN 1 AND 255 THEN RETURN false; END IF;
   IF field IN ('key','keys','commitment','sender_key','session_id') AND value#>>'{}' !~ '^[A-Za-z0-9+/]{43}=?$' THEN RETURN false; END IF;
  END IF;
 END LOOP;
 IF body ? 'methods' AND body->'methods' <> '["m.sas.v1"]'::jsonb THEN RETURN false; END IF;
 IF body ? 'method' AND body->>'method'<>'m.sas.v1' THEN RETURN false; END IF;
 IF kind='m.room_key.withheld' THEN
  IF body->>'algorithm'<>'m.megolm.v1.aes-sha2' OR body->>'code' NOT IN ('m.blacklisted','m.unverified','m.unauthorised','m.unavailable','m.no_olm') THEN RETURN false; END IF;
  IF body->>'code'<>'m.no_olm' AND NOT body ?& ARRAY['room_id','session_id'] THEN RETURN false; END IF;
  IF body ? 'room_id' AND body->>'room_id' !~ '^![^:[:space:]]+:[^[:space:]]+$' THEN RETURN false; END IF;
 END IF;
 RETURN true;
END $$;

--> statement-breakpoint
CREATE TABLE "chat_crypto_protocol_events" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"membership_revision" bigint NOT NULL,
	"sender_user_id" text NOT NULL,
	"sender_device_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"recipient_device_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"event" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "chat_crypto_protocol_dedup" UNIQUE("sender_user_id","sender_device_id","transaction_id","recipient_user_id","recipient_device_id"),
	CONSTRAINT "chat_crypto_protocol_revision_check" CHECK ("chat_crypto_protocol_events"."membership_revision" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "chat_crypto_protocol_payload_check" CHECK (chat_crypto_valid_protocol_event("chat_crypto_protocol_events"."event","chat_crypto_protocol_events"."sender_device_id","chat_crypto_protocol_events"."transaction_id")),
	CONSTRAINT "chat_crypto_protocol_expiry_check" CHECK ("chat_crypto_protocol_events"."expires_at">"chat_crypto_protocol_events"."created_at" AND ("chat_crypto_protocol_events"."acknowledged_at" IS NULL OR "chat_crypto_protocol_events"."acknowledged_at">="chat_crypto_protocol_events"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "chat_crypto_upload_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"uploader_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"device_id" text,
	"client_upload_id" text NOT NULL,
	"membership_revision" bigint NOT NULL,
	"encryption_mode" text NOT NULL,
	"object_key" text NOT NULL,
	"ciphertext_size" integer NOT NULL,
	"ciphertext_sha256" text NOT NULL,
	"envelope" jsonb,
	"message_id" text,
	"report_evidence_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "chat_crypto_upload_dedup" UNIQUE("uploader_id","client_upload_id"),
	CONSTRAINT "chat_crypto_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "chat_crypto_upload_revision_check" CHECK ("chat_crypto_upload_drafts"."membership_revision" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "chat_crypto_upload_digest_check" CHECK ("chat_crypto_upload_drafts"."ciphertext_sha256" ~ '^[A-Za-z0-9+/]{43}=?$'),
	CONSTRAINT "chat_crypto_upload_object_key_check" CHECK ("chat_crypto_upload_drafts"."object_key" ~ '^[A-Za-z0-9_.-]{1,255}$'),
	CONSTRAINT "chat_crypto_upload_mode_check" CHECK (("chat_crypto_upload_drafts"."encryption_mode"='E2EE' AND "chat_crypto_upload_drafts"."device_id" IS NOT NULL AND "chat_crypto_upload_drafts"."envelope" IS NULL AND "chat_crypto_upload_drafts"."ciphertext_size" BETWEEN 1 AND 5242880 AND "chat_crypto_upload_drafts"."report_evidence_id" IS NULL) OR ("chat_crypto_upload_drafts"."encryption_mode" IN ('LOBBY_AEAD','REPORT_AEAD') AND "chat_crypto_upload_drafts"."ciphertext_size" BETWEEN 1 AND 8388608 AND chat_crypto_valid_envelope("chat_crypto_upload_drafts"."envelope",'LOBBY_AEAD',CASE WHEN "chat_crypto_upload_drafts"."encryption_mode"='REPORT_AEAD' THEN 'fg-report' ELSE 'fg-lobby' END) AND ("chat_crypto_upload_drafts"."encryption_mode"<>'REPORT_AEAD' OR "chat_crypto_upload_drafts"."message_id" IS NULL))),
	CONSTRAINT "chat_crypto_upload_lifecycle_check" CHECK ("chat_crypto_upload_drafts"."expires_at">"chat_crypto_upload_drafts"."created_at" AND (("chat_crypto_upload_drafts"."consumed_at" IS NULL AND "chat_crypto_upload_drafts"."message_id" IS NULL AND "chat_crypto_upload_drafts"."report_evidence_id" IS NULL) OR ("chat_crypto_upload_drafts"."consumed_at" IS NOT NULL AND "chat_crypto_upload_drafts"."consumed_at">="chat_crypto_upload_drafts"."created_at" AND "chat_crypto_upload_drafts"."consumed_at"<"chat_crypto_upload_drafts"."expires_at" AND (("chat_crypto_upload_drafts"."message_id" IS NOT NULL AND "chat_crypto_upload_drafts"."report_evidence_id" IS NULL) OR ("chat_crypto_upload_drafts"."message_id" IS NULL AND "chat_crypto_upload_drafts"."report_evidence_id" IS NOT NULL)))))
);
--> statement-breakpoint
ALTER TABLE "chat_crypto_protocol_events" ADD CONSTRAINT "chat_crypto_protocol_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_protocol_events" ADD CONSTRAINT "chat_crypto_protocol_events_sender_user_id_sender_device_id_chat_crypto_devices_user_id_device_id_fk" FOREIGN KEY ("sender_user_id","sender_device_id") REFERENCES "chat_crypto_devices"("user_id","device_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_protocol_events" ADD CONSTRAINT "chat_crypto_protocol_events_recipient_user_id_recipient_device_id_chat_crypto_devices_user_id_device_id_fk" FOREIGN KEY ("recipient_user_id","recipient_device_id") REFERENCES "chat_crypto_devices"("user_id","device_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_upload_drafts" ADD CONSTRAINT "chat_crypto_upload_drafts_uploader_id_user_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_upload_drafts" ADD CONSTRAINT "chat_crypto_upload_drafts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_upload_drafts" ADD CONSTRAINT "chat_crypto_upload_drafts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_upload_drafts" ADD CONSTRAINT "chat_crypto_upload_drafts_report_evidence_id_chat_crypto_report_evidence_id_fk" FOREIGN KEY ("report_evidence_id") REFERENCES "chat_crypto_report_evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_upload_drafts" ADD CONSTRAINT "chat_crypto_upload_drafts_uploader_id_device_id_chat_crypto_devices_user_id_device_id_fk" FOREIGN KEY ("uploader_id","device_id") REFERENCES "chat_crypto_devices"("user_id","device_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_crypto_protocol_sync_idx" ON "chat_crypto_protocol_events" USING btree ("recipient_user_id","recipient_device_id","created_at","id") WHERE "chat_crypto_protocol_events"."acknowledged_at" IS NULL;--> statement-breakpoint
CREATE INDEX "chat_crypto_draft_expiry_idx" ON "chat_crypto_upload_drafts" USING btree ("expires_at","id") WHERE "chat_crypto_upload_drafts"."consumed_at" IS NULL;