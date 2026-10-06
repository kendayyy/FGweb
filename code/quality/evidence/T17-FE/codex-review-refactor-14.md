# T17-FE review, 2026-10-06

Status remains IN_PROGRESS. T18 is not opened. Antigravity implements; Anti2 observes; Codex reviews. Same task conversation 5711d9a4-e4bb-400e-ba68-8a44fc1c2d67, required Gemini 3.6 Flash (High).

Refactor13 completed exit0 with semantic surface/text/action token changes in the three owned components. Frozen baseline/scope/secrets/owned-schema audit passed (codex-refactor13-scope-audit.json). Focus-visible styling still needs actual verification; runner output alone does not establish acceptance.

Independent request-pagination-red-1 failed because Tải thêm never requested nextCursor. After refactor14's useInfiniteQuery change, request-pagination-review-2 passes. Real Postgres/compiled API/built web probe native-request-pagination-review-1 passes: first page50, UI60 unique incoming requests using real cursor, switch to outgoing shows zero incoming rows, SQL60 remains unchanged. Fixtures cleaned.

independent-task-tests-8: 17/17 PASS. independent-test-types-8 PASS. changed-lint-6 PASS. independent-web-build-12 PASS. These records describe source at those executions, not future edits. build12-native-inputs.json captures source/dist inputs.

Real native-friend-removal-page2-red-1 genuinely fails after actual DELETE200 and SQL59: victim row remains visible after loading60. Root cause: FriendsModal now owns friends-infinite query keys while PeerSocialControls invalidates friends, which does not match friends-infinite. Preserve original/native test assertions and fix all relevant infinite query invalidations. The simple first-page removal earlier passed; this is the additional-pages case, not a claim that every removal fails.

Independent dm-page2-red-1 genuinely fails: opening existing older conversation selects correct ID but activePeer remains unresolved because only first list page is fetched. DirectMessagesPanel currently fabricates peer-fallback/Peer User metadata; remove that production fallback and resolve actual API data with honest loading/error/retry. Existing APIs already support cursor, so this stays within T17-FE.

Remaining: DM list pagination/errors/older-history retry, cursor anomaly truthfulness, query invalidation above, actual focus/semantic style verification and final independent regression/native/guard/audit checks. Refactor15 prompt is prepared but must not run concurrently with refactor14.

Update 09:18 UTC: refactor14's runner was interrupted with exit -1 after repeated additional/background QA; no tests were active at interruption. It is not reported as successful completion. Frozen/scope/secrets/schema audit refactor14 passes. Refactor15 made only the two missing infinite-query invalidations and returned exit0. Independent build13 and unchanged native-friend-removal-page2-review-2 pass: actual60 loaded, DELETE200, SQL59, UI59 and removed victim absent. Real observed list requests fell to9 across initial paging and mutation refresh (not a load claim). Native fixture cleanup completed.

Correction: readonly global.css already applies a 2px color-focus :focus-visible outline, so absence of new owned CSS is not by itself a focus-style defect. Verify actual rendered controls; do not demand duplicate CSS.

Refactor16 is now the sole active same-task runner for DM metadata/paging/errors. Refactor16-prepared-prompt.txt is an unused broader draft, not evidence of a launched call.
