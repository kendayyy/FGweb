# FG — Mockup đã được duyệt

## Mockup05 — Quản trị hỗ trợ, đã duyệt 07/10/2026

- [05 — Quản trị / Chat hỗ trợ desktop](./05-admin-support-desktop.png): hộp thư, chat với admin, chi tiết trạng thái và ghi chú nội bộ. Giữ phong cách FG; tạo bằng image_gen tích hợp, prompt lưu trong prompts.md.
- Người dùng đã duyệt bố cục và yêu cầu bàn giao coding/build. Đây là baseline admin dark, không phải light preview. Dữ liệu mẫu không chứng minh chức năng hoặc quyền admin; MinhAnh trong ảnh là tên mẫu, admin duy nhất thực tế theo yêu cầu mới là kingame. Trạng thái cùng request trong list/detail phải đồng nhất khi build.

## Mockup04 — Đăng nhập, đã duyệt 07/10/2026

- [04 — Đăng nhập desktop/mobile](./04-login-desktop-mobile.png), image_gen tích hợp ngày07/10/2026, tham chiếu phong cách ảnh03. Email/mật khẩu và Discord cùng một khung, tab Đăng nhập/Đăng ký, Quên mật khẩu và nút hiện/ẩn mật khẩu.
- Người dùng xác nhận “tôi chốt mockup này” ngày07/10/2026. Mockup04 là baseline bố cục đăng nhập cho bên coding/build; nghiệp vụ AUTH-CHANGE-02 ở spec mục14. Không coi duyệt ảnh là bằng chứng auth/SMTP hoạt động.

Ảnh01/02 tạo ngày04/10/2026 và ảnh03 ngày07/10/2026 bằng image_gen tích hợp, chưa phải website đã chạy.

- [01 — Lobby desktop và mobile](./01-lobby-desktop-mobile.png): chat chung là trung tâm; tìm đội riêng cạnh chat; mobile chuyển tab Chat/Tìm đội; người online và trạng thái tự chọn.
- [02 — Phòng nhóm, gọi và live](./02-group-call-live.png): phòng giữ lâu dài, nhiều nhóm gọi; một live chính chọn từ tối đa ba người phát; người xem vẫn có mic, âm lượng/local mute riêng.
- [Prompt đầy đủ](./prompts.md).

## Mockup Bảng tin — bố cục đã duyệt 07/10/2026

- [03 — Bảng tin desktop và mobile](./03-community-feed-desktop-mobile.png), tạo bằng image_gen tích hợp ngày 07/10/2026 theo FEED-CHANGE-01. Giữ phong cách FG đã duyệt; minh họa bảng tin chung, lọc game/loại bài, đăng chữ/ảnh, thích, bình luận và nhắn riêng.
- Người dùng đã xác nhận bố cục ổn và yêu cầu ghi tài liệu để coding/build triển khai. Ảnh03 là baseline bố cục Bảng tin, chưa là bằng chứng ứng dụng chạy. Icon ảnh trong ô bình luận là chi tiết ảnh sinh, không tự bổ sung yêu cầu ảnh đính kèm bình luận. Dữ liệu, logo và avatars chỉ là minh họa.

Dữ liệu, avatars, hình và logo game chỉ là minh họa. Khi build dùng assets có quyền sử dụng hoặc placeholders; không coi ảnh AI là nguồn dữ liệu cho nghiệp vụ. Không thêm premium, camera, ghi hình hay channel theo chủ đề vì chúng không nằm trong spec.

Tên FG, theme tối, accent xanh, typography và bố cục đã được người dùng duyệt. Quy chuẩn frontend ở [02-frontend-design.md](../02-frontend-design.md); các kiểm thử phải dựa spec/contracts, không dựa chữ/số vẽ trong ảnh. Responsive mobile cần được kiểm trên website thật; ảnh không là bằng chứng PWA/mic/push chạy được.

Ảnh02 minh họa desktop; điện thoại hỗ trợ gọi và xem live, không phát màn hình trực tiếp trong bản đầu. Các ô nguồn phát không có nghĩa client phải tải ba video full-quality cùng lúc: chỉ một video chính được subscribe, để giữ mục tiêu chi phí.

Chưa triển khai code. Kế hoạch build ở [task.md](../task.md); nguồn yêu cầu ở [spec](../01-product-spec.md).

## Mockup06 — Logo game, chờ người dùng duyệt

- [06 — Lobby desktop/mobile có7 logo](./06-game-logos-lobby-desktop-mobile.png), tạo07/10/2026. Bố cục dark FG; Dota2 được chọn. Roblox dùng theo xác nhận quyền sử dụng của người dùng. Nguồn logo và giới hạn ảnh ở [game-logos](../game-logos/README.md).
- Đây là preview hình thức, chưa được duyệt, chưa tích hợp app; không tự thay baseline01 hoặc đánh PASS. Logo trong ảnh AI không thay asset gốc; giữ wordmark FG chuẩn, không thêm tagline minh họa.

- [Mockup06 v2 — logo nhỏ gọn](./06-game-logos-lobby-desktop-mobile-v2.png): người dùng yêu cầu thu nhỏ logo ngày07/10/2026; giữ bố cục dark, đang chờ duyệt. Kích thước mục tiêu khi build: symbol24–28px, khung32px; wordmark ngang contain tối đa48px rộng/18–24px cao, header32px/mobile20px. Ảnh AI chỉ minh họa, không đảm bảo kích thước pixel chính xác; không thay asset gốc hay tuyên bố app đã sửa.

- [Mockup06 v3 — đề xuất sidebar gọn và phóng to](./06-game-logos-compact-proposal-v3.png): logo biểu tượng24px, wordmark ngang tối đa48px, dòng46px, tên game thẳng hàng. Người dùng chấp nhận hướng thiết kế qua “cũng được” ngày07/10/2026 và bổ sung toggle sidebar (SIDEBAR-CHANGE-01). Chỉ chốt hình thức, không là PASS chức năng hoặc thay đổi runtime.

## Mockup07 — Sidebar mở rộng/thu gọn, phương án cũ đã thay thế

- [07 — Hai trạng thái sidebar](./07-sidebar-expanded-collapsed.png), tạo07/10/2026 theo SIDEBAR-CHANGE-01. Mở208px có logo/tên, thu72px có logo/tooltip, chevron chuyển trạng thái. Chưa triển khai runtime hoặc chứng minh persistence/session.
- Dùng assets gốc khi build; chữ TFT/Free Fire ở thanh thu trong ảnh AI chưa chính xác, không lấy chữ viết tắt sinh trong ảnh làm logo. Wordmark phải contain đầy đủ tối đa48px theo design, không crop/vẽ lại.

## Mockup08 — Theme sáng trắng kem, đã chọn07/10/2026

- [08 — Mẫu trắng kem](./08-light-warm-ivory.png) được người dùng chọn: “tôi chọn mẫu này”. Giữ layout/Inter/CTA xanh của FG; palette theo design mục12. Ảnh là hướng màu đã duyệt, chưa thay review app thật hoặc kiểm thử chức năng.
- LIGHT01-FE đã áp dụng màu và có ảnh desktop/mobile thực tế tại code/quality/evidence/LIGHT01-FE/warm/screenshots/. Giữ các yêu cầu logo/sidebar riêng theo checkpoint của chúng.

## Ảnh08 — Sidebar hẹp cố định do người dùng chọn

- [08 — Tham chiếu người dùng](./08-sidebar-fixed-compact-user-reference.png), nhận07/10/2026. Người dùng yêu cầu luôn hẹp, bỏ nút thu gọn/mở rộng kể cả chevron còn xuất hiện trong ảnh. Sidebar72px chỉ logos, tooltip tên; FG/avatar/icon điều hướng giữ gọn.
- Thay yêu cầu toggle/persistence và mockup07, không xóa evidence cũ. Logo sinh sai trong ảnh không thay assets gốc; đây là duyệt bố cục, chưa là bằng chứng app/E2E hoạt động.

- [08 — Mockup sidebar hẹp cố định, bỏ nút toggle](./08-sidebar-fixed-compact-preview.png): tạo theo ảnh08 người dùng cung cấp;7 logo, tooltip, FG và avatar/icon điều hướng. Người dùng chốt07/10/2026, mã SIDEBAR-COMPACT-APPROVED; baseline hình thức sidebar hẹp thay phương án toggle. Không coi tỷ lệ pixel của ảnh AI là thông số CSS hoặc bằng chứng app đã triển khai. SHA256: 45A533F27096B6DEF259DF45AE18793730FFED112161818CC634CAC05AD4B814.

## Theme Xám khói — THEME-VISUAL-02

- [Light Xám khói đã chốt](./fg-light-smoke-approved.png), mã LIGHT-SMOKE-APPROVED: người dùng “chốt cái này”, đính kèm mẫu1 ngày07/10/2026. Thay trắng kem; giữ lịch sử mockup08 và evidence cũ.
- [Dark Xám khói đề xuất](./fg-dark-smoke-proposal.png), mã DARK-SMOKE-PROPOSAL: tạo từ light đã chốt, cùng desktop/mobile; đang chờ người dùng duyệt.
- Khung trình bày, swatches, dữ liệu/avatars/logo AI chỉ minh họa. Dùng assets gốc, tokens và kiểm thử headed app thật theo checkpoint; chưa có implementation hoặc PASS mới trong lần lưu tài liệu này.

## Xác nhận cả hai theme Xám khói07/10/2026

- Người dùng “tôi chốt bản dark và bản light mới nãy”: LIGHT-SMOKE-APPROVED và [DARK-SMOKE-APPROVED](./fg-dark-smoke-approved.png) đều đã chốt. Giữ ảnh dark proposal cũ làm lịch sử.
- Bộ chọn Sáng/Tối/Hệ thống cải tiến đang đề xuất tại code/quality/evidence/LIGHT01-FE/switcher-concepts/. Chưa chọn mẫu nút hoặc triển khai runtime trong lần lưu này.
