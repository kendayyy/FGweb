# CHATCRYPTO-BE — expired encrypted drafts

This session resumes the same IN_PROGRESS owner. No main migration, AppModule
activation, contracts change or later task was performed.

- `cleanup-red-1` failed in fixture setup: device B was already revoked by the
  preceding sender-FK test. This is not a behavioral RED. A new native signed
  CLEAN device fixes the setup; no revoked device is resurrected.
- `cleanup-red-2` passed 27 existing cases and failed both new cleanup cases
  because the cleanup operation did not exist.
- `cleanup-green-1` passed 33/33 actual API/PG/WASM/filesystem cases.
- `cleanup-bounds-1` passed 30/30 integration cases including 101 real files:
  one sweep removes exactly 100 expired drafts; the second removes the remainder.

The periodic sweep holds draft row locks, skips rows already locked by a claim
or another instance, and excludes consumed message/report objects. It deletes
bytes before metadata. Missing bytes are retryable success; other filesystem
errors roll back metadata. A later retry also handles bytes removed before a
failed DB commit. Shutdown clears the periodic timer and awaits its active sweep.
Warnings contain no IDs, ciphertext, user filenames or raw filesystem errors.

Tests cover retained live/consumed objects, missing files, filesystem failure
using a directory in place of a file, real PG row-lock contention and bounded
batches. These are backend tests; no headed UI claim is made.

Remaining cleanup coverage: crash-created orphan objects without metadata,
protocol queue retention/dedup rules, report retention, and timer shutdown under
failure. This change does not claim all cleanup/rate/security acceptance.

Realtime prerequisite found during review: shared `SocketEventSchemaMap` maps
`message.created` to the legacy MessageSchema and has no encrypted-message or
device-bound subscription event. The gateway currently only hydrates legacy
messages. Resolve this in a contracts owner with RED tests and reviewed output
adoption before integrating encrypted delivery; do not send ciphertext through
the legacy event schema or invent a backend-only DTO/event name. The contract
files and historical DATA PASS remain unchanged in this session.

Backend completion still requires private realtime/notifications, Lobby/report
Transit integration and custody, legacy reconciliation/restore, the moderation
ban epoch producer, quotas and the remaining cleanup/security review.
