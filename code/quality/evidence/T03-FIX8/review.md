# T03-FIX8 — Contract-only Codex review: PASS

User approved the exact T20 prerequisite proposal on2026-10-07. Added optional opaque roomId selection, game-specific public list/suggestions routes and permission-protected reopen. Existing routes, public DTO/query and owner/helper ACL metadata are preserved; no backend/database/product/design change in this task.

Initial RED1 included an incorrect test registry export; corrected to ApiEndpointRegistry in RED2. Genuine missing behavior RED2 observed roomId stripped and missing routes. A proposed Authenticated metadata change conflicted with the preserved legacy ACL test; reverted it and strengthened the new test to assert both RoomHelperOrOwner and MANAGE_RECRUITMENT. No existing test/assertion was edited. New-room creator becomes owner; existing-room creation still requires explicit management permission. Backend checks are pending T20 and are not claimed implemented here.

All69 contracts tests, contracts build, strict source/new-test types, API/web consumer types and changed lint pass. Final audit checks3310 read-only files,2788 frozen predecessor files and five spec/design/mockup baselines with no configured secret leak. Scheduled request schema still evaluates its supplied clock per parse. Public cards retain OPEN PUBLIC restrictions and contain no conversationId field.

Next T20 consumes these reviewed contracts, with only the approved RecruitmentsModule import/registration outside its original module/test scope. Later T21 stays closed until backend tests and real API behavior have passed. Closing a recruitment does not release active slots; ENDED sessions never reopen. No1000-media-load claim.
