CREATE TABLE "pending_image_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"uploader_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "pending_image_uploads_size_check" CHECK ("pending_image_uploads"."file_size">0 AND "pending_image_uploads"."file_size"<=5242880),
	CONSTRAINT "pending_image_uploads_mime_check" CHECK ("pending_image_uploads"."mime_type"='image/webp'),
	CONSTRAINT "pending_image_uploads_expiry_check" CHECK ("pending_image_uploads"."expires_at">"pending_image_uploads"."created_at"),
	CONSTRAINT "pending_image_uploads_filename_check" CHECK (length("pending_image_uploads"."file_name") BETWEEN 1 AND 255 AND position('/' in "pending_image_uploads"."file_name")=0 AND position(chr(92) in "pending_image_uploads"."file_name")=0)
);
--> statement-breakpoint
ALTER TABLE "pending_image_uploads" ADD CONSTRAINT "pending_image_uploads_uploader_id_user_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_image_uploads" ADD CONSTRAINT "pending_image_uploads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_image_uploads_expiry_idx" ON "pending_image_uploads" USING btree ("expires_at","id");