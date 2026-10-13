# CHATCRYPTO-BE — expired protocol queue cleanup

Task remains IN_PROGRESS. This additive change uses the existing owner source,
test and evidence scope; no contracts, migrations, historical PASS or production
activation change. Existing producer lifetimes remain ten minutes for public
verification metadata and one day for opaque to-device events.

Ruling: delete only events whose existing expires_at has elapsed. Retain live
acknowledged rows because they carry transaction dedup and conflict detection.
Expiry bounds both delivery and dedup retention; this does not promise permanent
transaction-ID dedup after expiry. Do not remove claimed prekeys, identities,
recovery backups, membership intervals, outbound sessions or report evidence.

Native PostgreSQL RED: three failures, 31 existing cases pass. Expired rows were
retained, batches were not pruned and the real delete-fault trigger was never
called. GREEN: 34/34 after implementing deletion of up to 100 expired rows per
queue in deterministic expiry/ID order with FOR UPDATE SKIP LOCKED. Both queue
deletions share the existing sweep transaction, allowing complete rollback of
queue changes when the second queue faults; retry succeeds after fault removal.
Actual locked rows survive one sweep and disappear after release on the next.

Additional HTTP review probes replay live acknowledged events after a sweep,
require success without replacement or changed expiry/ack, then require conflict
for a different payload with the same transaction ID. Native device public keys
bind those synthetic storage fixtures; they are not a cryptographic validity or
new native Olm interoperability claim. Existing native Olm cases remain intact.

Resume failures are preserved: Docker Desktop was stopped, PostgreSQL refused
connections, then reported startup recovery (57P03). After checking FG container
labels and starting only its existing PostgreSQL/Redis containers, readiness and
resume audit passed. Neither infrastructure failure is behavioral RED.

Remaining acceptance includes orphan objects, timer fault/shutdown coverage,
ingestion quotas and expiry-query performance under load, report retention and
custody, Lobby routes, migration/reconciliation, production wiring, notification
workers and the full security review. No main database migration or cleanup ran.

Fresh review: queue-cleanup-review-1 passes 35/35 native device cases, including
HTTP ACK retry/conflict for both queues. queue-regression-1 passes 155/155 across
ten suites with all frozen assertions retained. types-13 and queue-api-build-1
exit zero. The schema has recipient sync indexes but no expiry index for either
protocol queue; bounded mutation does not establish bounded scan cost or load
capacity. Index/benchmark work remains acceptance, without a database amendment.
