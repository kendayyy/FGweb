| Task | Executor | Requested model | Mode | Scope | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| T16-FE | Antigravity | Gemini 3.6 Flash (High) | Fresh, sequential | presence feature,OnlineUsers,presence tests;minimal existing LobbyPage mount;own evidence | T16 PASS54f93fb | Active after gate |

The task explicitly requires mounting the online panel into the existing Lobby. Minimal LobbyPage import/placeholder replacement is necessary wiring for that authorized task, not new feature scope. All its existing chat/header/navigation behavior and all other predecessor files remain frozen. New status UI lives inside the owned online/presence component, using approved tokens/Inter/layout. No contracts/database/backend changes.

T16 independent proof:25 task tests,89 API regression,6 compiled native PG/Redis/two-instance checks. T16-FE closes only after independent frontend review/real built-web integration/four viewport screenshots and hashes. Never infer media capacity from chat/presence smoke.
