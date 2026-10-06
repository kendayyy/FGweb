# Independent runtime review — still requires fixes

Real built web + compiled Nest API/PostgreSQL native-social-2 PASS: profile opens DM without friendship, persisted send, reverse block403 retains draft/history/zero new message, unblock retry works. Original assertions retained. Setup failures -1 were connection-refused after Docker stopped, not behavioral results; FG PostgreSQL/Redis restored with exact compose services only.

Real two-tab native-unread-2 FAIL: one persisted peer message delivered by actual POST201 does not show unread1 in inactive conversation in either DM list (timeout15s). Shared message pipeline is real, no request interception. This is behavioral RED for missing unread subscriptions; keep original expectations. Future owner fix must handle closed panel too, dedup/read state and actor cleanup.

Visual review of actual native-social-2 360x800 screenshot: DM panel retains fixed two columns; content on right is clipped, sender line and bubble cut off, composer input and send button cut off. document.scrollWidth check passed because clipping hides overflow; it does NOT establish usable mobile layout. Must adapt DM list/message view for mobile, preserve approved semantic tokens; screenshot all four views and check visible actionable control bounds, not only page overflow. No acceptance weakening or automatic snapshot update.

Independent test-types-2 remains FAIL for mock argument variance, full-profile fixture missingfields and callback-inferrednever. Root types/old frontend regression do not cover newtest typing.
