# FG — Thiết kế frontend đã duyệt

Ngày chốt: 04/10/2026. Người dùng xác nhận tên website **FG** và yêu cầu giữ màu sắc, font theo phong cách ảnh, bố cục của hai mockup đã lưu.

## 1. Nguồn thiết kế

- [Lobby desktop/mobile](./mockups/01-lobby-desktop-mobile.png).
- [Phòng nhóm, gọi và live](./mockups/02-group-call-live.png).
- [Spec sản phẩm](./01-product-spec.md) quyết định hành vi và quyền truy cập.

Hai ảnh là baseline hình thức đã được duyệt. Không tự thay theme, dựng lại layout hoặc chuyển sang một phong cách khác khi build. Các số online, tin nhắn, avatars và hình game trong ảnh là dữ liệu minh họa.

Các giá trị dưới đây chuẩn hóa phong cách ảnh thành thông số để code nhất quán. Màu được lấy mẫu/điều chỉnh từ ảnh; không phải mọi pixel của ảnh AI đều có cùng màu. Font gốc không thể xác định chính xác từ ảnh raster; chọn **Inter** để triển khai gần phong cách đã duyệt, không tuyên bố đây là font gốc của ảnh.

## 2. Tên và hình thức chung

- Tên sản phẩm, document title, login heading, email sender display name, manifest name/short_name: **FG**. Title từng trang dùng dạng `Lobby · Liên Minh — FG`, `Phòng nhóm — FG`.
- Wordmark chữ FG nhỏ gọn trong app navigation; chưa tạo biểu tượng hay diễn giải ý nghĩa tên FG.
- Nền navy/than tối, panel phân lớp nhẹ, viền mảnh, chữ trắng dịu, action xanh dương, trạng thái xanh lá và action rời cuộc gọi đỏ.
- Giao diện cộng đồng game: chat chiếm diện tích chính, gọn và dễ đọc, avatars tròn, card nhẹ, icon nét mảnh. Không thêm hero marketing, hiệu ứng neon mạnh, glass blur toàn trang hoặc card phóng lớn làm giảm không gian chat.
- Ảnh tham chiếu desktop có khung trình bày và tiêu đề “01/02”; không dựng các khung thuyết trình hay viền điện thoại đó thành UI ứng dụng.

## 3. Màu sắc và token

| Token primitive | Giá trị | Vai trò |
| --- | --- | --- |
| navy-canvas | #141A24 | nền toàn ứng dụng |
| navy-sidebar | #11151C | thanh điều hướng game/phòng |
| navy-chat | #141920 | khu chat |
| navy-panel | #151B23 | tìm đội và panel bên cạnh |
| navy-raised | #202936 | bubble, menu, input và surface nâng |
| navy-hover | #263246 | hover và item chọn nhẹ |
| border-default | #303D50 | viền panel/card, 1px |
| blue-action | #3E7FFD | nền CTA chính, gần màu lấy mẫu từ ảnh |
| blue-hover | #3271EC | CTA hover |
| blue-active | #2863DC | CTA pressed |
| blue-focus | #82AEFF | focus ring và text action nhỏ |
| text-primary | #EDF2FF | nội dung chính |
| text-secondary | #B6C2D9 | mô tả và thông tin hỗ trợ |
| text-muted | #94A3BC | timestamp, trạng thái phụ |
| green-status | #39D98A | online/đang chơi |
| amber-status | #F5C66A | cảnh báo hoặc đang chờ |
| red-destructive | #E5484D | rời cuộc gọi, action nguy hiểm |

Tổ chức ba lớp khi triển khai: primitive → semantic → component. Semantic gồm background/sidebar/chat/surface/border/foreground/muted/primary/focus/success/warning/destructive. Component dùng các semantic này cho button, composer, bubble, recruitment-card, nav-item và voice-control; không rải hex riêng lẻ mỗi màn hình.

Primary button: nền blue-action, chữ sáng weight600, viền nhẹ; hover blue-hover, pressed blue-active. Kiểm tương phản chữ sáng trên xanh khi build; nếu chưa đạt 4.5:1, dùng nền xanh đậm hơn trong cùng hue và giữ cảm giác đã duyệt. Chữ action nhỏ trên nền tối dùng blue-focus. Trạng thái luôn có icon/nhãn, không chỉ phân biệt bằng màu.

## 4. Typography

Font triển khai: **Inter**, self-host bằng `@fontsource/inter` tại T01, gồm bộ ký tự tiếng Việt, weights400/500/600/700/800. Fallback system-ui, sans-serif. Không tải font từ CDN runtime; ghi license theo [Inter chính thức](https://rsms.me/inter/).

| Dùng ở đâu | Size / line-height | Weight |
| --- | --- | --- |
| Tên game desktop | 28px / 36px | 700 |
| Tên phòng/nhóm gọi | 22px / 30px | 700 |
| Heading panel | 18px / 26px | 700 |
| Nội dung chat | 14px / 22px desktop; 15px / 24px mobile | 400 |
| Tên người, nav, title thẻ | 14px / 20px | 600 |
| Button, input | 14px / 20px desktop; input mobile16px / 24px | 500–600 |
| Timestamp, badge | 12px / 18px | 400–500 |
| Wordmark FG | 22px / 28px | 800 |

Tên và số lượng dùng tabular numerals khi phù hợp. Text heading letter-spacing -0.02em; body bình thường. Kiểm diacritics bằng câu “Liên Minh Huyền Thoại · Đang tìm đội · Rời cuộc gọi”; không cắt dấu hoặc ép uppercase toàn bộ chat.

## 5. Khoảng cách, component và trạng thái

- Spacing scale 4/8/12/16/20/24/32px. Padding panel16px, card12–16px, khoảng cách tin nhắn12–16px.
- Radius: control8px, card/panel12px, bubble12px, avatar tròn, composer pill24px. Tránh bo quá lớn làm giống giao diện marketing.
- Avatar chat40px desktop/36px mobile; avatar roster48px; icon18–20px. Mobile hit target ít nhất44×44px kể cả icon nhỏ.
- Button/composer controls40px desktop,44–48px mobile. Composer vùng nhập tối thiểu52px, mở rộng khi nhiều dòng nhưng không che toàn chat.
- Reply preview có thanh xanh2px, nền hơi sáng hơn chat. Bubble không có shadow nặng; card/menu shadow nhẹ chỉ để phân lớp.
- Hover/focus/pressed/disabled/loading/error/success phải có style thống nhất. Disabled giảm nổi bật nhưng không biến text thành không đọc được.
- Focus ring2px, offset2px; menu đóng bằng Escape, thao tác keyboard dùng được. Tooltip không chứa thông tin duy nhất mà mobile không thấy.
- Motion120–180ms cho hover/menu, không parallax hay animation nền; tôn trọng prefers-reduced-motion.

## 6. Layout Lobby

### Desktop từ1200px

- Full-height app shell; sidebar208px; main chat co giãn; panel tìm đội/online352px. Các vùng phân cách bằng viền mảnh, gutter/padding16px.
- Header game64–80px; tên game + Lobby + thông tin phụ. Friends/messages/notifications là actions gọn trên header.
- Main chat lớn nhất, message list cuộn riêng, composer luôn ở cuối vùng chat. Page không nhảy scroll khi có tin mới lúc đang đọc lịch sử.
- Panel phải: Tìm đội → Tạo đội → Chơi ngay/Hẹn giờ → thẻ → Đang online. Online list có nhãn trạng thái và mở hồ sơ/nhắn tin.
- Sidebar: 7 game, chọn game hiện tại bằng surface xanh nhẹ + viền/marker xanh; FG ở đầu navigation, hồ sơ/trạng thái/phòng/bạn bè phía dưới.

### Tablet1024–1199px

Sidebar thu72px bằng icons + tooltip; panel phải320px; chat vẫn ưu tiên rộng. Tất cả game vẫn truy cập được, không bỏ chức năng.

### Dưới1024px

- Một vùng nội dung; hai tab Chat/Tìm đội. Game selector ở header; game sidebar chuyển drawer.
- Bottom navigation Lobby/Bạn bè/Thông báo, truy cập Phòng của tôi từ navigation menu. Composer tách khỏi bottom navigation.
- Tìm đội hiển thị thẻ full-width khi chọn tab, không ép ba cột hay miniaturize desktop.
- Safe-area trên/dưới và bàn phím không che input; dùng dynamic viewport. Kiểm tại360/390/430px, không scroll ngang hoặc chữ tràn.
- Add to Home Screen là banner/action nhỏ có thể đóng, không chiếm phần lớn chat.

## 7. Layout phòng nhóm, gọi và live

- Desktop: sidebar phòng/nhóm gọi240px; main live linh hoạt; chat nhóm320px. Header tên nhóm, số người và nút Kết thúc buổi chơi theo quyền.
- Sidebar chứa chat nhóm, danh sách nhiều nhóm gọi, Tạo nhóm gọi/Mời bạn/Cài đặt. Nhóm đang chọn có viền/action xanh.
- Main: các ô chọn nguồn phát nhỏ → một video chính16:9 → avatars người chơi/người xem → Mic/Chia sẻ màn hình/Rời cuộc gọi.
- Rời cuộc gọi là action đỏ; Kết thúc buổi chơi là action riêng. Không đổi nhãn hoặc gộp hai chức năng.
- Menu thành viên có Âm lượng/Tắt tiếng với tôi; các action moderator theo permission, không để hidden UI thay authorization backend.
- Chỉ subscribe một video chính; các ô chọn luồng dùng thumbnail tĩnh/icon/name, không ngầm tải ba video full quality. Tab live ngoài giữ cùng visual language.
- Mobile: video chính16:9, selector cuộn ngang, tab Cuộc gọi/Chat nhóm; controls dễ chạm. Không bắt camera, không hiển thị nút phát màn hình trên thiết bị không hỗ trợ. Người xem vẫn có mic.

## 8. Quy tắc frontend khác và nghiệm thu hình thức

Login/onboarding, hồ sơ, DM, bạn bè, thông báo, cài đặt và admin sử dụng cùng font/token/component. Nội dung tiếng Việt, không tự thêm một design system khác hoặc default library theme làm lệch mockup.

T09 dựng font/tokens/components nền tảng trong `code/apps/web/src/styles/{tokens,global}.css` và `code/apps/web/src/components/ui/`; T13/T19/T28/T30 áp dụng vào layout. Đây là đường dẫn code tương lai, chưa có implementation ở ngoài code/.

Visual regression checkpoints: T13 Lobby, T19 room, T28 voice, T30 live, T39 toàn frontend. Screenshot ứng dụng thật ở1440×900,1280×800,390×844 và360×800; đợi font load, dùng dữ liệu test cố định, tắt animation để so sánh ổn định.

So mockup về hierarchy, tỷ lệ vùng, màu, typography, density, trạng thái active và vị trí controls. Không dùng pixel-diff trực tiếp giữa ảnh AI có khung thuyết trình và ảnh website. Snapshot tự động chỉ so giữa các phiên bản website đã có baseline review; không tự cập nhật snapshots để che lỗi.

Các số/bố cục thích ứng có thể thay đổi theo viewport và accessibility, nhưng không tự đổi theme/font/style. Nếu cần khác biệt hình thức đáng kể, đưa ảnh before/after và lý do để người dùng review trước khi cập nhật baseline.

## 9. Xác nhận đã lưu

Tên **FG** và phong cách hai mockup đã được người dùng duyệt trong chat. T00 không hỏi lại các mục này. Phần số liệu CSS được chuẩn hóa từ phong cách ảnh để implementer có hướng dẫn cụ thể; chỉ điều chỉnh kỹ thuật nhỏ cho tương phản/responsive nếu vẫn giữ thiết kế đã duyệt, ghi rõ trong evidence.

T00 vẫn cần chốt các điểm nghiệp vụ/stack chưa được duyệt trong task.md; không coi duyệt giao diện là duyệt toàn bộ các đề xuất khác.

## 10. Bảng tin cộng đồng — xác nhận 07/10/2026

- Bảng tin là mục chính ngang hàng với Lobby: desktop ở sidebar phía trên danh sách game, mobile ở thanh điều hướng dưới. Giữ truy cập các chức năng hiện có.
- Dùng lại theme navy tối, CTA xanh, Inter self-host, tokens, avatar tròn, borders mảnh và spacing/radii đã duyệt. Người dùng xác nhận rõ giữ màu sắc và phong cách FG; không redesign hoặc dùng theme Facebook.
- Vùng nội dung hiển thị bài đăng và tương tác thích/bình luận/trả lời, bộ lọc game và loại bài; nội dung/ảnh theo mục 13 của product spec. Chi tiết layout cần review khi thiết kế tính năng, không tự coi mockup Lobby là mockup Bảng tin.
