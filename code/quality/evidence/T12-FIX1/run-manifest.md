# T12-FIX1

Approved proposal: ../T17-BE/codex-prerequisite-proposal.md; user authorized continuation and removed fixed retry limit. T03-FIX6 PASS9704a41; only T12-FIX1 active. Antigravity / Gemini3.6 Flash (High) / sequential, Anti2 observes, Codex independently closes.

Scope: apps/api/src/modules/chat/chat.service.ts (DM write policy only), apps/api/test/dm-block.integration.spec.ts, owned evidence. No original test/schema/contract/frontend/other backend/spec/checker/ledger edits by implementer. Pre-existing T17 evidence is preserved. Public/private read ACL, history, old messages and membership remain intact. New DM writes with either block direction must be rejected before persistence/outbox/draft effects.

Shared canonical pair transaction-lock protocol must be documented and exported from the owned ChatService file for the subsequent SocialService to reuse. It serializes DM writes and future block/friend/request/DM-create mutations using the same PG key. Only real PG tests qualify. T17 social endpoints do not exist yet; actual endpoint block/send race is required there later.
