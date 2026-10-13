CREATE TABLE "call_admissions" (
	"id" text PRIMARY KEY NOT NULL,
	"call_member_id" text NOT NULL,
	"session_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"connected_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "call_admission_expiry_check" CHECK ("call_admissions"."expires_at">"call_admissions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "call_admissions" ADD CONSTRAINT "call_admissions_call_member_id_call_members_id_fk" FOREIGN KEY ("call_member_id") REFERENCES "call_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_admissions" ADD CONSTRAINT "call_admissions_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_admissions_member_live_idx" ON "call_admissions" USING btree ("call_member_id") WHERE "call_admissions"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "call_admissions_expiry_live_idx" ON "call_admissions" USING btree ("expires_at") WHERE "call_admissions"."revoked_at" IS NULL;
