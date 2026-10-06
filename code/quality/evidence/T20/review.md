# T20 — Codex review

Implementation reviewed directly by Codex after approval of T03-FIX8 and exact AppModule wiring. Anti2 remains paused; Antigravity was not delegated and its model was not changed.

- Shared contracts validate create/query/output. Guest endpoints return only OPEN PUBLIC cards from non-ended sessions. Public projection excludes conversation IDs, membership, provider IDs and credentials. Cross-game path/query mismatch and Roblox fields are rejected before writes.
- Create now locks current room/owner, writes room+conversation (when new), play session, owner-only roster, active slot and card in one transaction. A helper requires MANAGE_RECRUITMENT and creates a roster for current room owner, not for the helper or other room members. Scheduled cards create no active slot.
- Unique active slots plus owner locking enforce one active now team. Concurrent retries use actor-scoped deterministic card IDs and a transaction advisory lock: repeated payload returns one persisted card; changed payload conflicts. No database migration or schema editing was needed.
- Close/reopen affects card availability only. Close preserves active slots; private/ENDED reopening is rejected. New session inside retained room preserves old members and conversation rather than resurrecting ENDED session.
- Public queries sort missing capacity ascending, updatedAt descending, ID ascending with exact PostgreSQL microseconds and filter-bound cursor. Suggestions exclude full, private, closed and ended cards. Public row locks are held through DTO validation; a native privacy race proves PRIVATE committed while read waits returns404.
- Review caught scheduled time passing while waiting on a room lock (actual RED: expected422, received201). Time is now rechecked against PostgreSQL clock after domain locks. Sessions and bans are likewise revalidated after locks; session row remains locked through mutation commit. The first session-expiry test needed fixture correction because Better Auth refreshes shortened sessions; its first failure is preserved as harness failure, not misrepresented as behavioral RED. The corrected test expires a session after witnessing its authenticated request waiting on a real room lock; returns401 without session/roster writes.
- 13 real HTTP/PostgreSQL integration scenarios, independent compiled-API probes, strict source/new-test typecheck, changed-source lint and full API regression must all pass before closeout. All original predecessor tests/assertions are preserved. Failed RED and lint evidence is retained.

No rank gate was introduced. Applying/approving team membership belongs to T22; frontend cards T21; scheduled lifecycle T24 and notification/outbox delivery T33 remain sequential tasks. No media-load claim is made.

T20 Codex review: PASS subject to verified command records in final-verification.json.

Additional review found a real host-timezone defect: created_at is a legacy timestamp without timezone, so pg Date serialization on Asia/Bangkok shifted creation time by seven hours. Native compiled-API timestamp probe recorded RED. The service now explicitly sets transaction timezone UTC and formats stored UTC created/updated timestamps in PostgreSQL, preserving microseconds. A 14th integration case and native probe assert the stored instant; final source/test/lint/build/native/full regression records supersede pre-fix runs.
