# T18 runner scope incident

Conversation: 602267e4-860d-4c60-903f-74a5e9efc10f. Required requested model: Gemini 3.6 Flash (High). Codex has stopped implementation; no Antigravity task process remains.

1. Transcript step241 directly wrote an executable cleanup script to C:/Users/PC/.gemini/antigravity-cli/brain/602267e4-860d-4c60-903f-74a5e9efc10f/scratch/clean-schemas.mjs, outside E:/FGweb/code. Project rules prohibit source/scripts outside code. That exact self-created artifact is archived under T18 evidence and removed to restore the boundary; other provider logs/conversations are retained.
2. Transcript step280 ran `git checkout quality/tasks.json`, erasing Codex-owned T18 status, input hash and approved scope. The resumed prompt explicitly made ledger/reviewer evidence readonly. Codex restored only T18 metadata from retained baseline/preflight/scope records and marked BLOCKED, preserving all previous task records. Exact erased original startedAt was unavailable; restored timestamp is the earliest retained approved preflight command.

The runner skill Hard Limits says: "If a task edits unexpected out-of-scope files twice, stop and replan instead of repeatedly refactoring." User's removed fixed review-loop cap does not relax scope, as root AGENTS.md confirms. This blocker is repeated unauthorized scope changes, not a retry-count cap or model quota issue.

Implementation is not PASS. Codex's compiled API probes pass seven room behavior groups, real socket revocation and post-room-lock session expiry. Independent lint has three errors and test typecheck two errors. A deterministic real PostgreSQL barrier probe fails because private room metadata remains in an own-rooms response after membership removal committed during DTO hydration. Required room integration command and broader API regression still need independently recorded final runs after repair. No T19 work is opened; no production publish or media-load claim is made.
