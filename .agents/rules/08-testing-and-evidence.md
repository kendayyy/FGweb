---
trigger: always_on
description: "FG requires real tests and evidence before each task passes."
---

# FG — Kiểm thử và bằng chứng
- Task code nghiệp vụ: RED vì hành vi thiếu → implementation tối thiểu → PASS.
- Test phù hợp change và acceptance của task; không viết test chỉ mirror implementation.
- Chạy tests task, lint/typecheck workspace thay đổi; full regression tại T39/release hoặc khi thay đổi có ảnh hưởng rộng.
- DB tests dùng PostgreSQL thật; E2E dùng API/DB thật; SDK mocks không thay media integration.
- Các race bắt buộc:2đội duyệt cùng user, tranh last slot, người thứ11 vào gọi, publisher thứ4.
- Các privacy checks: guest/private chat/image/WS/call, member bị revoke, banned session, helper sai quyền.
- Reconnect/webhook trùng/mất/đến muộn phải không tạo ghost seats hoặc đóng nhầm call.
- Không skip/only/comment-out test, hạ assertion hoặc sửa snapshot để làm xanh.
- Evidence command+exitCode+time+file hashes+spec hash ở code/quality/evidence/<ID>/; không chứa secret.
- Lưu requirement→task→test→evidence ở spec-coverage.md.
- Test chưa chạy/thiếu device/credential/load budget: ghi rõ chưa xác minh, không đánh PASS.
- Report kết quả thực tế; không bịa số tests, benchmark hoặc chi phí.

