# T16 direct repair

User replied "tiếp tục làm" to the concrete proposal to let Codex repair T16 directly, test and review, then restore Antigravity for T16-FE. Authorization accepted; no new scope, contracts, database or design changes. Earlier BLOCKED report/failures remain historical evidence. T16 IN_PROGRESS, T16-FE locked.

Root cause: validate(socket) throws for revoked session before heartbeat cleanup inner authorize catch; cached actor and Redis lease remain. Independently reproduced with real services. Redis lease transitions also interleave between service instances. Fixes follow behavior RED/PASS within current allowlist.
