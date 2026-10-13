# T03-FIX14 — Call action contracts

The three existing mutations (create call, join call, leave call) now share the exported CallActionRequestSchema, an explicit strict empty object. It rejects client authority overrides and malformed payloads instead of stripping unknown fields. Authentication levels are unchanged: create/join require RoomMember and leave requires CallParticipant. Member-only list, existing CallGroupDTO and CallJoinDTO responses and limits 10/3 remain compatible.

The original behavior RED had seven failures and two compatibility passes; all nine added cases now pass within 120 full contracts tests. Contracts build and task/API/frontend type checks verify shared imports. Existing contract tests and downstream source were preserved. This checkpoint adds no server ACL, token, gateway, media or lifecycle implementation; those remain T26/T27 responsibilities.

Closure requires the unchanged stock T26 gate, frozen outside-scope inputs, historic PASS records, eight baselines, unchanged local configuration and real command evidence. It retains the RED log. Source changes are only calls.ts, the index registry and the new test; API metadata and traceability record the owner amendment. Only calls/index compiled declarations and JavaScript may change among prior contract outputs.

The first closure audit and proposed gate succeeded, but Windows returned UNKNOWN when opening quality/tasks.json to persist the ledger. The task remained IN_PROGRESS. That log and the first candidate closure are preserved; a second full audit and gate must succeed before saving PASS. No code or assertions were changed to handle this filesystem failure.
