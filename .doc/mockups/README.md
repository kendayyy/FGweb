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
