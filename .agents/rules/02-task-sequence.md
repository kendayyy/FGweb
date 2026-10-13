---
trigger: always_on
description: "Follow FG task.md sequentially without skipped tasks or false completion."
---

# FG — Thứ tự task
- Đọc bảng thứ tự chính xác trong .doc/task.md: có T16-FE, T17-BE, T17-FE; không suy ra thứ tự chỉ bằng số.
- Mỗi lần đúng một task; không chạy task/agent song song và không tự giao subagent.
- FEED-CHANGE-01 đã duyệt07/10/2026: T38 → T38-FEED-DATA → T38-FEED-BE → T38-FEED-FE → T39. Giữ các task FIX trong ledger; thay baseline theo review/evidence, không tự chỉnh trạng thái PASS.
- Bắt đầu task đầu tiên chưa PASS. FAILED/BLOCKED phải xử lý trước khi chuyển tiếp.
- T00 khóa phần yêu cầu còn mở; T01 dependencies; T02 APIs/smoke; sau đó mới logic nghiệp vụ.
- Khi checker đã có, chạy npm run task:check -- <ID> trước task. T00–T02 dùng checklist/evidence thủ công.
- Đọc phạm vi files, interfaces, tests của task. Không làm tính năng task sau trong task hiện tại.
- Thiếu credential, prerequisite hoặc bằng chứng: báo blocker rõ, không thay dịch vụ/tính năng bằng success giả.
- Không tick PASS vì file tồn tại, UI đẹp hoặc model nói xong.
- Lưu command, exit code, timestamp và hashes ở code/quality/evidence/<ID>/; cập nhật code/quality/tasks.json.
- Spec hash đổi: kiểm yêu cầu mới và cập nhật plan/tests tương ứng; không sửa checker/baseline để vượt gate.
- Resume phải kiểm files/tests/ledger thật, không tin recap phiên trước.
- Báo cuối task: ID, trạng thái, files, kiểm thử, evidence, blocker và task kế tiếp.
- GITHUB-AUTO-PUSH-01 (13/10/2026): task hoàn tất qua gate hiện hành phải tự commit/push origin/master (repo PUBLIC kendayyy/FGweb) theo rule12 trước bàn giao; quyền user đã cấp, không hỏi lại. Chỉ stage scope đã chốt, kiểm secrets, xác minh remote SHA, ghi evidence/history và báo lỗi đồng bộ thật; không đổi PASS hoặc deploy production vì push.
- Người dùng xác nhận ngày06/10/2026: FG bỏ giới hạn hai vòng Antigravity sửa cùng một lỗi. Tiếp tục các vòng review/refactor trong cùng task, cùng Gemini3.6 Flash (High), đến khi kiểm thử và Codex review đạt hoặc có blocker thực sự; các giới hạn phạm vi/thứ tự/bằng chứng vẫn giữ nguyên.
- NO-ANTI2-01 (11/10/2026, phân công cũ đã được CODEX-ONLY-01 thay thế): giữ evidence Anti2 cũ, không yêu cầu quan sát Anti2 mới. Không thay acceptance hay quyền báo ảnh UI Telegram đã có.
- CODEX-ONLY-01 (12/10/2026): toàn bộ task FG chỉ dùng Codex trực tiếp triển khai/review/áp dụng/kiểm thử/chốt; tắt hoàn toàn việc dùng skill/dashboard/monitor Anti2, không gọi hoặc giao việc cho Antigravity. Phân công và yêu cầu Gemini cũ không còn áp dụng. Không tự bật/khởi động lại/phục hồi cockpit-tools; chỉ mở khi có chỉ định mới rõ ràng. Giữ một task mỗi lần và toàn bộ gate/scope/acceptance/headed/Telegram/evidence; giữ lịch sử đã đóng và dùng driver mới không gọi các công cụ bị cấm.
