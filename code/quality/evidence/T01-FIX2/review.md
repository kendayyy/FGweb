# T01-FIX2 — Gateway setup review

The API now directly declares ws 8.21.3 and @types/ws 8.18.2. These were already installed in the workspace; the lock test preserves every existing dependency's version, resolved URL and integrity. A real binary WebSocket exchange and normal close passed. The original RED demonstrates missing direct dependency declarations.

An owned native LiveKit v1.8.4 container, using the existing pinned image digest, served health traffic from a second container on its Docker network. Inspection found no host signaling port binding. Both disposable containers and the owned network were removed. The checked compose file keeps signaling private; it is a setup topology, not the application's active deployment.

No application logic, credential value, existing service configuration, contracts or database files changed. The locally generated secret configuration remains ignored under .runtime/. T26 still owns the admission gateway, authorization, rollback/revocation, native replay rejection and actual WebRTC verification. This checkpoint provides no media, audio quality or 1,000-user load claim.

Closure audits frozen inputs, historic PASS records, eight baseline files, local configuration digest, command exit codes and output digests before checking the next contracts gate with the unchanged checker. The dependency setup RED is retained; it is resolved by the setup GREEN, not hidden or reclassified as success.
