# FG Task T00 — Danh mục các Cổng chưa giải quyết trong Tương lai (Unresolved Future Gates)

Ngày ghi nhận: 04/10/2026.
Nhiệm vụ: Ghi nhận minh bạch các cổng chuẩn bị và cổng vận hành trong tương lai, xác nhận không phải là blocker của T00/T01.

## 1. Cổng Cấu hình Dịch vụ (T02 Setup Gate)
- **Các yếu tố chưa cấu hình:**
  - Google OAuth Client ID & Secret
  - Discord OAuth Client ID & Secret
  - Email SMTP Host, Port, Username, Password, Sender Address
  - Web Push VAPID Public Key, Private Key, Subject
  - LiveKit Server WS URL, API Key, API Secret
  - Domain và PUBLIC_ORIGIN chính thức cho local / staging / production.
- **Tình trạng:** Cần chuẩn bị trước khi thực hiện **T02**. Không gây tắc nghẽn (blocker) cho T00 và T01.

## 2. Cổng Chi phí Vận hành Trì hoãn (T41 Operational Cost Gate)
- **Mô tả:** Nguyên tắc giữ nguyên "không bổ sung dịch vụ trả phí nếu chưa được người dùng chọn". Người dùng sẽ xem xét số liệu dự toán lưu lượng (traffic/egress/TURN) đo đạc thực tế và phê duyệt trần chi phí (cost ceiling) trước khi thực hiện các bài kiểm thử tải trả phí hoặc chi tiêu hạ tầng lớn ở **T41** (không cấm việc mua staging độc lập nếu được người dùng cho phép riêng sau này).
- **Tình trạng:** Đã ghi nhận và trì hoãn chính thức theo yêu cầu. Không chặn T00 hay T01.

## 3. Cổng Vận hành & Chính sách Cộng đồng (Future Operations Gates)
- **Mô tả:**
  - Ngày ra mắt chính thức (Official Launch Date).
  - Quy chế kiểm duyệt nội dung biên tập và chi tiết quyền riêng tư hồ sơ nâng cao.
- **Tình trạng:** Sẽ do bộ phận vận hành quyết định ở giai đoạn sau; các chi tiết kỹ thuật cụ thể tiếp tục được định nghĩa bởi API contracts và ACL từng task (như T04, T10, T37), không tự bịa phê duyệt toàn bộ vũ trụ hay hỏi lại các mặc định đã chốt.
