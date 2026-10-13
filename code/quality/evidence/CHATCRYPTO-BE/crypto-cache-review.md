# CHATCRYPTO-BE: private crypto no-store

Actual AppModule/BetterAuth/owned migrated PostgreSQL HTTP tests: RED1 failed DM
fixture canonical-user ordering, not behavior. Corrected RED2 failed6 cases only
because Cache-Control was absent after expected200/401/403/413 status assertions.
One prefix middleware line now sets no-store before crypto JSON parsing and guards.
Native GREEN1 passed6/6. Combined current cache/parsing/raw-media regression passed
10/10 in2suites. API build1 passed. Exact reversal matches prior audited parser
source; all other previously audited application/suite sources remain unchanged.

Existing ordinary100KiB, crypto256KiB, messages192KiB, recovery17MiB and raw media
64KiB bounds remain. Actual HTTP controls verify quotas and exact signed webhook
bytes. Authentication, payloads, routing, schemas and crypto algorithms did not change.
Owned app/schema/physical runtime teardown and restored process environment run in
native fixtures. No mocked provider, fake login/crypto/KMS/PUSH or capacity claim.

The broad301/17 custody-deadline regression predates this header change. It is
retained as prior broad evidence, not a new current full run. This narrow change
is verified by current scoped10 tests and exact source transition; backend closure,
stock-gate spec snapshot mismatch, aggregate policy and T37 ban producer acceptance
remain open. No PASS, main data/environment or production activation.
