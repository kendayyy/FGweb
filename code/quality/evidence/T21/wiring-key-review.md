# T21 native review repair

The first two real-browser executions exposed duplicate filter controls after guest-to-auth hydration. RecruitmentPanel and OnlineUsers were siblings with the same React key, leaving a stale guest panel in the DOM. The approved replacement now prefixes its key with recruitment: while preserving game/actor/sign-out resets. This changes only the newly approved component wiring, not OnlineUsers or the existing layout. Original proposed bytes and failed evidence are preserved. Native probe now requires exactly one recruitment panel after authentication.
