CREATE TABLE "chat_crypto_report_upload_sources" (
	"upload_id" text PRIMARY KEY NOT NULL,
	"source_message_id" text NOT NULL,
	"retry_fingerprint" text NOT NULL,
	CONSTRAINT "crypto_report_upload_fingerprint_check" CHECK ("chat_crypto_report_upload_sources"."retry_fingerprint" ~ '^[A-Za-z0-9+/]{43}=?$')
);
--> statement-breakpoint
ALTER TABLE "chat_crypto_report_upload_sources" ADD CONSTRAINT "crypto_report_upload_draft_fk" FOREIGN KEY ("upload_id") REFERENCES "chat_crypto_upload_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_report_upload_sources" ADD CONSTRAINT "crypto_report_upload_source_fk" FOREIGN KEY ("source_message_id") REFERENCES "messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crypto_report_upload_source_idx" ON "chat_crypto_report_upload_sources" USING btree ("source_message_id");
--> statement-breakpoint
-- Current search_path owns both sides, including disposable native fixtures.
-- Binding metadata is immutable and cannot repurpose the private draft route.
CREATE FUNCTION chat_crypto_report_upload_binding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invalid boolean;
BEGIN
 IF TG_OP='UPDATE' AND NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'Report upload binding is immutable' USING ERRCODE='23514';
 END IF;
 SELECT d.encryption_mode<>'REPORT_AEAD' OR d.consumed_at IS NOT NULL OR d.conversation_id<>m.conversation_id INTO invalid
 FROM chat_crypto_upload_drafts d CROSS JOIN messages m WHERE d.id=NEW.upload_id AND m.id=NEW.source_message_id;
 IF invalid THEN RAISE EXCEPTION 'Report source binding unavailable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER chat_crypto_report_upload_binding_guard BEFORE INSERT OR UPDATE ON chat_crypto_report_upload_sources FOR EACH ROW EXECUTE FUNCTION chat_crypto_report_upload_binding_guard();
