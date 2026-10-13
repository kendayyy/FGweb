# FG T30 - Public Profile Single-Query Final Proposal Review Notes (`antigravity-public-profile-query-final-1`)

## 1. Pool 2 Ownership Attribution & Performance Hypothesis

- **Ownership Confirmed**: Owner 9 actual startup tracing confirms that `pool2` belongs to `RoomsService`. `RoomsService` was observed holding the shared room lock (`FOR SHARE`) for 3515ms during member list and room detail enrichment.
- **N+1 Amplification**: In `ProfilesService.getPublicProfile`, fetching each member's public profile executed three separate queries sequentially (user, profile, and gameProfiles inner join games). For concurrent member enrichment, this issued multiple round-trips across pool 2 while holding the room lock.
- **Performance Hypothesis**: Consolidating `getPublicProfile` into a single SQL statement is an architectural performance hypothesis to relieve pool 2 contention and shorten shared room lock hold duration. It is **not** claimed as proven complete root cause or a guarantee of full native success.

---

## 2. Source & Test Refinements

1. **Source Scope (`profiles.service.ts`)**:
   - Only `getPublicProfile` is modified.
   - All 13 other methods (`getPrivateProfile`, `getGames`, `updateProfile`, `onboarding`, `updateInterests`, `updateGameProfile`, etc.) remain 100% AST byte-identical.
   - Query consolidation uses a single Drizzle query with nested selection and left joins, correctly filtering orphan game profiles and preserving exact contract mappings and fallback semantics.
2. **Reviewed Test Cleanups (`t30-public-profile-query.integration.spec.ts`)**:
   - **Teardown Error Propagation**: No teardown errors are swallowed; always restores `pg.Client.prototype.query` and `process.env.DATABASE_URL`, attempts full schema cleanup, and aggregates any destroy/drop errors.
   - **Strict Contract Equality**: Asserts returned result strictly matches parsed contract DTO (`expect(result).toEqual(parsed)`) to detect any unintended extra/private fields.
   - Verified real-PG RED (3 queries on original source) and GREEN (1 query on proposed source).

---

## 3. Verified File SHA-256 Hashes

| File | SHA-256 | Description |
| :--- | :--- | :--- |
| `profiles.service.ts` | `a6e17104fe042fe8253387ad082b010105ce1697f5bb4bbcd70997bb2d1c5d56` | Verified exact byte copy from reviewed patch1 |
| `t30-public-profile-query.integration.spec.ts` | `0fdc694055a63dc4faedaeb726a61f6e562a1378b36bb74d4581e2e7cef0c485` | Verified exact byte copy from reviewed patch1 |
| `review-notes.md` | *(This file)* | Review documentation |

*No application code, compiled dist, tests, git ledger, or history files were altered. No build or test commands were run by this agent. Ready for Codex to execute gates/RED/GREEN/build/native.*
