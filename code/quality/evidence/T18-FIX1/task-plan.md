# T18-FIX1 — Room conversation identity producer

Approved prerequisite for T19; original T18 remains closed. Depends on T03-FIX7 PASS. Sequence T18-FIX1 → T19. Approval: ../T19/approved-scope.md and prerequisite-proposal.md.

Antigravity implements using Gemini 3.6 Flash (High), Anti2 observes, Codex independently reviews and closes. One task only. Antigravity writes exactly apps/api/src/modules/rooms/rooms.service.ts and apps/api/test/rooms.integration.spec.ts. Codex owns this evidence directory and ledger/coverage metadata. Build may refresh ignored API dist. Everything else frozen.

Return the persisted rooms.conversation_id as required conversationId from buildRoomDto and own-list projections. Room ID and conversation ID remain separate; never synthesize an alias. Preserve transactions, session and ban checks, membership hydration locks, pagination, roles and privacy. Public recruitment cards remain unchanged.

Behavior tests first, actual RED before service changes. Preserve all 23 original tests and assertions. Add real PostgreSQL/HTTP tests proving create/detail/list/settings/transfer return actual FK and permitted members can use the returned ID for chat history/send. Outsiders and departed members remain denied, including sockets (native Codex probe). No schema/contracts/controllers/other module edits.

Verification: required rooms integration, full root API regression with local environment, API source/tests typecheck, build, changed lint, native chat/socket ACL and original room race/session/list probes, unchanged spec/design/mockups and predecessor evidence audit, git diff check. All outputs/commands/exits retained. No PASS until independently verified.
