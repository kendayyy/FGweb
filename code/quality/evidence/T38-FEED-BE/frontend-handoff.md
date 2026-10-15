# T38-FEED-BE → T38-FEED-FE

Use canonical `@fg/contracts` Feed schemas/endpoint registry and actual `/api/v1/feed` routes. GET posts, post detail, comments and bound processed image content support guests. All responses are private/no-store. Writes require the current signed, verified, onboarded, unbanned session. Author alone edits; author or current sole website admin deletes, with a mandatory admin reason. Helpers have no Feed authority. Read exact `quality/api-contract.md` and `packages/contracts/src/feed.ts` before implementation.

Upload multipart `purpose=FEED_POST` plus `file` through the existing upload endpoint, without a conversationId field. Receipt contains id/purpose/WebP size/UTC expiry, no public URL. Pass up to four unique draft/retained image IDs to post create/update. Only committed bindings yield the server-relative public image URL; unbound/expired/removed/deleted images and chat/private assets remain unavailable. Keep drafts on recoverable network errors, never show a fake successful publish. Existing chat upload behavior remains separate.

Post cursor is filter-bound, newest by immutable creation/id; edits do not promote. Comments are chronological, post-bound, one-level replies referencing the root. Deleted roots return null-body placeholders retaining replies. Server counts and likedByMe are authoritative; PUT/DELETE likes are idempotent. A changed payload using the same client ID returns409. Do not re-use client IDs for intentionally different submissions.

Handle stale requests/auth changes, refresh, empty/error/loading,429/503 retry and denied/deleted cache clearing. Render body as text. Reuse FG tokens, game logos, compact sidebar/mobile navigation and approved mockup03. Implement profile/DM through existing social flows. Reports accept FEED_POST/FEED_COMMENT; update old frontend report target labels/source actions exhaustively, preserving USER/MESSAGE and E2EE consent/custody paths. Feed mutations create no notifications or new sockets.

Backend tests are synthetic disposable real API/PG/Redis/filesystem tests. The legacy public Lobby upload compatibility case is deliberately unmigrated public fixture data, with no private plaintext send or crypto downgrade. No backend test supplies actual browser XSS rendering, physical PWA/E2EE evidence or1,000 concurrent media proof. Those requirements stay intact in their owning tasks.

Production/main DB was not migrated or activated. The existing T36 HTTPS test runtime uses its frozen build; these new routes are not claimed to be published there. Any actual FE E2E runtime must use its own reviewed source-pinned build/disposable schema and headed Chrome with authorized Telegram viewport captures, without altering frozen T36 evidence.

Task closure and verified Git backup are separate gates; consult closure.json and github-final-sync1.json before entry.
