# Staged source and preserved evidence review

After closure, staged full diff checking reports only tool-emitted trailing whitespace/new blank lines in original captured command logs. The real failed staged check is retained as codex-cached-diff-check-1 and is not counted as a PASS command. Logs are immutable byte evidence with SHA256; they have not been stripped or rewritten to satisfy cosmetic diff checks.

The staged source/config/test/document/evidence-script diff check excludes only codex-*.txt raw captured logs and passes as codex-cached-source-diff-check-1. All source and generated scripts remain subject to the existing lint/type/test checks. Actual main headed alias login/session/admin/logout passed before task closure, and the next original strict gate passed with reviewed owner output hashes. No secret/private input/config or DT files are staged.
