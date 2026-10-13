# OpenBao local setup

Locked OpenBao 2.7.1 and registry digest are recorded in openbao-image.json.
openbao.hcl is the actual configuration exercised by the isolated TLS smoke
test. It uses Raft storage and declarative HMAC audit logging. No dev mode,
plaintext listener, default root token, convergent encryption or exported
Transit keys are enabled.

The local compose profile is optional and **not a production deployment**.
Its root container user and disabled mlock are isolated Windows/Docker setup
choices. Production provisioning, restricted OS identity, locked memory,
certificates, operators, availability and off-machine key custody require
the deployment/operations checkpoint; this setup does not claim those pass.

Run setup checks from E:/FGweb/code using the T02-FIX3 recorder. transit-smoke.mjs
creates a unique local-only container, TLS certificate, Raft directory and
short-lived AppRole credentials. It holds the initial root token/unseal key
only in process memory, uses distinct application and rotation policies,
checks both allowed and denied operations, then removes the exact labeled
container and owned fixture directory. Main .env.local/database are untouched.

For an operator-managed local instance, FG_BAO_LOCAL_DIR must resolve below
code/.runtime/chatcrypto-setup and contain server.hcl, server.crt, server.key
and data/. FG_BAO_LOCAL_PORT defaults to 18200 on loopback only. Do not put
credentials or keys in this tracked directory or command arguments. Do not
enable a running main-app profile until its backend integration is reviewed.

The Lobby application role only encrypts/decrypts fg-lobby. It cannot rotate,
export, configure keys or access fg-report. A separate operator can rotate
and rewrap without decrypting. Never route private E2EE keys through OpenBao.
DB/object/backup copies must not include OpenBao storage, TLS private keys,
root tokens, unseal shares or private client recovery material. Actual
off-machine custody/backup evidence is still required in the relevant tasks.

Official references: https://openbao.org/docs/configuration/audit/ and
https://openbao.org/docs/secrets/transit/ .

## Actual application custody providers

AppModule imports CryptoCustodyModule and ChatCryptoModule; RealtimeModule imports the same crypto module. Main schema/state activation remains a separately reviewed operation; registration does not migrate or delete sources.

The server accepts FG_BAO_ADDRESS (HTTPS origin), FG_BAO_CA_FILE (absolute public CA PEM path), FG_BAO_LOBBY_TOKEN_FILE, FG_BAO_REPORT_WRITER_TOKEN_FILE and FG_BAO_REPORT_READER_TOKEN_FILE (absolute regular token-agent sink paths). Each file is read with bounded handle/path identity checks at every operation. Supply FG_REPORT_RETENTION_SECONDS explicitly for the writer (1..2147483647). Missing role config makes its encrypted route unavailable; invalid configured address/CA/retention fails closed. Never store credential values in the repo, DB, object roots, backup or command arguments; use a separately managed short-lived token agent and atomic regular-file replacement. This implementation does not provision or renew credentials itself.

Canonical token policies are fg-lobby-app, fg-report-writer and fg-report-reader, each with read on auth/token/lookup-self. The application validates its exact role plus optional default policy through trusted TLS before Transit. Root, operator, combined/wrong-role and expired credentials are rejected; report writer cannot decrypt and reader cannot write. Keep existing Transit grants minimal and preserve denied key-management/export/other-key operations. No private E2EE keys or recovery codes pass through custody providers.

Native custody-config tests use actual AppModule/HTTP/PG/OpenBao TLS and temporary role files outside DB/object roots; owner fixture root file is only a negative root-denial test and is removed with the exact labeled fixture. Native proof is not production provisioning, off-machine custody or backup restore acceptance.

Crypto services read required-table metadata at boot. Missing or incomplete crypto migrations leave their APIs503 and disable relay/report object initialization/sweeps/protocol dispatch; bootstrap does not create or repair tables or delete files. Run the reviewed migration/constraint/data gate and restart before activation. This presence guard does not replace deployment schema review. Configured Lobby custody remains a separate consumer; unconfigured main app has no custody fallback.
