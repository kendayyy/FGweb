# FG Task T00 — Báo cáo Kiểm kê Phạm vi Thay đổi (Scope Inventory)

Ngày thực hiện: 04/10/2026.
Nhiệm vụ: TASK T00 ONLY.

## 1. Danh mục các tập tin thuộc pham vi cho phép (Write Scope Inventory)

### Tài liệu được phép chỉnh sửa:
1. `E:\FGweb\.doc\01-product-spec.md`
   - Mục đích: Cập nhật các câu chữ đề xuất thành các quyết định baseline chính thức đã được người dùng phê duyệt ngày 04/10/2026.
2. `E:\FGweb\.doc\task.md`
   - Mục đích: Cập nhật câu chữ đề xuất sang baseline đã chốt tại T00. Giữ nguyên toàn bộ 45 task, không tick ô hoàn thành task nào (tất cả checkbox giữ nguyên `- [ ]`).

### Tập tin chất lượng & bằng chứng được tạo mới:
3. `E:\FGweb\code\quality\spec-baseline.json`
   - Mục đích: Lưu trữ toàn bộ thông số baseline đã chốt, ngày/lời phê duyệt của người dùng, cổng vận hành trì hoãn và các mã băm SHA-256 của tài liệu/mockup.
4. `E:\FGweb\code\quality\evidence\T00\verification.log`
   - Mục đích: Ghi lại lệnh kiểm tra, kết quả thực thi, exit code, timestamp và git HEAD.
5. `E:\FGweb\code\quality\evidence\T00\consistency-review.md`
   - Mục đích: Báo cáo đối chiếu sự nhất quán giữa spec, frontend design, task plan và hai ảnh mockup.
6. `E:\FGweb\code\quality\evidence\T00\scope-inventory.md`
   - Mục đích: Tập tin này (báo cáo kiểm kê phạm vi).
7. `E:\FGweb\code\quality\evidence\T00\unresolved-gates.md`
   - Mục đích: Báo cáo ghi nhận các cổng chuẩn bị và cổng vận hành trì hoãn trong tương lai.

## 2. Cam kết và Xác minh Ranh giới (Boundary Verification)

- **Không tạo/sửa tập tin ngoài phạm vi:** Không sửa bất kỳ tập tin nguồn code, package.json, lockfile, scripts, docker compose, rules (.agents/rules/), tài liệu thiết kế (02-frontend-design.md), hoặc hình ảnh mockup nào.
- **Không cập nhật sổ cái (Ledger):** Không sửa `code/quality/tasks.json` hay `spec-coverage.md`.
- **Không thực thi T01:** Không thực hiện `npm install`, không cài đặt dependency, không scaffold dự án.
- **Không thực hiện Git Commit:** Giữ làm thay đổi làm việc (working tree changes) để Codex review và đánh giá PASS.
