# FG — Mockup đã được duyệt

Hai ảnh được tạo bằng image_gen tích hợp ngày 04/10/2026, chưa phải website đã chạy.

- [01 — Lobby desktop và mobile](./01-lobby-desktop-mobile.png): chat chung là trung tâm; tìm đội riêng cạnh chat; mobile chuyển tab Chat/Tìm đội; người online và trạng thái tự chọn.
- [02 — Phòng nhóm, gọi và live](./02-group-call-live.png): phòng giữ lâu dài, nhiều nhóm gọi; một live chính chọn từ tối đa ba người phát; người xem vẫn có mic, âm lượng/local mute riêng.
- [Prompt đầy đủ](./prompts.md).

Dữ liệu, avatars, hình và logo game chỉ là minh họa. Khi build dùng assets có quyền sử dụng hoặc placeholders; không coi ảnh AI là nguồn dữ liệu cho nghiệp vụ. Không thêm premium, camera, ghi hình hay channel theo chủ đề vì chúng không nằm trong spec.

Tên FG, theme tối, accent xanh, typography và bố cục đã được người dùng duyệt. Quy chuẩn frontend ở [02-frontend-design.md](../02-frontend-design.md); các kiểm thử phải dựa spec/contracts, không dựa chữ/số vẽ trong ảnh. Responsive mobile cần được kiểm trên website thật; ảnh không là bằng chứng PWA/mic/push chạy được.

Ảnh02 minh họa desktop; điện thoại hỗ trợ gọi và xem live, không phát màn hình trực tiếp trong bản đầu. Các ô nguồn phát không có nghĩa client phải tải ba video full-quality cùng lúc: chỉ một video chính được subscribe, để giữ mục tiêu chi phí.

Chưa triển khai code. Kế hoạch build ở [task.md](../task.md); nguồn yêu cầu ở [spec](../01-product-spec.md).

