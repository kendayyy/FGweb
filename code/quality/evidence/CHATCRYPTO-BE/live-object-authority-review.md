# LIVE object authority review

RED1 completed2026-10-09T10:26:56.895Z,4/5, actual object read followed by real PG BAN returned200 instead of403. SHA256e5066f39925a61496f707d4c102d4c6b254659a98d4b0cbf624f71aa5651261d.

GREEN1 completed2026-10-09T10:29:29.746Z,5/5, SHA256a1c390a97701dfbc53ece8e16e5ff93a26800bc7cabc313ad48b11230dee509d. CryptoRelay LIVE read rechecks actor/session clock/current state, current interval and fresh draft metadata after actual object I/O on the same transaction client. Binding fields/hash/size/object/session/epoch associations must remain unchanged. Unconsumed draft owner/current epoch/expiry/device rechecked. Rejected buffer zeroed; existing403 integrity contract preserved. Imported cohort reader remains separate and unchanged.

Boundary2 completed2026-10-09T10:33:47.234Z,5/5, SHA256203f8a737d9815908298470164b6b0170597e177da452403938595fc0a5995c0. Real committed BAN, interval exclusion and digest metadata changes after underlying filesystem read each return403 and zero the captured buffer. Boundary1 retained failure: fixture assumed revision1; corrected to actual captured message revision+1. Persisted encrypted backup/readback and single-transaction pg_dump/psql restore preserve original source, DB plaintext guards, actual AppModule/private SDK message+image/lost-key/outsider/public Lobby/selected report ACLs. Full native TLS role separation/backup-key rotation/rewrap/restart/seal/outage/audit flags and cleanup true, productionReady=false.

No main schema/environment/source cleanup, new endpoint, contract or stock checker changes. Integrated build/lint/regression/audit pending; task IN_PROGRESS. Production/off-machine activation and other BE acceptance remain unfinished.


Integrated custody-backup-authority-regression-1 completed2026-10-09T10:45:17.131Z exit0,259/259/17suites,403.018s Jest, SHA2560da2ec5e2c851176686558f11e3b4de91a759ba3e81b388f54b907bf1727bd43. Source build1/lint45 exit0; native full Transit flags/backupKeySeparation/ownedBackupRestore/cleanup=true and productionReady=false. Immutable audit/checkpoint26 pending, BE remains IN_PROGRESS.
