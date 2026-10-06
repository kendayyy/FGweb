# T17-BE — active preflight

Antigravity / Gemini 3.6 Flash (High), sequential. Dependencies T16-FE PASS. Queue: T17-BE then T17-FE through T42, one at a time. First run is read-only source preflight plus owned evidence to identify concrete locked-scope prerequisites before implementation.

Known source concern: ChatService.authorize(write=true) checks session/membership but no block state; ChatService.create used by REST and message.send cannot enforce the new block policy from a separate social controller alone. Existing schema includes blocks/friend requests/friendships and canonical DM pair, so do not add ad-hoc tables. Contracts currently lack a friend-request listing transport for the next frontend's incoming/outgoing request UI. Inspect and report exact gaps before proposing owner-task fixes. No production or test changes during this initial preflight; no redesign or assertion edits.
