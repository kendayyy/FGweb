# T07-FIX1 review

Reviewed additive SQL: new table, composite message/conversation FK, message/event uniqueness, nonnegative attempts, creation-only event and pending chronological index. The new migration uses the active schema consistently with all four existing migrations. Old migrations and seeded messages remain intact. Public database is not migrated.

Four behavior tests were RED before the table existed. Real PostgreSQL regression has 40/40 PASS with serial execution, including fresh migration, upgrade preserving content, atomic rollback, duplicate rejection, cross-conversation FK and negative attempts. An intermediate FK fixture collided with the uniqueness constraint; a separate message now exercises the same FK assertion. A parallel run timed out during teardown despite 40 passing tests; the serial run completed and owned schemas are absent. Failure logs are retained.

The audit initially matched the words ON DELETE in an FK as destructive SQL; its statement-level check now rejects actual DROP/TRUNCATE/DELETE statements. This table guarantees persistence and uniqueness only. Delivery/ACL/retries remain T12; no realtime/load success is claimed here.
