# T22 verification findings

Initial runs1/2 were environment failures (Docker stopped, then PostgreSQL crash recovery), not behavior RED. Docker Desktop and existing local PG/Redis containers restarted without changing data/config. Run3 was genuine RED: missing API404 across14 tests, existing recruitment create passed.

First implementation run:12 tests PASS,2 fixture/contract failures. New invalid-body test initially expected400 despite frozen ErrorCode.INVALID_INPUT mapping to422; corrected to the exact existing contract, without changing production status mapping. Expired Better Auth session is removed, so updating it cannot restore login. The distinct ban assertion remains403; fixture now installs a new real signed session before checking banned applicant. No old tests altered. Test types use the existing T20 ESNext+Bundler/multer augmentation configuration; post helper accepts object consistent with supertest type.

Review regression16 exposed actor session expiry while waiting on locked play session: expected401, received201. Root cause was auth check before the wait only. Source now rechecks live actor with clock_timestamp after acquiring play/request locks and after mutation/outbox before commit, ensuring rollback if expiry crosses a blocking operation. Original assertion retained. No scope expansion.

The exact AppModule wiring audit initially compared Git LF with the existing Windows CRLF working copy. Only newline normalization was added for this one approved file; all frozen/readonly/spec byte hashes remain unchanged. The audit still reconstructs the exact allowed import and registration from the input commit.
