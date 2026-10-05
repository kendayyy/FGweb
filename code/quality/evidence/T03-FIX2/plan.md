# Closed-owner contract follow-up for approved onboarding

T10 review identified that GET /me cannot tell T11 whether stored onboarding is complete, nor restore interests after refresh. Public profile returns identity fallback even before onboarding, so nickname/localStorage cannot correctly infer completion. This is a missing integration contract for already approved first-login behavior, not new product scope. Prior user authorization allows direct corrections/testing and continued Anti2 tasks. Rule07 requires correction in the owning contract task; historical T03 stays PASS.

T03-FIX2: additive optional MeDTO fields onboardingComplete:boolean and interestedGames:unique titles from existing seven-game catalog. Optional only for existing-consumer compatibility: no fabricated default. Auth producer must emit both from persisted profile/interests in T08-FIX1. Frontend T11 must treat missing state as an integration error, not infer success. Expose these fields only on authenticated /me, not public profile.

T08-FIX1 follows this task and derives completion using existing profile-plus-interest guard semantics, returns persisted interests, and respects explicit stored avatar null when reading /me. Existing SessionGuard and Discord auth identity stay intact. Real PostgreSQL/HTTP regression tests required; original auth/profile tests remain unchanged. No database migrations or spec/design/mockup changes.

Sequential: T10 PASS -> T03-FIX2 -> T08-FIX1 -> T11 via fresh Anti2 conversation.
