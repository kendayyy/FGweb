# T22 regression cleanup investigation

The regression-2 process exited1: all182 individual tests passed, but the unchanged T08 afterAll hook exceeded its5000ms limit. PostgreSQL observation at the end showed an active DROP of that run's isolated test_t08 schema with no lock wait. It later completed; no lingering connection remained. The local PostgreSQL service had recently recovered after the Windows reboot. This is evidence of slow fixture cleanup, not proof of a feature assertion failure or a specific permanent database cause.

The original auth suite was rerun in isolation against healthy PostgreSQL with the exact existing test and timeout. auth-cleanup-1 exited0,16 tests and cleanup passed. No frozen test, assertion, hook timeout, dependency, database configuration or checker was edited. Full regression-3 is required to exit0 with all11 suites and182 tests passing before T22 can be frozen. Failed and interrupted records remain preserved.
