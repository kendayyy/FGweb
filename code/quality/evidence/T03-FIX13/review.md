# T03-FIX13 — capacity contract review

PASS is conditional on the recorded closure and unchanged next-task gate. Adds only optional playerCapacity1–10 to the existing PlaySessionDTO. Optional transport compatibility preserves all original fixtures/consumers; no default implies a guessed room or call limit. Current producer completion belongs exclusively to T24-FIX2; T25 must reject incomplete capacity rather than invent one.

New behavioral RED exposed stripping of supplied capacity and acceptance of invalid capacity.111/111 contracts tests pass, including all108 prior cases without edits. The new three tests retain legacy absence and cover native member page/snapshot payloads and bounded integer validation. Contracts build, source/test types, downstream API/web typechecks, scoped lint/diff and closure read-only/baseline/history audit are required. No DB, API producer, frontend or settings/admission policy changes here. Source and generated contracts artifacts are replaced only through this owner snapshot; historic ledger/evidence remain immutable.

Evidence: before.json, codex-red-1/green-1 and build/type/lint/diff records, closure.json. T24-FIX2 is next; this contract PASS alone does not claim a working frontend.
