# FG Task T00 — Báo cáo kiểm tra sự nhất quán (Consistency Review - Updated)

Ngày cập nhật: 04/10/2026.
Phạm vi: Đối chiếu `01-product-spec.md`, `02-frontend-design.md`, `task.md` và hai ảnh mockup (`01-lobby-desktop-mobile.png`, `02-group-call-live.png`) sau đợt rà soát refactor.

## 1. Xác nhận phê duyệt của người dùng & Nguyên tắc Chi phí
- Nguồn phê duyệt: Người dùng đã chốt toàn bộ gói đề xuất mặc định T00 với câu "tôi chốt" vào ngày 04/10/2026.
- Tên website chính thức: **FG** (giữ nguyên).
- Giao diện & Layout: Hai mockup đính kèm (`01-lobby-desktop-mobile.png` và `02-group-call-live.png`) là baseline chuẩn về màu sắc, typography (Inter) và bố cục.
- Nguyên tắc chi phí: Không bổ sung dịch vụ trả phí nếu chưa được người dùng chọn; người dùng chốt trần chi phí trước khi chạy paid tests hoặc chi tiêu vận hành, dự toán ở T41 (không cấm việc mua staging độc lập nếu được người dùng cho phép sau này).

## 2. Kết quả đối chiếu & Các điểm hiệu chỉnh theo Refactor Review

### A. Tech Stack & Hạ tầng (Mục 10 Spec)
- **Spec Section 10 & Task Header:** Đã bổ sung đoạn tổng hợp Tech Stack chính thức tại Mục 10 của spec: React, Vite, Tailwind CSS, Inter font (self-host), NestJS (Node24, TypeScript), PostgreSQL, Drizzle ORM, Redis, BullMQ, Better Auth (Google & Discord providers), Socket.IO, LiveKit SFU (self-hosted), Nodemailer (SMTP), Web Push (VAPID).

### B. Danh mục Game & Thẻ tuyển
- **Game Catalog:** 7 game chính thức (Liên Minh Huyền Thoại, Valorant, Teamfight Tactics (TFT), Dota 2, Roblox, Liên Quân Mobile, Free Fire).
- **Quy mô `playerCapacity`:** Làm rõ `playerCapacity` là tổng số lượng người trong đội bao gồm cả chủ đội (ví dụ 5 cho 5v5), không phải số người tuyển thêm.
- **Quy tắc Buổi chơi Hẹn giờ (`scheduledAt`):** Người chơi được duyệt giữ chỗ hẹn; buổi chơi chỉ bắt đầu khi chủ đội hoặc người hỗ trợ có quyền `MANAGE_RECRUITMENT` bấm bắt đầu (`start`) thủ công. Thời gian đến giờ hẹn đơn thuần không tự động bắt đầu buổi chơi.

### C. Chế độ Phòng & Lời mời
- **Thuật ngữ Chế độ Phòng:** Chuẩn hóa chỉ dùng chế độ `PRIVATE` (xóa thuật ngữ enum `PRIVACY`). Chuyển chế độ phòng sang `PRIVATE` tự động đóng thẻ tuyển công khai (`CLOSED`), bảo toàn danh sách thành viên và lịch sử chat.
- **Lời mời:** Mặc định `OWNER_APPROVAL`. Direct invite cần consent. Phân biệt `ROOM` invitation (membership) và `PLAY_SESSION` invitation (roster/active slot).

### D. Thông báo & Quyền riêng tư
- **Thông báo Email:** Khớp chính xác giữa spec, task table và baseline: bao gồm lời mời (lời mời kết bạn, lời mời vào đội/phòng) và nhắc lịch chơi 10 phút.
- **Chính sách Kiểm duyệt & Quyền riêng tư Hồ sơ:** Các chi tiết quy định kiểm duyệt nội dung biên tập và riêng tư hồ sơ nâng cao tiếp tục được định nghĩa cụ thể bởi API contracts và ACL từng task (như T04, T10, T37), không cần hỏi lại các đề xuất mặc định đã chốt.

### E. Hiệu năng & Tải Media
- **Chỉ số p95 nhất quán:** Áp dụng chuẩn chỉ số p95 cho cả 3 thông số độ trễ: REST API response time (`p95 < 500ms`), realtime chat delivery latency (`p95 < 1s`), call join setup latency (`p95 < 3s`). Tỷ lệ lỗi hệ thống `< 1%`, audio packet loss `< 2%` (cần audible quality test thực tế).
- **Media Target:** Bảo toàn mục tiêu 1.000 người dùng media đồng thời (10 total / 3 publishers / 1 main selected stream / 720p30).

## 3. Kết luận
Tất cả các tài liệu `01-product-spec.md`, `02-frontend-design.md`, `task.md` và `spec-baseline.json` đã đạt sự nhất quán 100% sau hiệu chỉnh.
