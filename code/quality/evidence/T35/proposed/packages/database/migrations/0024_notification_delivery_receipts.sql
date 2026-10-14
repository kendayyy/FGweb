CREATE TABLE notification_delivery_receipts (
 id text PRIMARY KEY, outbox_id text NOT NULL REFERENCES notification_outbox(id) ON DELETE CASCADE,
 target_hash text NOT NULL, status text NOT NULL, attempts integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT delivery_receipt_target_unique UNIQUE(outbox_id,target_hash),
 CONSTRAINT delivery_receipt_hash_check CHECK(target_hash ~ '^[a-f0-9]{64}$'),
 CONSTRAINT delivery_receipt_status_check CHECK(status IN ('DISPATCHING','ACCEPTED','RETRYABLE','UNCERTAIN','GONE','FAILED','SUPPRESSED')),
 CONSTRAINT delivery_receipt_attempts_check CHECK(attempts BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE INDEX delivery_receipt_recovery_idx ON notification_delivery_receipts(status,updated_at);
