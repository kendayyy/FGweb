---
trigger: glob
description: "FG frontend must preserve approved colors, Inter typography and desktop/mobile layout."
globs: "code/apps/web/**"
---

# FG — Frontend
- Đọc .doc/02-frontend-design.md và hai mockup; giữ thiết kế đã duyệt.
- Dùng Inter self-host, Vietnamese glyphs; font gốc ảnh không xác định, không giả đã trích font chính xác.
- Dùng shared CSS tokens theo primitive → semantic → component, không rải hex/theme khác từng màn.
- Theme navy tối, CTA xanh, avatars tròn, borders mảnh, density chat và radii theo design.
- Lobby desktop: game sidebar → chat lớn nhất → tuyển đội/online cạnh chat.
- Mobile: selector game, tabs Chat/Tìm đội, controls đủ hit area và safe-area; không ép3cột.
- Group: nhiều nhóm gọi; một video chính chọn nhanh; Mic/Rời cuộc gọi khác Kết thúc buổi chơi.
- FE chỉ dùng API/contracts; không kết nối DB, chứa server keys hay tự quyết quyền/capacity.
- Loading/empty/error/guest/disabled phải phản ánh trạng thái thật; không production mock/fake success.
- Tin nhắn là text/data đã validate, không render HTML user gửi.
- Ảnh/logo AI chỉ reference, assets production phải có quyền sử dụng hoặc placeholder phù hợp.
- Chụp actual UI tại1440x900,1280x800,390x844,360x800; so hierarchy/token/layout, không pixel-diff ảnh concept có khung.
- Không auto-update snapshots để che lệch; thay đổi style lớn cần người dùng review before/after.

