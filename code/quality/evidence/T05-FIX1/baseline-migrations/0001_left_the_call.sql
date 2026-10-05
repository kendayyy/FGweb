CREATE TABLE "conversation_members" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_member_unique" UNIQUE("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"lobby_id" text,
	"user1_id" text,
	"user2_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_lobby_id_unique" UNIQUE("lobby_id"),
	CONSTRAINT "dm_pair_unique" UNIQUE("user1_id","user2_id"),
	CONSTRAINT "conversation_kind_shape_check" CHECK ((kind = 'DM' AND user1_id IS NOT NULL AND user2_id IS NOT NULL AND user1_id < user2_id AND lobby_id IS NULL) OR (kind = 'LOBBY' AND lobby_id IS NOT NULL AND user1_id IS NULL AND user2_id IS NULL) OR (kind = 'ROOM' AND lobby_id IS NULL AND user1_id IS NULL AND user2_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"url" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"mentioned_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_mentioned_user_unique" UNIQUE("message_id","mentioned_user_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"type" text DEFAULT 'TEXT' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"client_message_id" text NOT NULL,
	"reply_to_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_id_conversation_unique" UNIQUE("id","conversation_id"),
	CONSTRAINT "sender_client_message_id_unique" UNIQUE("sender_id","conversation_id","client_message_id"),
	CONSTRAINT "message_type_check" CHECK (type IN ('TEXT', 'IMAGE'))
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "block_pair_unique" UNIQUE("blocker_id","blocked_id"),
	CONSTRAINT "block_no_self" CHECK (blocker_id <> blocked_id)
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" text NOT NULL,
	"receiver_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "friend_request_pair_unique" UNIQUE("sender_id","receiver_id"),
	CONSTRAINT "friend_request_no_self" CHECK (sender_id <> receiver_id),
	CONSTRAINT "friend_request_status_check" CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" text PRIMARY KEY NOT NULL,
	"user1_id" text NOT NULL,
	"user2_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "friendship_pair_unique" UNIQUE("user1_id","user2_id"),
	CONSTRAINT "friendship_canonical_order" CHECK (user1_id < user2_id)
);
--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lobby_id_lobbies_id_fk" FOREIGN KEY ("lobby_id") REFERENCES "lobbies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user1_id_user_id_fk" FOREIGN KEY ("user1_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user2_id_user_id_fk" FOREIGN KEY ("user2_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_conversation_fk" FOREIGN KEY ("message_id","conversation_id") REFERENCES "messages"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentioned_user_id_user_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_same_conversation_fk" FOREIGN KEY ("reply_to_id","conversation_id") REFERENCES "messages"("id","conversation_id") ON DELETE SET NULL ("reply_to_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_receiver_id_user_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user1_id_user_id_fk" FOREIGN KEY ("user1_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user2_id_user_id_fk" FOREIGN KEY ("user2_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_conversation_cursor_idx" ON "messages" USING btree ("conversation_id","created_at","id");