# T03-FIX3 — T12 contract prerequisites

T11 is reviewed PASS; T12 preflight revealed that its spec-mandated game-ID Lobby history route is absent from the locked registry, and the client conversation subscription events lack shared input/acknowledgement schemas. The user has authorized direct repairs and sequential remaining work. Rule07 requires changing these boundaries in a follow-up owned by T03 rather than hiding backend-local DTOs in T12.

Add GET /api/v1/games/:gameId/lobby/messages, using the existing ListMessagesQuerySchema and Page<MessageSchema>, public auth. Keep the existing seven-game-title /lobby/messages endpoint for compatibility. Freeze the before-cursor history semantics: latest page up to50; subsequent pages are strictly older than the UTC createdAt/id tuple. Reconnect clients fetch pages until their last known message and merge by message ID. No spec or business scope change.

Add conversation.subscribe and conversation.unsubscribe names, a strict {conversationId} request and a discriminated acknowledgement: {ok:true,conversationId} or {ok:false,error:ApiErrorResponse}. Preserve message.created's existing MessageSchema payload. Guests may subscribe only Lobby; private membership, session and origin checks are the T12 producer's responsibility on every event/delivery. No production implementation or auth/schema change in this fix.

Behavioral RED precedes schema/registry edits. Then full contracts regression, compiled package build, downstream API/web typecheck, changed-scope lint and hash/scope review. Close this owner fix before T12 implementation; T12/T13 must consume these exports directly.
