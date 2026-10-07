# T23 preflight and behavioral RED

Executor: Codex direct, Anti2 paused, one task at a time. T22 PASS commit977d077. Read spec sections5 and6, taskT23 and backend/database/contracts/testing rules. Keep approved design and product baseline.

First record unchanged gate, write a real compiled AppModule HTTP integration suite with isolated migrated PostgreSQL and actual signed auth sessions. Observe missing invitation/settings/grant routes as RED; do not mock production transport. Cover consent before admission, owner approval, current policy, direct ROOM vs PLAY_SESSION, capacity and cross-team races, pending state and retries, private access, helper permission boundaries, rollback and ownership.

Preflight finds prerequisite changes outside T23's current backend-only scope. Invitations have one status but no durable recipient-consent marker; OWNER_APPROVAL needs the persisted intermediate state. The frozen registry lacks GET room settings and task-required PUT grants. AppModule lacks InvitationsModule. Prepare a concrete proposal with exact owner tasks, files, migration compatibility and validation, then wait for authorization before those locked changes. Do not implement with in-memory consent, reinterpret ACCEPTED as pending approval, fake admission, or move to T24.
