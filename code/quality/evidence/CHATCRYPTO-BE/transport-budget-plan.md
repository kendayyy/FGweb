# Transport ingestion budget

Backend implementation continues under the user's instruction to finish the task. The optional quota preference question has no recorded reply; silence is not approval. Explicit operator configuration is the stated implementation assumption. Production ceilings have not been selected, and activation requires consistent configuration on every replica.

Both retained transport queues share sender and recipient row and logical PostgreSQL jsonb payload-byte limits. ACK/expiry retain their storage charge until deletion. Sorted transaction advisory locks coordinate independent API instances; all new inserts and outbox rows belong to the existing READ COMMITTED transaction. Dedup retries do not add a charge. Missing/invalid configuration rejects new ingestion with 503; exceeding a configured limit returns 429. Batch failure rolls back all inserts. This is not a physical database size measurement or a production throughput claim.

The two-instance native suite covers nine HTTP admission/storage cases, four HTTP late BAN cases, and two native producer expiry cases. The latter deliberately use the real AppModule relay after session seed so HTTP authentication renewal does not change the expiry boundary. Opaque budget fixture bytes are synthetic and are not positive Olm decryption proof. Native SDK/public keys, real signed-cookie HTTP authentication, migrated owned PostgreSQL and the actual relay are used. The separate existing native crypto regression supplies positive crypto interoperability proof.

Earlier failed fixtures are retained: boundary1 invalid PostgreSQL isolation option; boundary2 nonexistent user.banned field; boundary3 malformed fixture SQL plus session renewal caused unbounded sleep, cancelled narrowly in the owned schema twice. Boundary4 uses actual admin_actions and a bounded sleep with an explicit expired-session assertion, and passed 15/15. Assertions and application authority checks were not relaxed.

The original relay snapshot is reconstructed after implementation by removing exactly the five quota additions and verifying equality to the frozen checkpoint hash. This is reconstruction evidence, not a claim that a pre-edit snapshot was captured. No main schema, production configuration or historical PASS record is changed.

## Operator configuration

Both FG_CRYPTO_TRANSPORT_MAX_ROWS_PER_USER and FG_CRYPTO_TRANSPORT_MAX_PAYLOAD_BYTES_PER_USER are required positive safe-integer decimal strings. Set the same values on every API replica before enabling new crypto transport ingestion. There are no production defaults; missing/invalid configuration gives503 for new events. Payload bytes mean octet_length(jsonb::text), including the retained envelope representation, not raw image/ciphertext bytes or physical database size. Existing matching retry records do not add storage. This proof does not choose production values, alter persistent chat history, or change the1,000call/live target.
