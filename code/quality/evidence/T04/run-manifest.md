# T04 run manifest
| Task | Executor | Model | Mode | Write Scope | Depends On | Status |
|---|---|---|---|---|---|---|
| T04 | Antigravity | Gemini 3.6 Flash (High) | sequential fresh conversation | packages/database/src/schema/{auth,profiles,games}.ts; migrations/**; src/seed-games.ts; src/index.ts; test/identity.test.ts; vitest.config.ts; drizzle.config.ts; quality/evidence/T04/** | T03 PASS | active_next |
Baseline commit: 301f324ce2956b641d79e43731c9f051fcf804d6. No pre-existing dirty files. Minimal database entry/config permitted to execute acceptance. Do not touch package manifests/dependencies, global ledger or other tasks.
