# T08 independent review — pending

No item below is acceptance evidence until the runtime checks actually execute.

- Better Auth locked 1.7.7 node handler mounted before JSON body parser; Discord only, PostgreSQL Drizzle mapping uses existing tables.
- GET /api/v1/me validates against MeDTO, contains no account access/refresh tokens or session token.
- Session guard rejects absent, expired and revoked DB sessions; changing ban state invalidates access immediately even for an existing cookie.
- Site admin authority comes from server-controlled persisted/configured data, never request headers, email coincidence or room helper role.
- Onboarding reflects existing profile/game-interest data rather than a client-controlled flag; later profile mutation implementation remains T10.
- Mutation checks reject absent, null, foreign and misleading-prefix origins; public read does not authorize mutation; callback state remains Better Auth verified.
- Cookies use HttpOnly, same-origin SameSite, Secure on HTTPS; cookie cache cannot resurrect revoked sessions.
- Logout physically revokes persistence and cannot be replayed. Account linking cannot silently merge same email or accept guest link attempts.
- Tests exercise real Nest HTTP + PostgreSQL in owned isolated schemas; provider fixtures stay test-only and do not replace browser Discord confirmation.
- Full changed-file and dependency diff contains no ledger/baseline/checker/previous task changes by the executor, no production mocks or secrets.
- Capture fresh task acceptance, build, changed source/test typecheck and lint; preserve RED evidence and failed iterations.
- Real browser Discord sign-in, returned authenticated /me and logout/replay verified separately before T08 PASS and T09 unlock.
