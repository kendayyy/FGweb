# T02-FIX3 setup review

Approved architecture: Matrix WASM 18.6.0 + OpenBao 2.7.1 self-hosted.
No new product scope, cloud purchase, production publication or main migration.

Verified native SDK, without crypto mocks: independent devices, actual Olm
key uploads/claims and encrypted to-device messages, SAS exchange/comparison/
confirmation, Megolm roundtrip, ciphertext corruption and cross-room denial,
unverified-device exclusion, new-member old-history denial, session rotation
after removal, wrong recovery denial, encrypted SDK key-export recovery to
a new device identity. Relay is an in-memory setup test adapter only.
The third test device uses explicit out-of-band fixture key comparison;
the first pair completes actual SAS. Imported history decryption is tested
separately from identity trust; production warning/trust policy remains FE.

Headed Chromium exercised actual browser WASM/Vite production build and
native passphrase-protected IndexedDB for two devices. Reload preserves
identities. Screenshot/result are evidence of setup, not a working FG UI.

OpenBao native TLS/Raft service checks: trusted CA works, untrusted TLS fails,
AES256GCM randomized encryption/decryption, tamper rejection, application
cannot configure/rotate/export or access report data, operator rotates/
rewraps but cannot decrypt, revoked AppRole secret cannot log in, seal and
outage deny operations, restart/unseal preserves old ciphertext, HMAC audit
log contains no test payload, base64 payload, root/app/operator tokens or
unseal/secret ID. Unique container and TLS/key storage fixtures are removed.
Only public configuration and redacted results/logs remain.

Failures retained: probe syntax; initial transport/readiness; Raft standby
health before leader; documented key create/rotate return 200 with key data,
not assumed 204; dynamic audit creation is disabled, so declarative audit
configuration is used without enabling the unsafe option. Matrix vector
arguments consume WASM UserId wrappers: creating fresh wrappers for each
call fixed borrowed-value cleanup. No assertion was removed to hide a
security failure. Additional report-decrypt and operator-decrypt denial
checks were added in transit-9.

Limits: no FG API/UI integration, end-user recovery flow, production operator
key custody/backup, physical mobile tests, performance or total E2EE claim.
Local root container/disabled mlock/test certificate are explicit setup
choices. Application logic starts only after manual setup review PASS.
