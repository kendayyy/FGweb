from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import json

root = Path.cwd().resolve()
assert root == Path('E:/FGweb/code').resolve()
folder = root / 'quality/evidence/CHATCRYPTO-BE'
progress = json.loads((folder / 'progress-review.json').read_text(encoding='utf-8'))
files = [
    'apps/api/src/modules/chat/chat.exception-filter.ts',
    'apps/api/src/modules/chat-crypto/openbao-transit.ts',
    'apps/api/src/modules/chat-crypto/crypto-custody.module.ts',
    'apps/api/src/modules/chat-crypto/lobby-cipher.ts',
    'apps/api/src/modules/chat-crypto/crypto-sweep-loop.ts',
    'apps/api/src/modules/chat-crypto/crypto-relay.service.ts',
    'apps/api/src/modules/chat-crypto/crypto-reports.service.ts',
    'apps/api/src/modules/chat-crypto/crypto-reports.controller.ts',
    'apps/api/src/modules/realtime/realtime.gateway.ts',
    'apps/worker/src/private-push-configuration.ts',
    'apps/worker/src/private-push-dispatcher.ts',
    'apps/worker/src/private-push-worker.ts',
]
hashes = {name: sha256((root / name).read_bytes()).hexdigest() for name in files}
covered = {name: digest for name, digest in hashes.items() if name in progress['sourceHashes']}
assert covered
for name, digest in covered.items():
    assert progress['sourceHashes'][name] == digest, name
result = {
    'recordedAt': datetime.now(timezone.utc).isoformat(),
    'task': 'CHATCRYPTO-BE',
    'kind': 'read-only source review provenance; not a behavioral test',
    'sourceHashes': hashes,
    'matchedCurrentAuditPaths': list(covered),
    'currentAuditSha256': sha256((folder / 'progress-review.json').read_bytes()).hexdigest(),
    'runtimeChanged': False,
    'fullSecurityPassClaimed': False,
    'banSequenceDecision': 'pending user response',
}
target = folder / 'security-log-boundaries-review.json'
assert not target.exists(), 'Preserve the existing review; use a new label.'
target.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps(result))
