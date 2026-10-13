# T31 acceptance review — Codex

The current external-source backend meets approved T31 acceptance: member-only PUT/GET/DELETE with POST compatibility, locally normalized provider/video/channel identities, one atomic source per call, unsafe input rejection and explicitly unknown availability.

Actual current verification: API40/40; serialized full contracts230/230; database migration/legacy preservation and original outbox18/18; exact original admission/publishing24/24; compiled production HTTP/PostgreSQL smoke15 checks; scoped lint exit0. Fresh API compile276 outputs match current compiled bytes. Contracts/database compiled transitions were reviewed before adoption.

The API39/40 whitespace failure was traced to installed URL validation trimming input, reproduced as contract RED, and repaired by raw validation before the URL pipeline. Native original attempt1 failed13admission setup cases while11publishing passed; warm attempt2 had14pass/10fail with intermittent adminJWT denial. Reverse-byte-exact owned original test copies using the previously accepted read-only Linux dependency helper then passed24/24, with identical application/gateway source, assertions and deadlines. Clock probe was inconclusive and no system clock was changed. All failures and private diagnostic copies remain preserved.

Source security review: source-review1.md. Final integrity review compares31176 original files,81 frozen PASS rows, checker/env/baselines and exact gate transitions; current owned schemas/containers/private fixture inputs are absent. One preexisting T26 synthetic namespace (7historical migrations, users created07Oct, no rooms/calls) is retained read-only with full table fingerprints; no historical schema was deleted. Actual API cleanup, original fixture cleanup and compiled smoke cleanup are verified independently.

Scope: local backend/database contracts only; no main migration, production activation, frontend player, browser-media/physical-device or1,000-call capacity claim. Public backup requires a clean actual staged-blob scan and verified remote SHA. No unresolved acceptance finding.
