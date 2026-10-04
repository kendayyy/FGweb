---
trigger: always_on
description: "Follow FG task.md sequentially without skipped tasks or false completion."
---

# FG — Thứ tự task
- Đọc bảng thứ tự chính xác trong .doc/task.md: có T16-FE, T17-BE, T17-FE; không suy ra thứ tự chỉ bằng số.
- Mỗi lần đúng một task; không chạy task/agent song song và không tự giao subagent.
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

