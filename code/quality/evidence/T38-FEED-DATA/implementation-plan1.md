# T38-FEED-DATA implementation plan

> Execute inline with superpowers:executing-plans, direct Codex only; one checkpoint at a time. The user already approved product spec13/mockup03 and requests continued completion; no additional routine approval or delegation. This plan does not change approved behavior.

**Goal:** Lock strict shared Feed DTOs/endpoints and a verified additive database migration before Feed API/frontend work.

**Architecture:** Shared Zod contracts expose only public author/game data; existing upload staging gets a separate FEED_POST purpose with no fabricated conversation. PostgreSQL tables enforce image ownership/positions, unique likes and same-post parent references. Explicit API transaction/authorization requirements are handed to T38-FEED-BE, with no runtime Feed success claimed in DATA.

**Tech stack:** Locked Zod4, TypeScript5.9, PostgreSQL17, Drizzle0.45 and Vitest5. No dependencies, main migration, production activation, frontend changes or capacity reduction.

## Reviewed design decisions

- Guest may read visible posts/comments and bound public images. Writes require a verified, onboarded, nonbanned authenticated account (Discord or email per AUTH02). Server checks current authority and existing block/DM policy; Feed adds no notifications or sockets.
- Each create post selects gameTitle from the seven-game enum and type FIND_PLAYMATES/SHARE/DISCUSSION. Body is trimmed plain text,1–5000 Unicode code points; markup remains literal text. No title/capacity/active-slot fields.0–4 unique owned staged image IDs; immutable clientPostId provides retry deduplication. Patch updates body/game/type/images only when explicitly supplied, requires at least one field; server does not bump feed ordering.
- Comments are trimmed1–1000 code points, no attachments; optional parent references a root in the same post. Immutable clientCommentId gives per-author/post retry identity. PostgreSQL composite parent FK enforces same post; the BE transaction must lock/check a nondeleted root and enforce one level. Deleted root responses use an explicit placeholder with null body, retaining valid replies; deleted posts are never public DTOs.
- Feed cursors use bounded base64url transport tokens and a separately validated payload (UTC createdAt+opaque id, optional filter context); server strictly decodes and binds query/filter before SQL.20 default/max50. No updatedAt ranking. Feed page uses FG items/nextCursor/hasMore convention and coherence checks.
- DTO author has only id/displayName/avatarUrl; game has id/title. Counts are safe nonnegative integers; likedByMe is a genuine actor-relative boolean. No email/Discord identifiers/private profile fields. Strict DTOs reject accidental fields.
- Reuse POST /api/v1/uploads/images with a strict FEED_POST request branch and the same existing MIME/5MiB/20MP/re-encode pipeline in BE. Legacy chat request/response remains accepted. Extend pending_image_uploads with default CHAT_IMAGE purpose and nullable conversation only for FEED_POST; preserve original chat rows, size/mime/expiry/filename constraints. Feed finalization consumes an unexpired same-owner FEED_POST draft transactionally. Existing chat routes remain private and cannot read Feed drafts.
- Public reads use GET /api/v1/feed/images/:id/content, bound to a visible undeleted post; drafts and deleted/unbound assets never become public. No unchecked image write endpoint. Store retained processed-image metadata in feed_post_images; unique(id), unique(post,position0..3) and post/author composite FK protect ownership and max4. Storage keys are opaque IDs, not caller URLs.
- posts/likes/comments use FK user/game, tombstone timestamps and stable cursor indexes with game/type variants. Timestamps are UTC. A dedicated immutable feed_content_audit table retains actor/target/report/reason without copying private data; admin deletion must supply reason/current sole authority in BE. Reports gain FEED_POST/FEED_COMMENT target columns/FKs and exact mutually exclusive shape; old USER/MESSAGE shapes and audit routes remain intact.
- Existing API/frontend producers consume new Feed behavior only in subsequent owned tasks. DATA locks contracts/schema and migration compatibility, not implemented endpoints, real asset ACL, root-depth service enforcement or headed acceptance. No main runtime restart or migration.

## Exact scope

packages/contracts/src/{feed,moderation,index}.ts; packages/contracts/test/feed.test.ts; packages/database/src/schema/{feed,moderation,pending-uploads}.ts; packages/database/src/index.ts; new migration0027 and additive migrations/meta/_journal.json; packages/database/test/feed.test.ts; source-pinned contracts/database dist outputs; quality/{api-contract,spec-coverage}.md; quality/evidence/T38-FEED-DATA/**; .runtime/t38-feed-data/**; .cache/t38-feed-data/**. The pending-upload discriminator and registry upload response union are reviewed necessities of explicit FEED_POST staging; no chat producer rewrite in this DATA task. Every shared original transition goes through exact reviewed gate adoption.

## Sequential verification

- [ ] Verify T38 PASS/verified GitHub backup,90 prior PASS rows, approved baselines/checker/spec and exact entry scope; pin originals before business code.
- [ ] Write meaningful contracts REDs for limits, allowed games/types, plain text, strict/public projections, coherent counts/pages, cursors, image/retry identities, upload purpose and all registry/report targets.
- [ ] Write actual PostgreSQL migration/constraints REDs before implementation. Use isolated fresh/pre0027 schemas; preserve populated historical rows and explicitly compare old pending-upload projections after the additive default column.
- [ ] Implement strict contracts and exact registry/moderation integration. Verify focused GREEN and existing contracts regression serially; no original test weakening.
- [ ] Implement matching Drizzle schema and additive0027 SQL/journal. Real migrate fresh/legacy/retry, old-row fingerprints, FK/check/ownership, four-image cap, concurrent like uniqueness/idempotent DELETE semantics, soft delete/audit retained; cleanup owned schemas/runtime.
- [ ] Source lint/typecheck and source-pinned owned contracts/database builds, exact canonical adoption plus API/spec mapping. No main migration or API/FE implementation claim.
- [ ] Direct Codex review, all originals/90 prior PASS/checker/env/lock/baselines/gate and41 historical table fingerprints preserved, actual cleanup/evidence/history; close only after acceptance. Scoped public scan/normal GitHub backup/remote SHA verified before T38-FEED-BE.

## BE handoff gates

Explicitly require current authentication/ban checks, block filtering, parameterized cursor queries, ownership/admin checks, same-post root-only parent checks inside the transaction, image signature/pixel/size/re-encoding plus purpose/expiry/owner consume, post-deletion asset denial, counts without duplicate retries, rate limits and report/audit integration. Database FK uniqueness is not authorization or proof of public asset ACL. Those are tested in T38-FEED-BE; actual UI/headed/mockup03 in T38-FEED-FE.
