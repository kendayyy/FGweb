CREATE TABLE "chat_crypto_report_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"report_id" text NOT NULL,
	"action" text NOT NULL,
	"attachment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_report_audit_action_check" CHECK (("chat_crypto_report_audit"."action"='READ_REPORT' AND "chat_crypto_report_audit"."attachment_id" IS NULL) OR ("chat_crypto_report_audit"."action"='READ_IMAGE' AND "chat_crypto_report_audit"."attachment_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "chat_crypto_report_audit" ADD CONSTRAINT "chat_crypto_report_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_crypto_report_audit" ADD CONSTRAINT "chat_crypto_report_audit_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crypto_report_audit_report_idx" ON "chat_crypto_report_audit" USING btree ("report_id","created_at");
