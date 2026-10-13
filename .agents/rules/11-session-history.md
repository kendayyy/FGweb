---
trigger: always_on
description: "Record every FG coding, build, fix and testing session in .doc/history.md with real outcomes and evidence links."
---

# FG — Nhật ký phiên bắt buộc (HISTORY-CHANGE-01)
- HISTORY-CODING2-01 (09/10/2026): áp dụng rõ cho chat Coding and build 2. Mỗi phiên tạo mục .doc/history.md với tên chat + task ID; ghi bắt đầu/kết thúc, vòng sửa/build/test/review, files/commands/results/exit/evidence/blocker. Trước báo xong/bàn giao phải đối chiếu và trỏ mục history; thiếu mục không đạt tiêu chí bàn giao. Không tự backfill phiên cũ nếu chưa có evidence, không tự động hóa hoặc sửa checker trong lần ghi rule.
- Đọc .doc/history.md trước coding/build hoặc resume, đối chiếu files/task/evidence thật.
- Mỗi phiên coding/build/sửa lỗi/refactor/migration/cấu hình/test: tạo mục khi bắt đầu, cập nhật sau vòng sửa/test/review đáng kể, ghi kết thúc/trạng thái/blocker trước bàn giao. Kể cả thất bại/chưa xong; phiên bị ngắt được ghi khi resume.
- Theo mẫu trong history: thời gian UTC+07:00, agent/task/mục tiêu, vấn đề/nguyên nhân, thay đổi/files, command/kết quả/exit code thực, evidence trong code/, blocker/việc tiếp theo. Không bịa hoặc backfill kết quả cũ.
- Hoàn thiện mục đang mở; không xóa/ghi đè phiên cũ đã kết thúc, đính chính bằng mục mới. History không thay ledger/evidence hoặc quyền review PASS.
- .doc/history.md là tài liệu tóm tắt được phép cập nhật trong từng task; không là nơi code/raw logs/runtime artifacts. Logs/ảnh/trace/hash thực vẫn ở code/.
- Không đưa password/hash/token/SMTP keys/email riêng hoặc dữ liệu hỗ trợ riêng tư vào history. Commands phải che secrets; không giả exit code, headed hoặc success.
- History là yêu cầu tài liệu xuyên task, không cho phép mở task song song/skip hoặc nới checker. Nếu writeAllowlist/checker chặn cập nhật tài liệu thì báo blocker phạm vi và yêu cầu review rebaseline, không sửa checker để vượt gate.
