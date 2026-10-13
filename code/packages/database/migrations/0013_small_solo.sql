CREATE TABLE "chat_crypto_outbound_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_user_id" text NOT NULL,
	"sender_device_id" text NOT NULL,
	"membership_revision" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_crypto_session_id_check" CHECK ("chat_crypto_outbound_sessions"."session_id" ~ '^[A-Za-z0-9+/]{43}=?$'),
	CONSTRAINT "chat_crypto_session_revision_check" CHECK ("chat_crypto_outbound_sessions"."membership_revision" BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "chat_crypto_outbound_sessions" ADD CONSTRAINT "chat_crypto_outbound_sessions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_outbound_sessions" ADD CONSTRAINT "chat_crypto_outbound_sessions_sender_user_id_sender_device_id_chat_crypto_devices_user_id_device_id_fk" FOREIGN KEY ("sender_user_id","sender_device_id") REFERENCES "chat_crypto_devices"("user_id","device_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_crypto_session_epoch_idx" ON "chat_crypto_outbound_sessions" USING btree ("conversation_id","sender_user_id","sender_device_id","membership_revision");
--> statement-breakpoint
CREATE FUNCTION chat_crypto_guard_session_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.session_id,NEW.conversation_id,NEW.sender_user_id,NEW.sender_device_id,NEW.membership_revision) IS DISTINCT FROM ROW(OLD.session_id,OLD.conversation_id,OLD.sender_user_id,OLD.sender_device_id,OLD.membership_revision) THEN
  RAISE EXCEPTION 'Megolm session binding is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER chat_crypto_session_binding_policy BEFORE UPDATE ON chat_crypto_outbound_sessions FOR EACH ROW EXECUTE FUNCTION chat_crypto_guard_session_binding();
