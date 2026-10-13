# CHATCRYPTO-BE — audited selected report reading

Continues the existing owner under persisted broad scope. Reader/audit contracts and additive0015 are prerequisites owned by BE, not a reopened DATA task. Existing migrations/snapshots0000–0014 and the original fifteen-entry journal prefix are preserved; only an audit table was added. Main database/environment and historical PASS records remain untouched. Stock successor gate is required at backend closure.

## Boundaries

An independently injected FG_REPORT_READER decrypts fg-report evidence. Writer/Lobby credentials do not substitute for missing reader custody. Only the server soleAdminUserId is accepted; client names, email, roles, Discord IDs or multiple IDs do not grant access. Admin session/ban/grant and clock_timestamp expiry are rechecked after KMS returns. Shared evidence/draft locks serialize retention; cleanup skips them.

Text reads parse the strict authenticated payload, bind report/reporter/conversation identity, retain USER_SUPPLIED_UNVERIFIED and return only submitted text/selected image IDs. Image reads verify physical ciphertext integrity, decrypt the parent selection and require its image ID and source message match before decrypting image bytes. Draft FK association alone is not evidence of selection. Neither route reads original E2EE plaintext or private/recovery keys, nor grants access to the reported conversation.

Successful reads must insert metadata-only audit in the same transaction before returning content. Audit contains actor/report/action/optional attachment ID/time only. Reader/KMS/integrity/expiry/authorization/audit faults do not disclose content. Text/images use no-store; images return WebP/nosniff and no private filename. The audit root references moderation metadata retained after evidence expiry.

## Evidence and rulings

- Scope preparation1 failed because the new RED test had already been written. Scope2 explicitly adopts six previously absent paths; existing database index/journal and contracts sources were already owned. No checker/PASS restriction was relaxed.
- Contracts RED3 failures → GREEN3; full contracts regression173/173 and build passed.
- Generated audit SQL/snapshot/journal are actual artifacts. report-read-prerequisite-review-1 verifies sixteen entries, unchanged prior fifteen-entry prefix, all old migration/snapshot hashes/table definitions and one additive table. Only new0015 FKs are search_path-relative for isolated fixtures.
- Native route RED4 failures404/20 existing passes → GREEN24/24.
- Review reproduced wrong-report image disclosure after draft reassociation: expected404, received200; one failure/25 passes. The reader now authenticates selection inside the encrypted parent payload. Review GREEN26/26.
- Real native token callbacks mutate grant/ban or wait through wall-clock expiry; responses deny and audits remain unchanged. PostgreSQL audit insert-trigger faults and actual writer-role decrypt denial also fail closed without content.
- The first reader RED dispatch overlapped briefly with contract build completion. This scheduling error is recorded; build ended before the native route tests, and subsequent dependent runs are strictly awaited. It is not an independent extra success claim.

No production custody/provisioning, admin UI, complete report retention policy or backend PASS is claimed. Additional full regression/type/build/lint/audit records are saved separately.

Subsequent central-identity review: sole configured ID alone did not enforce the central kingame eligibility policy. Native RED received201 for ordinary-name/unverified/missing-credential states. CryptoReportsService now uses AuthService.isUserAdmin both before and after KMS alongside transaction session/ban checks. Native central-admin GREEN27/27 passed; the positive admin is an isolated random salted-scrypt fixture, not main account provisioning or an admin-login claim. The earlier187-test full regression predates this fix and must be superseded before backend closure.
