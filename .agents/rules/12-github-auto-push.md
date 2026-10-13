---
trigger: always_on
description: "Automatically commit and push each legitimately completed FG task to public GitHub with privacy review and verified remote SHA."
---

# FG — Tự động push khi hoàn tất task

- GITHUB-AUTO-PUSH-01, người dùng chỉ định ngày13/10/2026: tự commit/push sau
  mỗi task hoàn tất hợp lệ. Quyền thường trực, không hỏi lại cho từng lần.
- Đích: repo PUBLIC https://github.com/kendayyy/FGweb, remote origin,
  nhánh master. Kiểm remote/branch thực trước push; không tự đổi đích.
- Chỉ chạy bước hoàn tất khi acceptance/tests/review/checker hiện hành đã đạt,
  ledger và evidence/history khớp. Không biến IN_PROGRESS/FAILED/BLOCKED hay
  một lượt build/test thành task hoàn tất; không tự sửa PASS/gate.
- Stage rõ từng path của task đã chốt và tài liệu/evidence liên quan. Đọc
  staged diff; không dùng git add --all khi workspace có task khác đang chạy,
  runtime đổi liên tục hoặc thay đổi chưa review. Giữ thay đổi ngoài scope.
- Quét staged content để tìm credentials và kiểm cảnh báo thực; lần đầu hoặc
  có commit local chưa review thì kiểm cả các commit sắp push. Nếu công cụ
  unavailable hoặc còn cảnh báo chưa phân loại thì báo thiếu kiểm privacy,
  không đẩy nội dung chưa kiểm lên public. Không in secret vào output.
- Không commit .env.local, secrets/token/password/private keys, dữ liệu cá
  nhân hoặc runtime. Giữ .env.example để deploy. Giữ exclusions hiện hành,
  kể cả3log T26 containers-sanitized.txt có temporaryICE credentials.
- Không sửa frozen evidence để che secrets hoặc làm lệch hash/checker.
  Loại tệp riêng tư khỏi bản public, giữ original local và ghi lý do nếu cần.
- Commit có task ID và mô tả ngắn, ví dụ: "T31: complete reviewed task".
  Push origin/master thông thường; không force-push/reset/rebase phá lịch sử.
- Khi push bị từ chối, fetch/đối chiếu trước; chỉ tích hợp thay đổi remote
  được review trong scope. Không ghi đè thay đổi của người khác. Retry lỗi
  mạng/auth có thể xử lý an toàn; còn blocker thì báo rõ.
- Lưu commands/time/exit và commit SHA trong evidence thuộc code/. Báo
  push success chỉ sau exit0 và remote branch SHA khớp commit local. Nếu HEAD
  đổi do phiên khác, xác minh commit vừa push thực nằm trong remote history.
- History ghi kết quả push đã xác minh trước bàn giao. Nếu cần commit bổ
  sung history thì push tiếp và xác minh, không tạo vòng commit vô hạn chỉ
  để ghi chính commit bổ sung. Tách task acceptance và trạng thái Git sync.
- Bàn giao nêu task/trạng thái, repo/commit đã sync hoặc blocker push thật.
  Push không cấp quyền deploy production, nới gate hay mở task kế tiếp.
