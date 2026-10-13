from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone, timedelta
from copy import deepcopy
import json

root = Path.cwd().resolve()
assert root == Path('E:/FGweb/code').resolve()
folder = root / 'quality/evidence/CHATCRYPTO-BE'
result_path = folder / 'ban-producer-t37-decision.json'
assert not result_path.exists(), 'Preserve previous decision evidence.'
stamp = datetime.now(timezone(timedelta(hours=7))).isoformat(timespec='seconds')
history = root.parent / '.doc/history.md'
with history.open('a', encoding='utf-8', newline='\n') as handle:
    handle.write(f'\n- Coding and build 2 — CHATCRYPTO-BE — {stamp}: bắt đầu cập nhật quyết định trực tiếp của người dùng "để vào task 37". Chỉ ghi tài liệu/task/evidence và metadata BE; không triển khai ban producer, không mở T37 hoặc thay PASS. Lần đọc ledger ban đầu thiếu encoding UTF-8 thất bại, đã đọc lại UTF-8 đúng; không có mutation từ lần đọc lỗi.\n')

ledger_path = root / 'quality/tasks.json'
ledger = json.loads(ledger_path.read_text(encoding='utf-8'))
before = deepcopy(ledger)
tasks = {task['id']: task for task in ledger['tasks']}
assert tasks['CHATCRYPTO-BE']['status'] == 'IN_PROGRESS'
assert tasks['T37']['status'] == 'NOT_STARTED'
progress = json.loads((folder / 'progress-review.json').read_text(encoding='utf-8'))
def digest(path):
    return sha256(path.read_bytes()).hexdigest()
for name, expected in progress['sourceHashes'].items():
    assert digest(root / name) == expected, name

task_doc = root.parent / '.doc/task.md'
gate_doc = folder / 'ban-producer-gate-review.md'
before_doc_hashes = {str(path): digest(path) for path in [task_doc, gate_doc]}
text = task_doc.read_text(encoding='utf-8')
anchor = '### LOADING3D-CHANGE-01 — checkpoint mới LOADING3D-FE, duyệt09/10/2026'
assert text.count(anchor) == 1
decision = '''### CHATCRYPTO-BAN-T37-01 — quyết định thứ tự ngày10/10/2026

- Người dùng chốt "để vào task 37": producer ban/unban thuộc T37, không đưa vào prerequisite hay triển khai trong CHATCRYPTO-BE. Giữ thứ tự task hiện hành; T37 chưa bắt đầu.
- Bàn giao T37 dùng route/DTO đã có: PATCH /api/v1/admin/users/:id/ban, AdminUserActionRequestSchema. BAN phải atomic audit/revoke session/đổi private epoch/đóng intervals; UNBAN không phục hồi stale session hoặc quyền đọc khoảng bị ban. Repeated actions idempotent, giữ device/recovery ciphertext, broadcast revoke chỉ sau commit.
- T37 phải có native HTTP/auth/PG/socket và SDK-backed routing/history evidence; kiểm sole-admin/CSRF/latest authority, lock ordering, rollback khi lỗi/race và logout/ban/thu hồi quyền. Không dùng SQL fixture ban như bằng chứng producer đã tích hợp.
- Quyết định chỉ xác nhận nơi triển khai. Acceptance ban/unban producer/epoch của CHATCRYPTO-BE còn chưa đạt; không tự bỏ gate, sửa checker/baseline/dependency hoặc đánh PASS BE/T37 từ quyết định này. Evidence: code/quality/evidence/CHATCRYPTO-BE/ban-producer-t37-decision.json và ban-producer-gate-review.md.

'''
text = text.replace(anchor, decision + anchor)
anchor_t37 = '**Tạo cho task sau:** Report user/message; admin report list/resolve; delete message; ban/unban endpoints.'
assert text.count(anchor_t37) == 1
text = text.replace(anchor_t37, anchor_t37 + '\n\n**Bàn giao CHATCRYPTO-BAN-T37-01 (10/10/2026):** T37 sở hữu producer ban/unban và tích hợp crypto epoch/interval/session/socket theo mục quyết định ở trên; kiểm native atomic rollback/lock ordering/idempotency, không phục hồi session cũ hoặc lịch sử khoảng bị ban. Chưa có implementation/evidence producer; quyết định này không mở T37 trước tiền nhiệm PASS.')
task_doc.write_text(text, encoding='utf-8', newline='\n')
with gate_doc.open('a', encoding='utf-8', newline='\n') as handle:
    handle.write(f'\n## User resolution — {stamp}\n\nThe user chose "để vào task 37". Keep the actual ban/unban producer at T37; the proposed BE prerequisite above was not selected and is not authorized. The sequencing question is resolved. T37 remains NOT_STARTED and BE remains IN_PROGRESS; the producer/epoch acceptance remains unmet. No permission to waive that acceptance, change baselines/checkers, jump tasks or claim integration was given. The handoff requirements are recorded in .doc/task.md under CHATCRYPTO-BAN-T37-01 and T37. See ban-producer-t37-decision.json for metadata verification.\n')

owner = tasks['CHATCRYPTO-BE']
owner['banProducerDecision'] = {
    'recordedAt': stamp,
    'authority': 'Direct user message: để vào task 37',
    'implementationTask': 'T37',
    'implemented': False,
    'acceptanceSatisfied': False,
    'sequenceQuestionResolved': True,
    'gateWaived': False,
    'evidencePath': 'quality/evidence/CHATCRYPTO-BE/ban-producer-t37-decision.json',
}
for name in ['ban-producer-gate-review.md', 'ban-producer-t37-decision.json']:
    path = 'quality/evidence/CHATCRYPTO-BE/' + name
    if path not in owner['evidencePaths']:
        owner['evidencePaths'].append(path)
for old in before['tasks']:
    if old['id'] != 'CHATCRYPTO-BE':
        assert tasks[old['id']] == old, old['id']
old_owner = next(t for t in before['tasks'] if t['id'] == 'CHATCRYPTO-BE')
for field in old_owner:
    if field != 'evidencePaths':
        assert owner[field] == old_owner[field], field
for field in before:
    if field != 'tasks':
        assert ledger[field] == before[field], field
ledger_path.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
saved = json.loads(ledger_path.read_text(encoding='utf-8'))
assert saved == ledger
for name, expected in progress['sourceHashes'].items():
    assert digest(root / name) == expected, name
result = {
    'recordedAt': stamp, 'task': 'CHATCRYPTO-BE',
    'userDecision': 'để vào task 37', 'producerTask': 'T37',
    'sequenceQuestionResolved': True, 'producerImplemented': False,
    'acceptanceSatisfied': False, 'gateWaived': False,
    'backendStatus': owner['status'], 'producerTaskStatus': tasks['T37']['status'],
    'unchangedOtherTaskRows': len(before['tasks']) - 1,
    'unchangedHistoricalPassRows': sum(t['status'] == 'PASS' for t in before['tasks']),
    'unchangedCurrentAuditSourceHashes': len(progress['sourceHashes']),
    'beforeDocumentHashes': before_doc_hashes,
    'afterDocumentHashes': {str(path): digest(path) for path in [task_doc, gate_doc]},
    'ledgerSha256': digest(ledger_path),
    'runtimeOrTestsChanged': False, 'newRuntimeTestsRun': False,
}
result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps(result, ensure_ascii=True))
