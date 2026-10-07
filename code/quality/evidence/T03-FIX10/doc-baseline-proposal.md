# Concurrent document changes — concrete preservation proposal

Before the approved date-only restoration could run, all three frozen baseline documents changed again. The restoration script rejected their new content before writing. The actual diff now includes FEED-CHANGE-01: a community feed, shared navigation, text/images, likes/comments/replies, filters and future moderation/planning. The documents explicitly say this is a newly recorded requirement, with no execution tasks or refreshed baseline yet. None of these writes came from the current task scripts. Do not infer their author from file metadata.

All three current documents and exact git diffs are preserved byte-for-byte in doc-change/, with SHA hashes and source paths in its manifest. This does not authorize deleting or overwriting the additions. Previously completed FG functionality and the invitation prerequisite are unaffected in behavior, but current frozen gates reject the new document hashes.

OptionA (recommended for continuing the original sequential build): with explicit permission, restore the exact three approved baseline document contents, only after verifying that the archived copies still match their current content and that the restored bytes match the existing five-file baseline. Keep the community-feed requirement intact in this evidence archive for a separately planned integration task. Do not implement it inside the existing invitation tasks or change the checker/baseline to bypass review.

OptionB: keep the current documents active and pause current implementation to finish the community-feed integration plan, launch timing, contracts/DB/API/FE/moderation scope, acceptance and task order. A baseline-owner task can then review/rebase requirements and predecessor evidence; no automatic hash replacement or false completed-feed claim.

This is a new scope decision because the preceding user approval covered only the update-date line. The new additions span spec/design/task and exceed that restoration permission. The original task-sequence rule requires a reviewed baseline and one task at a time.
