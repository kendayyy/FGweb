# FG — Thiết kế frontend đã duyệt

Ngày chốt: 04/10/2026 cho tên FG và mockup01/02; bổ sung bố cục Bảng tin mockup03 ngày07/10/2026. Giữ màu sắc, font và phong cách FG đã duyệt.

## 1. Nguồn thiết kế

THEME-CHANGE-01: người dùng duyệt khả năng chuyển Sáng/Tối/Hệ thống; năm mockup bên dưới tiếp tục baseline tối/bố cục. Light được xem trực tiếp trên app và review ảnh thật theo mục12; chưa có hình thức light được chốt.

- [Lobby desktop/mobile](./mockups/01-lobby-desktop-mobile.png).
- [Phòng nhóm, gọi và live](./mockups/02-group-call-live.png).
- [Bảng tin cộng đồng desktop/mobile](./mockups/03-community-feed-desktop-mobile.png), bố cục được duyệt ngày 07/10/2026.
- [Đăng nhập desktop/mobile](./mockups/04-login-desktop-mobile.png), người dùng chốt mockup ngày07/10/2026.
- [Quản trị hỗ trợ desktop](./mockups/05-admin-support-desktop.png), đã duyệt ngày07/10/2026; admin dark, không phải light preview.
- [Spec sản phẩm](./01-product-spec.md) quyết định hành vi và quyền truy cập.

Năm ảnh là baseline hình thức đã được duyệt. Không tự thay theme, dựng lại layout hoặc chuyển sang một phong cách khác khi build. Các số online, tin nhắn, bài đăng, avatars và hình game trong ảnh là dữ liệu minh họa.

GAME-LOGO-01 (07/10/2026): người dùng yêu cầu dùng logo thật cho7 game. Nguồn ảnh và mapping/vị trí tích hợp ở [game-logos/README.md](./game-logos/README.md). Thay chữ viết tắt sidebar và icon tay cầm header Lobby, giữ nguyên layout/tokens FG; dùng cùng mapping ở chọn game/hồ sơ/bộ lọc. Không đảo màu hoặc biến dạng logo. Dota2 đã có ảnh người dùng cung cấp nhưng cần xử lý nền caro, người dùng xác nhận quyền dùng Roblox cho FG ngày07/10/2026; dùng logo theo mapping và ghi đúng trạng thái. Chỉ tích hợp runtime sau gate task hiện tại PASS.

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

- Full-height app shell; sidebar danh mục cố định72px theo SIDEBAR-CHANGE-01 cập nhật; main chat co giãn; panel tìm đội/online352px. Các vùng phân cách bằng viền mảnh, gutter/padding16px.
- Header game64–80px; tên game + Lobby + thông tin phụ. Friends/messages/notifications là actions gọn trên header.
- Main chat lớn nhất, message list cuộn riêng, composer luôn ở cuối vùng chat. Page không nhảy scroll khi có tin mới lúc đang đọc lịch sử.
- Panel phải: Tìm đội → Tạo đội → Chơi ngay/Hẹn giờ → thẻ → Đang online. Online list có nhãn trạng thái và mở hồ sơ/nhắn tin.
- Sidebar: 7 game, chọn game hiện tại bằng surface xanh nhẹ + viền/marker xanh; FG ở đầu navigation, hồ sơ/trạng thái/phòng/bạn bè phía dưới.

### Sidebar danh mục hẹp cố định — SIDEBAR-CHANGE-01 cập nhật, 07/10/2026

- Người dùng thay yêu cầu toggle bằng sidebar luôn hẹp theo [ảnh tham chiếu08](./mockups/08-sidebar-fixed-compact-user-reference.png). Bỏ nút chevron trong ảnh theo lời người dùng; mockup07 mở/thu chỉ là phương án cũ đã được thay thế.
- Người dùng chốt [mockup sidebar hẹp cố định](./mockups/08-sidebar-fixed-compact-preview.png) ngày07/10/2026: đây là baseline hình thức cho sidebar danh mục, mã tham chiếu SIDEBAR-COMPACT-APPROVED để phân biệt với mockup08 theme sáng trắng kem. Giữ màu/phong cách FG; áp dụng cấu trúc sidebar này trên cả light/dark qua tokens hiện có. Duyệt ảnh không xác nhận app hoặc chức năng đã PASS.
- Desktop/tablet từ1024px: sidebar cố định72px, chỉ hiện logo căn giữa; FG nhỏ ở đầu, avatar và icon Phòng của tôi/Bạn bè ở cuối. Logo biểu tượng24px, wordmark ngang contain tối đa48px rộng/18–24px cao, dòng46px. Không crop/vẽ lại logo theo chữ viết tắt sai trong ảnh AI.
- Không có chế độ mở rộng208px, nút toggle hoặc lưu lựa chọn rộng/hẹp. Tooltip tên game khi hover hoặc focus; mọi nút game/icon điều hướng có accessible name, trạng thái game hiện tại và hit area ít nhất44px. Không phụ thuộc tooltip để người dùng keyboard/screen reader biết tên.
- Chat dùng phần rộng được giải phóng; panel phải giữ quy tắc responsive. Không thu nhỏ chữ/logo toàn app theo sidebar; tên game vẫn hiện đầy đủ tại header.
- Mobile dưới1024px dùng nút menu mở drawer danh mục, chọn game hoặc Escape đóng drawer, khôi phục focus về nút mở; game selector và bottom nav giữ nguyên. Không lưu trạng thái drawer mở sau reload.
- Điều chỉnh bố cục không remount chat/auth, đổi route/game, xóa nội dung đang nhập, reset scroll hoặc ngắt session/socket. Motion theo tokens và reduced motion.

### Tablet1024–1199px

Sidebar cố định72px bằng logos + tooltip, không nút mở rộng; panel phải320px; chat vẫn ưu tiên rộng. Tất cả game vẫn truy cập được, không bỏ chức năng.

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

AUTH-CHANGE-02 ngày07/10/2026: nghiệp vụ email/mật khẩu đã chốt; người dùng xác nhận “tôi chốt mockup này” cho mockup04. Khung đăng nhập desktop/mobile là baseline bố cục đã duyệt.

Tên **FG** và phong cách ba mockup đã được người dùng duyệt trong chat. T00 không hỏi lại các mục này. Phần số liệu CSS được chuẩn hóa từ phong cách ảnh để implementer có hướng dẫn cụ thể; chỉ điều chỉnh kỹ thuật nhỏ cho tương phản/responsive nếu vẫn giữ thiết kế đã duyệt, ghi rõ trong evidence.

T00 vẫn cần chốt các điểm nghiệp vụ/stack chưa được duyệt trong task.md; không coi duyệt giao diện là duyệt toàn bộ các đề xuất khác.

## 10. Bảng tin cộng đồng — bố cục duyệt 07/10/2026

- Baseline: mockup 03. Người dùng xác nhận “bố cục ổn” và yêu cầu ghi vào tài liệu coding/build; không hỏi lại màu sắc/phong cách FG đã duyệt.
- Desktop: sidebar FG → Bảng tin active → Lobby → game; vùng chính có header, composer và bài đăng; panel phải là bộ lọc game/loại bài. Sidebar danh mục chung cố định72px theo SIDEBAR-CHANGE-01 cập nhật, panel280px, feed co giãn; tablet chuyển bộ lọc lên đầu khi thiếu rộng.
- Mobile dưới1024px: một cột; header Bảng tin, chọn game, chips loại bài, composer, bài và bình luận. Bottom navigation Bảng tin/Lobby/Bạn bè/Thông báo; Phòng của tôi từ menu. Có safe-area, controls ít nhất44px, không overflow tại360px.
- Bài gồm avatar/tên/thời gian, nhãn game/loại, nội dung/ảnh, thích/bình luận, menu và liên hệ qua Nhắn riêng/hồ sơ. Reply lùi một cấp; không biến feed thành chat hoặc thẻ tuyển có số suất.
- Tái sử dụng Inter self-host, navy surfaces, CTA xanh, token/radius/borders/spacing và trạng thái tại mục3–5. Không chép theme Facebook, thêm hero/neon hoặc font mới.
- Khung điện thoại/nhãn Máy tính/Điện thoại/03 là phần trình bày mockup, không build vào app. Icon ảnh của ô bình luận không thuộc scope; bình luận chữ theo spec mục13.
- Checkpoint T38-FEED-FE và T39: screenshot UI thật ở1440×900,1280×800,390×844,360×800 với dữ liệu cố định, font đã load; review hierarchy/token/layout, không pixel-diff ảnh AI hoặc tự sửa snapshot để che sai lệch.

## 11. Auth email/mật khẩu — mockup04 đã duyệt 07/10/2026

- [Mockup04 desktop/mobile](./mockups/04-login-desktop-mobile.png) đã được người dùng chốt, là baseline bố cục đăng nhập. Giữ navy/blue/Inter/tokens FG; không hỏi lại bố cục này.
- Khung đăng nhập gọn ở giữa desktop, một cột trên mobile; Email/Mật khẩu và nút hiện/ẩn, Quên mật khẩu, CTA Đăng nhập, divider “hoặc”, Tiếp tục với Discord, liên kết Đăng ký. Có lựa chọn Đăng nhập/Đăng ký; không thêm provider khác.
- Các màn xác minh/reset/đổi/thêm mật khẩu dùng cùng components/tokens, thông báo trạng thái thật. Không hiển thị hash/token, thông tin kỹ thuật bảo mật hay badge “an toàn tuyệt đối” trong UI.
- Bên coding/build triển khai theo task/rebaseline sau khi task hiện tại review PASS; bố cục đã chốt. Kiểm keyboard/focus, safe-area, input mobile16px và360px không overflow; screenshot thật1440/1280/390/360, UI/E2E headed theo TEST-VISIBILITY-01. Khung trình bày/điện thoại trong ảnh không build vào app; ảnh không là evidence auth/SMTP đã chạy.

## 12. Theme Xám khói — cả light/dark đã chốt, bộ chọn mới đang đề xuất

Mockup05 là Quản trị hỗ trợ dark đã duyệt; không dùng nó để đánh dấu light đã được người dùng chốt.

- Người dùng yêu cầu `npx shadcn@latest add @toggles/classic` ngày07/10/2026: thêm riêng component Classic từ Toggles.dev và cấu hình CLI tối thiểu trong frontend. Đây là bước chuẩn bị, chưa duyệt cách ghép vào header hoặc thay menu ba lựa chọn; khi tích hợp phải giữ Sáng/Tối/Hệ thống, nhãn tiếng Việt, keyboard/focus và reduced motion. Không áp palette mặc định shadcn vào FG.

- Yêu cầu triển khai tiếp theo07/10/2026: dùng Classic trong bộ chọn và build cả hai theme đã chốt. Nút header mở menu ba lựa chọn, dùng icon SVG động Classic theo màu hiệu lực; không lồng button hoặc biến Hệ thống thành lựa chọn nhị phân. Hệ thống vẫn hiện đúng nhãn đã lưu. Giữ44px, keyboard/focus, reduced motion; dùng màu FG. Các mockup bộ chọn còn lại được thay bằng bước review app thật theo yêu cầu này. Viền phân vùng mềm tách với viền control; link/focus/outline được chỉnh cùng sắc để đạt tương phản đo được.

- Bộ chọn Sáng/Tối/Hệ thống trên global header, hiện cả trang login. Nút icon mặt trời/mặt trăng mở menu có nhãn, dấu lựa chọn và focus rõ; system thể hiện nhãn Hệ thống dù màu thực tế sáng/tối.
- THEME-VISUAL-02: người dùng “chốt cái này” ngày07/10/2026, đính kèm mẫu1 [Light Xám khói](./mockups/fg-light-smoke-approved.png), mã LIGHT-SMOKE-APPROVED. Thay phương án trắng kem đã bị đánh giá quá chói; giữ ảnh/evidence cũ làm lịch sử. Bố cục desktop/mobile trong ảnh được chọn, đồng bộ sidebar hẹp SIDEBAR-COMPACT-APPROVED. Giữ Inter và nhóm chức năng FG; không build khung điện thoại, swatches, nhãn trình bày hoặc dữ liệu mẫu vào app.
- Palette light đã chọn: canvas#CFD3D6/chat#C8CDD1/sidebar và panel#D8DCE0/input#BDC4CA/selected#B7C5D4/text#29323B/sub#48545F/action#315C9B. Viền trang trí nhẹ, nút/focus rõ; font/hierarchy/spacing/radius theo ảnh và FG. Hex là hướng triển khai, không khẳng định mọi pixel AI đúng token; link/hover/focus/status cần kiểm tương phản thật trước PASS.
- [Dark Xám khói đã chốt](./mockups/fg-dark-smoke-approved.png), mã DARK-SMOKE-APPROVED: canvas#1F252C/chat#212830/panel#2B333D/bubble#303A46/input#252E38/selected#33465F/text#E2E7ED/sub#B6C1CF/quiet#A5B1C0/action#365F98/link-focus#91AED7. Nền than xám, chữ trắng dịu, không OLED black hoặc neon. Giữ cùng bố cục light; người dùng xác nhận “tôi chốt bản dark và bản light mới nãy” ngày07/10/2026. Phê duyệt hình thức chưa thay implementation/app review/tests.
- Dùng data-theme trên html và color-scheme; triển khai cả hai palette đã chốt qua checkpoint/migration, giữ hành vi hiện có. Rà màu hardcoded và status surfaces của app đang có; các màn chưa build phải dùng cùng semantic tokens. Không thay assets/video/iframe từ provider ngoài bằng filter đảo màu.
- Screenshot app thật desktop/mobile và preview browser headed để người dùng chốt; không tạo bitmap thay bản thử chức năng người dùng yêu cầu.

## 13. Quản trị hỗ trợ — mockup05 đã duyệt

- Desktop: sidebar quản trị; danh sách cuộc hỗ trợ; khung chat/admin trả lời; chi tiết, trạng thái và ghi chú nội bộ. Trên mobile chuyển từng vùng bằng điều hướng/back phù hợp, không ép bốn cột.
- Tái dùng FG tokens/Inter/navy/blue và controls44px, keyboard/focus; menu admin chỉ tài khoản có quyền. UI ẩn không thay kiểm quyền server. Không đưa notes nội bộ vào payload người dùng rồi ẩn CSS.
- Thông tin request nhất quán list/detail, unread/status từ server; loading/empty/error và gửi lỗi giữ draft, không fake success. Bot chỉ xác nhận nhận tin, tên admin mẫu trong ảnh không cấp quyền.
- Trang login chung bổ sung chấp nhận tên kingame theo AUTH-ADMIN-SINGLE checkpoint, giữ khung mockup04. Labels phải phản ánh “Email hoặc tên đăng nhập”, password không hiển thị mặc định.
- Form tạo/đổi/reset/thêm mật khẩu ghi rõ “8–128 ký tự, ít nhất một chữ hoa và một ký tự đặc biệt”; không trim/normalize, kiểm cùng policy server. Không áp composition rule khi login credential đã tồn tại để khóa user cũ; không thông báo chứa password/token.
- Screenshot thật desktop/mobile và headed E2E; duyệt ảnh05 không là evidence login/quyền admin/hỗ trợ đã hoạt động.
