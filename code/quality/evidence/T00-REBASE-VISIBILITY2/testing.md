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
- Người dùng điều chỉnh cùng ngày: chỉ UI tương tác trên app và E2E local cần cửa sổ browser/app hiển thị thao tác thật (headed), gồm các vòng RED/sửa lỗi/regression thuộc loại này; thêm `--headed` vào Playwright CLI.
- Không cần hiện terminal hoặc log, kể cả khi chạy UI/E2E. Unit/component test DOM giả lập, integration/API/DB/smoke/load được chạy nền, không cần dựng browser/cửa sổ giả.
- Mọi run vẫn lưu evidence command/time/exit code/logs/hashes thật. Pipeline log bảo toàn exit code test, không lấy exit code Tee-Object/logger thay test. Không chạy lại chỉ để quay hình sau khi đã chạy ẩn.
- Chỉ cửa sổ browser/app phục vụ UI/E2E được yêu cầu hiện. Nếu dùng Start-Process cho terminal/helper, vẫn dùng Hidden; cwd E:/FGweb/code, scripts/logs/artifacts trong code/.
- UI/E2E không mở được GUI/cửa sổ, CI hoặc host không GUI: báo rõ trước run, ghi kết quả thật và hạn chế quan sát; không coi headless/trace/video là đã đạt quan sát trực tiếp local. Các tests khác chạy nền không vi phạm tiêu chí này.
- Không tự bật watch vô hạn, slow-motion làm đổi timeout, giảm tests hoặc chạy task song song. Thiếu quan sát UI/E2E phải ghi rõ trong review/evidence, không giả PASS tiêu chí này.

