# CHATCRYPTO-BE — explicit text disclosure progress

Task stays IN_PROGRESS. Implements the existing strict POST /api/v1/crypto/reports
contract for USER_DISCLOSED text from reconciled, live E2EE messages only. Image
claims and LEGACY_IMPORT are rejected explicitly while their prerequisites remain
pending. There is no admin read route, Lobby report activation or full report PASS.

Consent must be true. All selected IDs must be unique, in the stated conversation,
and accessible through the reporter's historical membership intervals. Current
membership alone never grants older content. A shared epoch lock serializes with
membership changes; authorization is rechecked after waiting for that lock. The
existing durable session, ban and membership checks remain, including for admins
who are not private conversation members. Reports cannot fetch or decrypt source
messages; a known source ID is not evidence that the supplied text is authentic.

Each selected text and human reason is authenticated/encrypted under fg-report,
bound to conversation/evidence ID. Payload binds reporter/report/source ID and
revision, and labels authenticity USER_SUPPLIED_UNVERIFIED. Generic report metadata
contains no reason/text preview. Only selected evidence is persisted; the third
unselected native Megolm source is absent. Private device/room/recovery keys are
never requested. No broadcast, notification or public image URL is created.

Writer custody is an explicit server injection with no production default. A
missing writer or invalid retention fails 503; no Lobby/root-token or plaintext
fallback. Retention must be a positive integral number of seconds representable
by the SQL int parameter. The one-hour value belongs solely to this isolated
fixture; production policy/provisioning/custody remains unreviewed and unactivated.
Expiry metadata does not claim an implemented report retention/deletion worker.

Native fixture uses the previously pinned OpenBao 2.7.1 digest, TLS/Raft/audit and
actual PostgreSQL migrations in a random owned schema. Independently scoped report
writer can encrypt but cannot decrypt; reader can decrypt evidence but rejects
object substitution. Lobby app cannot write/read the report key. Reader credentials
are test-only, injected in the child environment and never persisted or printed.
OpenBao audit is checked for fixture disclosure/reason and private credentials.
Owned schema, container, TLS private key and key-store are removed after each run.

RED history: first runner failed without tsx, second had a duplicate DM fixture
pair, third reached the route and failed six actual HTTP expectations at 404.
GREEN native 6/6. Review added expiry/ban/admin ACL and a second-encryption KMS
denial; first review expired and accidentally lost its shared auth session through
Better Auth, cascading into 401 failures. A separate expired-session fixture fixes
the test setup without changing production or assertions; second review 8/8.

Final review strengthens DB fault injection to fail on the second evidence insert
using a non-transactional sequence counter, proving the first insert happened and
the whole report/evidence set rolls back. A denied second real Transit encryption
likewise commits no partial report. These are backend integration tests; no headed
UI, client preview/consent UX, cryptographic authorship proof or production report
reader/admin ACL is claimed.

Remaining: images and ownership/validation, admin-only audited reads/revocation,
key rotation/restore/report retention, reviewed production custody/wiring, legacy
imports and all other backend acceptance. POST has no client idempotency identifier
in its locked contract; separate explicit submissions create distinct report IDs.
No permanent retry dedup or complete reporting workflow claim is made.

Final native report-regression-1: 163/163 over 11 suites, including strengthened
second-insert PG rollback (sequence reaches two) and absent custody configuration.
Actual OpenBao audit excludes disclosure text/reason and test credentials. Complete
native fixture result is report-regression-1-result.json; all original RED/setup
and cascading failures stay recorded. types-14 passes with nonincremental checking.
