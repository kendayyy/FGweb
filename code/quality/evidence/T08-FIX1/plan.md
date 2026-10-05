# T08-FIX1 closed auth producer follow-up

Prerequisites T10 and T03-FIX2 PASS. Scope limited to getUserMe in AuthService, new separate integration test, and local evidence. Historical auth/profile tests remain unchanged. Restore persisted game-interest titles through existing catalog; derive completion from existing profile plus at least one interest, same policy as isUserOnboarded. Profile avatar presence is distinguished from nullable value, so cleared null is preserved. Session/provider/guard configuration unchanged. No public database migrations, spec or UI changes.

Real HTTP/PostgreSQL RED before source logic, actual AppModule normal database pools using owned URL search_path, signed test session fixture. Then run new6 + original31 regressions, API build/source/test types, web auth regression/types, lint/diff, compiled native HTTP state/cleanup checks and secret/schema audit. No new real Discord login required; existing T08 OAuth evidence stands.
