# T28 producer prerequisites — authorized scope ruling

T27 is PASS. Existing contracts register GET /calls/:id/participants and POST /calls/:id/self-mic, but their API producers do not exist. Native SFU identities are opaque admission IDs; the frontend cannot safely associate audio tracks with FG users from the current participant DTO. The approved viewer microphone behavior also needs an explicit server restriction signal.

Use persistent human “Permission to broaden Write Scope or touch locked files” for routine required owner checkpoints. T03-FIX15 adds optional mediaIdentity and micRestricted fields (old payloads remain compatible), rejects malformed identities, and makes the self-mic action strict. T26-FIX1 implements the registered reads/self-mic with real membership/session/ban/onboarding/admission/restriction checks and native integration tests. The participant endpoint may expose an opaque track identity to authorized room members, never tokens, session IDs, emails or credentials.

No new product decision or database change is needed. T29 still owns moderator actions/native publication restriction and screen permissions; do not implement its UI or actions here. T28 begins only after both producer checkpoints have passed strict next gates. Baseline spec/design/task documents and historical PASS objects remain unchanged.
