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

## TEST-VISIBILITY-01 — quan sát trực tiếp, xác nhận07/10/2026
- Mỗi test run local (kể cả RED, regression, smoke và load) phải hiện cửa sổ terminal/task, tiêu đề hoặc dòng đầu có task ID/lệnh; stdout/stderr cập nhật trực tiếp, không chỉ đọc file log khi xong.
- Với UI/E2E, mở browser headed để người dùng thấy thao tác; thêm `--headed` vào Playwright CLI. Terminal vẫn hiển thị log. Không tự chạy lại tests chỉ để quay màn hình sau khi đã chạy ẩn.
- Giữ terminal/kết quả sau khi hoàn tất và hiện exit code thật. Lưu evidence cùng lần chạy; pipeline ghi log phải bảo toàn exit code của test, không lấy exit code Tee-Object/logger thay cho test.
- Nếu launch helper qua Start-Process để hiện test window, dùng cửa sổ Visible/Normal theo yêu cầu này; thư mục chạy E:/FGweb/code, scripts/logs/artifacts chỉ trong code/. Không áp dụng quyền mở cửa sổ cho helpers không liên quan.
- Không mở được GUI/cửa sổ, chạy CI hoặc host remote không GUI: báo rõ trước run, vẫn ghi kết quả kỹ thuật thật và hạn chế quan sát. Không âm thầm đánh tiêu chí quan sát local đạt nhờ headless/trace/video.
- Không tự bật watch mode vô hạn, slow-motion làm đổi timeout, giảm tests hoặc task song song. Thiếu quan sát trực tiếp phải ghi rõ trong review/evidence, không giả PASS tiêu chí này.

