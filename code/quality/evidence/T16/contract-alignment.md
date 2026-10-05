# Shared contract alignment

Native source build exposed an Antigravity test/producer mismatch: legacy ListOnlineUsersQuery supports limit/gameTitle, not cursor; the new ListGameOnlineUsersQuery expressly supports cursor. Removed unsupported legacy cursor transport and moved the page-two request to the canonical game endpoint. Kept all page size/hasMore/nextCursor/nonduplicate/no-provider-data assertions; legacy bounded endpoint remains tested. No contract/spec edits or weaker pagination assertion. This corrects an invalid test assumption rather than broadening frozen contracts.
