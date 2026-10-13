# FG — Hướng dẫn trong thư mục code

Đây là vùng duy nhất được viết mã nguồn, cấu hình ứng dụng, migrations, tests, scripts và artifacts triển khai.

- Workspace nên mở E:/FGweb; shell ở E:/FGweb/code.
- Đọc ../.doc/01-product-spec.md, ../.doc/02-frontend-design.md và ../.doc/task.md trước task/resume.
- HISTORY-CHANGE-01: đọc ../.doc/history.md và ../.agents/rules/11-session-history.md; ghi mỗi phiên coding/build/sửa/test khi bắt đầu, cập nhật tiến độ và kết thúc/blocker trước bàn giao. Dùng mẫu history, kết quả/exit code/evidence thật; giữ mục cũ, không secrets. Đây là tài liệu, không thay ledger/PASS; runtime logs/artifacts vẫn ở code/.
- Đọc ../.agents/rules/00-project-context.md, 01-workspace-boundaries.md, 02-task-sequence.md, 03-dependencies-and-services.md, 08-testing-and-evidence.md; đọc các rule frontend/backend/database/contracts/media/ops tương ứng trước khi sửa phần đó.
- Nếu mở code/ riêng, vẫn phải đọc những file ở thư mục cha này; nếu môi trường không cho đọc thì mở lại toàn E:/FGweb, không tự build khi thiếu spec/rules.
- apps/web: frontend; apps/api: backend API/realtime; apps/worker: jobs.
- packages/database: schema/migrations/query; packages/contracts: DTO/schemas/events.
- infra: deploy; tests: e2e/load; quality: ledger/evidence; .runtime/.cache: artifacts local.
- Task order chính xác theo task.md gồm cả T16-FE/T17-BE/T17-FE; một task mỗi lần.
- Không tạo source tại root E:/FGweb hoặc .doc; không bỏ tests hay giả PASS.
- File này đã được chuẩn bị trước build. T02 đọc và duy trì, không overwrite để xóa các ràng buộc.

## TEST-VISIBILITY-01 — yêu cầu người dùng ngày07/10/2026
- Người dùng điều chỉnh: chỉ UI tương tác trên ứng dụng và E2E local mở cửa sổ browser/app để quan sát, không cần hiện terminal/log.
- UI/E2E dùng headed; `npm run test:e2e -- --headed` cho full suite, hoặc thêm `--headed` vào lệnh test cụ thể. Unit/component DOM giả lập, integration/API/DB/smoke/load được chạy nền, không cần browser.
- Lưu log/time/exit code/hashes/evidence như hiện tại, không lộ secrets. Với UI/E2E không có GUI/công cụ không mở được cửa sổ, báo trước và ghi hạn chế; không âm thầm tính headless là đạt quan sát trực tiếp.
- Cho phép mở browser/app nhìn thấy được phục vụ test UI/E2E theo yêu cầu này; terminal/helper khác không cần hiện. Không bật watch vô hạn hoặc nhiều task song song.
