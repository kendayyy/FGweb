# FG — Hướng dẫn trong thư mục code

Đây là vùng duy nhất được viết mã nguồn, cấu hình ứng dụng, migrations, tests, scripts và artifacts triển khai.

- Workspace nên mở E:/FGweb; shell ở E:/FGweb/code.
- Đọc ../.doc/01-product-spec.md, ../.doc/02-frontend-design.md và ../.doc/task.md trước task/resume.
- Đọc ../.agents/rules/00-project-context.md, 01-workspace-boundaries.md, 02-task-sequence.md, 03-dependencies-and-services.md, 08-testing-and-evidence.md; đọc các rule frontend/backend/database/contracts/media/ops tương ứng trước khi sửa phần đó.
- Nếu mở code/ riêng, vẫn phải đọc những file ở thư mục cha này; nếu môi trường không cho đọc thì mở lại toàn E:/FGweb, không tự build khi thiếu spec/rules.
- apps/web: frontend; apps/api: backend API/realtime; apps/worker: jobs.
- packages/database: schema/migrations/query; packages/contracts: DTO/schemas/events.
- infra: deploy; tests: e2e/load; quality: ledger/evidence; .runtime/.cache: artifacts local.
- Task order chính xác theo task.md gồm cả T16-FE/T17-BE/T17-FE; một task mỗi lần.
- Không tạo source tại root E:/FGweb hoặc .doc; không bỏ tests hay giả PASS.
- File này đã được chuẩn bị trước build. T02 đọc và duy trì, không overwrite để xóa các ràng buộc.

## TEST-VISIBILITY-01 — yêu cầu người dùng ngày07/10/2026
- Tất cả kiểm thử local chạy với cửa sổ terminal/task hiện cho người dùng, log stdout/stderr cập nhật trực tiếp và giữ kết quả/exit code sau khi xong. Không chỉ chạy ẩn rồi đưa summary.
- UI/E2E dùng trình duyệt headed; `npm run test:e2e -- --headed` cho full suite, hoặc thêm `--headed` vào lệnh test cụ thể. Unit/integration/API/DB/load hiển thị terminal thật; không cần cửa sổ browser giả.
- Lưu log/time/exit code/hashes như hiện tại, không lộ secrets; kiểm stdout realtime không thay bằng chứng test. Không GUI/CI phải báo rõ hạn chế; không âm thầm thay bằng headless cho local.
- Đây là yêu cầu hiển thị cửa sổ tương tác do người dùng chỉ định, cho phép mở terminal/browser nhìn thấy được phục vụ test. Không bật watch vô hạn hoặc nhiều task song song.

