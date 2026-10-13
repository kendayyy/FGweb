---
trigger: glob
description: "FG frontend must preserve approved colors, Inter typography and desktop/mobile layout."
globs: "code/apps/web/**"
---

# FG — Frontend
- LOADING3D-CHANGE-01: spec18/design14/task LOADING3D-FE chốt logo FG3D xoay360/6giây/nổi nhẹ và progressbar vô định thay label đang tải. Shared initial-loading boundaries thật, reduced-motion/tab-hidden/keyboard/mobile360px và không mất draft/session/socket/call; không timer giả hoàn thành hoặc WebGL. Coding and build 2 làm sau CHATCRYPTO-QA PASS trước T29 với scope/rebaseline review; logo canonical từ GAME-LOGO-FE, scratch demo không là runtime/PASS.
- FG-BRAND-LOGO-01: mẫu .doc/mockups/fg-logo-concepts/01-monogram.png đã được chọn08/10/2026. Coding/build thực hiện trong GAME-LOGO-FE theo task/design: SVG dark/light, favicon/Apple/PWA/maskable icons; không lấy board AI làm asset, giữ sidebar72px/logo khung40px. Không đổi ledger/PASS hoặc chen task hiện tại.
- THEME-COMPACT-02 (08/10/2026) thay yêu cầu Sáng/Tối/Hệ thống cũ: người dùng duyệt mockup chỉ icon và yêu cầu triển khai; chỉ Sáng/Tối, direct toggle44px với Classic, bỏ menu/chevron/chữ hiển thị. Đọc spec15/design12/task; legacy system migrate một lần, không theo OS nữa; giữ keyboard/focus/reduced motion và kiểm thử headed thật. Không coi duyệt ảnh là PASS.
- Đọc .doc/02-frontend-design.md và bốn mockup; giữ thiết kế đã duyệt. Mockup03 Bảng tin và mockup04 Đăng nhập desktop/mobile đã được duyệt ngày07/10/2026; auth theo mục11, không hỏi lại bố cục.
- Dùng Inter self-host, Vietnamese glyphs; font gốc ảnh không xác định, không giả đã trích font chính xác.
- Dùng shared CSS tokens theo primitive → semantic → component, không rải hex/theme khác từng màn.
- Theme navy tối, CTA xanh, avatars tròn, borders mảnh, density chat và radii theo design.
- THEME-CHANGE-01 cho phép light theo design mục12/spec mục15, bộ chọn Sáng/Tối/Hệ thống ở header/login, dark baseline giữ nguyên. Dùng semantic tokens, không remount/auth/socket restart khi đổi màu; LIGHT01-FE theo gate sau tiền nhiệm PASS, preview app thật để user review light.
- Lobby desktop: game sidebar → chat lớn nhất → tuyển đội/online cạnh chat.
- SIDEBAR-CHANGE-01 cập nhật: ảnh08 người dùng chọn sidebar danh mục cố định72px, logo24px/hàng46px, tooltip/focus/accessible name. Bỏ toggle208px/72px và local persistence rộng/hẹp; mobile drawer giữ nguyên. Đọc design mục6/task GAME-LOGO-FE, giữ draft/session/chat, không tự đổi ledger/PASS.
- SIDEBAR-COMPACT-APPROVED: .doc/mockups/08-sidebar-fixed-compact-preview.png đã được người dùng chốt07/10/2026. Đây là baseline hình thức sidebar, không nhầm với mockup08 light; giữ layout/tokens, không hỏi lại thiết kế hoặc coi duyệt ảnh là PASS.
- Mobile: selector game, tabs Chat/Tìm đội, controls đủ hit area và safe-area; không ép3cột.
- Group: nhiều nhóm gọi; một video chính chọn nhanh; Mic/Rời cuộc gọi khác Kết thúc buổi chơi.
- FE chỉ dùng API/contracts; không kết nối DB, chứa server keys hay tự quyết quyền/capacity.
- Loading/empty/error/guest/disabled phải phản ánh trạng thái thật; không production mock/fake success.
- Tin nhắn là text/data đã validate, không render HTML user gửi.
- Ảnh/logo AI chỉ reference, assets production phải có quyền sử dụng hoặc placeholder phù hợp.
- GAME-LOGO-01: dùng nguồn/mapping .doc/game-logos/README.md cho7 game; logo gốc giữ tỷ lệ/màu, local assets trong code/, không hotlink. Dota2 dùng ảnh người dùng cung cấp sau xử lý nền caro; Roblox được người dùng xác nhận quyền dùng cho FG ngày07/10/2026; xem mockup06 đang chờ duyệt, không coi ảnh là asset production. Tích hợp sau task hiện tại PASS và rebaseline, không chen runtime vào LIGHT01-FE đang chạy.
- Chụp actual UI tại1440x900,1280x800,390x844,360x800; so hierarchy/token/layout, không pixel-diff ảnh concept có khung.
- Không auto-update snapshots để che lệch; thay đổi style lớn cần người dùng review before/after.
- Bảng tin: desktop sidebar phía trên game, composer/feed và bộ lọc bên phải; mobile một cột, bottom nav Bảng tin/Lobby/Bạn bè/Thông báo. Giữ tokens FG; comment chữ, không ảnh theo icon sinh trong mockup. Scope/tests theo spec mục13 và T38-FEED-FE.
- Mockup05 admin dark đã duyệt; hộp thư/chat/chi tiết-notes theo design mục13. Admin kingame login khung04 với email/tên đăng nhập; menu Quản trị chỉ quyền server. Không lộ notes qua hidden CSS, không giả quyền/online/success, ảnh không chứng minh account được provision.

- THEME-VISUAL-02 (07/10/2026): người dùng chốt LIGHT-SMOKE-APPROVED trong design mục12, thay light trắng kem. Giữ bố cục/Inter/CTA xanh tiết chế/sidebar hẹp đã chốt. DARK-SMOKE-APPROVED cũng được người dùng chốt07/10/2026. Cả light/dark mới triển khai qua checkpoint/migration review; bộ chọn cải tiến đang đề xuất, giữ đủ Sáng/Tối/Hệ thống. Duyệt ảnh không thay kiểm thử/app thật hoặc PASS; lưu hashes/evidence, không chen task logo/sidebar vào LIGHT01-FE.
