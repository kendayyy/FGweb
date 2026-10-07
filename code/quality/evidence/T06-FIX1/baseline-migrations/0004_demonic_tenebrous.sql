CREATE TABLE "realtime_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"event_name" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp,
	CONSTRAINT "realtime_outbox_message_event_unique" UNIQUE("message_id","event_name"),
	CONSTRAINT "realtime_outbox_attempts_check" CHECK ("realtime_outbox"."attempts" >= 0),
	CONSTRAINT "realtime_outbox_event_check" CHECK ("realtime_outbox"."event_name" = 'message.created')
);
--> statement-breakpoint
ALTER TABLE "realtime_outbox" ADD CONSTRAINT "realtime_outbox_message_conversation_fk" FOREIGN KEY ("message_id","conversation_id") REFERENCES "messages"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "realtime_outbox_pending_cursor_idx" ON "realtime_outbox" USING btree ("created_at","id") WHERE "realtime_outbox"."delivered_at" IS NULL;
