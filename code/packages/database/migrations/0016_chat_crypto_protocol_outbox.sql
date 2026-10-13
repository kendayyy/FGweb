CREATE TABLE "chat_crypto_protocol_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"to_device_event_id" text,
	"verification_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "chat_crypto_wakeup_encrypted_unique" UNIQUE("to_device_event_id"),
	CONSTRAINT "chat_crypto_wakeup_verification_unique" UNIQUE("verification_event_id"),
	CONSTRAINT "chat_crypto_wakeup_one_event_check" CHECK (("chat_crypto_protocol_outbox"."to_device_event_id" IS NOT NULL AND "chat_crypto_protocol_outbox"."verification_event_id" IS NULL) OR ("chat_crypto_protocol_outbox"."to_device_event_id" IS NULL AND "chat_crypto_protocol_outbox"."verification_event_id" IS NOT NULL)),
	CONSTRAINT "chat_crypto_wakeup_delivery_check" CHECK ("chat_crypto_protocol_outbox"."delivered_at" IS NULL OR "chat_crypto_protocol_outbox"."delivered_at">="chat_crypto_protocol_outbox"."created_at")
);
--> statement-breakpoint
ALTER TABLE "chat_crypto_protocol_outbox" ADD CONSTRAINT "chat_crypto_protocol_outbox_to_device_event_id_chat_crypto_to_device_events_id_fk" FOREIGN KEY ("to_device_event_id") REFERENCES "chat_crypto_to_device_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_protocol_outbox" ADD CONSTRAINT "chat_crypto_protocol_outbox_verification_event_id_chat_crypto_protocol_events_id_fk" FOREIGN KEY ("verification_event_id") REFERENCES "chat_crypto_protocol_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_crypto_wakeup_pending_idx" ON "chat_crypto_protocol_outbox" USING btree ("created_at","id") WHERE "chat_crypto_protocol_outbox"."delivered_at" IS NULL;
