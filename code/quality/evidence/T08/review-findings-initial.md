# Initial independent findings — candidate not accepted

Inspected candidate while initial runner is still verifying. Findings require regression tests and correction before closeout; these are not yet claims about final runner output.

1. SessionGuard parses raw session_token cookie and queries token directly. Better Auth cookies are signed: real browser login will not match this raw value. It also adds an unapproved bearer path and accepts unsigned cookie values. Use Better Auth getSession/fromNodeHeaders with cookie-cache disabled, then query current ban state.
2. Production auth config silently falls back to default signing secret and mock provider credentials/database URL. Missing required runtime configuration must fail safely; only test fixtures can supply fake OAuth credentials.
3. CsrfGuard trusts http/https request Host and accepts Referer when Origin is missing. Canonical origin configuration must be authoritative; missing/null/foreign/malformed origins must not bypass policy through Host or Referer. Wire guards and the Better Auth handler consistently.
4. Node handler is currently mounted through middleware after default body parsing, with an outdated wildcard and initialization timing risks. Real Nest startup must work with the locked Node handler before body consumption; tests must exercise the same wiring.
5. Secure-cookie policy uses NODE_ENV rather than HTTPS base URL. Verify HTTPS cookies, HttpOnly/SameSite and no permissive cache restoring revoked sessions.
6. Ban lookup considers every latest admin action; a later RESOLVE_REPORT/DISMISS_REPORT can incorrectly unban. Filter BAN/UNBAN and use deterministic ordering; prove unrelated actions never lift a ban.
7. Admin by ADMIN_EMAILS lacks verified-email gating; prefer immutable configured user IDs (or verified Discord account IDs looked up server-side), never email coincidence or headers. Existing adminDiscordIds is unused. getUserMe must select the actual Discord account, not fabricate discordId from userId.
8. Integration callback test accepts HTTP 500 as successful security rejection; this hides broken handler wiring. Test real callback error/redirect semantics. Logout must assert actual sign-out success, include required Origin and use a genuine signed cookie before proving DB revocation/replay rejection.
9. TestDummyController is declared but not registered in AppModule/test module; public/admin/onboarding probes must be test-only and actually routable. No dummy routes added to production.
10. Initial source/tests use many any types; require lint/typecheck without disabling rules. Ensure owned Pool shutdown, fixture cleanup surfaces errors, and no shared schema migration or secret output.

Real browser Discord verification and independent command evidence are still pending. Initial checks must not close T08 or unlock T09.

## Locked-package clarification
Codex inspected better-call 1.4.0 node.mjs and adapters/node/request.mjs directly: getRequest detects a consumed request and serializes parsed Express request.body. Therefore the initial body-parser concern is not independently a proven bug for this locked version. Require a real JSON POST sign-in test using the same Nest defaults as production rather than assume every consumed-body path fails. Main/test startup parity and callback/session behavior remain review requirements.
