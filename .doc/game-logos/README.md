# FG — Nguồn logo game (GAME-LOGO-01)

Người dùng yêu cầu tìm và gắn logo game ngày 07/10/2026. Thư mục này chứa tài liệu/ảnh gốc tham chiếu, chưa phải assets được tích hợp vào ứng dụng. Task LIGHT01-FE đang IN_PROGRESS khi chuẩn bị; không sửa runtime hoặc ledger song song.

## Danh mục và nguồn

| Game | Tệp tham chiếu | Nguồn chính thức | Trạng thái |
| --- | --- | --- | --- |
| Liên Minh Huyền Thoại | [league-of-legends.png](./league-of-legends.png) | [Riot Press](https://www.riotgames.com/en/press) | Đã tải PNG gốc; wordmark ngang, không crop thành biểu tượng L giả |
| Valorant | [valorant.png](./valorant.png), valorant-original.zip | [Riot Press](https://www.riotgames.com/en/press) | Đã lấy logomark đỏ từ ZIP gốc |
| Teamfight Tactics | [tft-dark.png](./tft-dark.png), [tft-light.png](./tft-light.png), tft-original.zip | [Riot Press](https://www.riotgames.com/en/press) | Logomark trắng cho dark, đen cho light |
| Dota 2 | [dota-2-user.png](./dota-2-user.png) | Người dùng cung cấp ngày07/10/2026; website hãng: [Dota 2](https://www.dota2.com/home) | Đã lưu nguyên ảnh800×800. PNG RGB24, không có alpha: nền ô caro nằm trong ảnh, không phải trong suốt. Cần bản tách nền/asset trong suốt trước tích hợp để giữ hình thức FG; không còn thiếu ảnh tham chiếu do CDN |
| Roblox | roblox-white.png, roblox-black.png, roblox-original.zip | [Press Kit](https://about.roblox.com/press-kit) và [Community Usage Guidelines](https://en.help.roblox.com/hc/en-us/articles/115001708126-Roblox-Name-and-Logo-Community-Usage-Guidelines) | Người dùng xác nhận quyền sử dụng cho FG ngày07/10/2026 và yêu cầu đưa vào mockup. Ghi nhận theo xác nhận của người dùng, không tuyên bố đã xác minh giấy phép từ hãng; không tự thay bằng badge quảng bá Experience |
| Liên Quân Mobile | [lien-quan-mobile.png](./lien-quan-mobile.png) | [Garena Liên Quân](https://lienquan.garena.vn/), ảnh https://lienquan.garena.vn/wp-content/uploads/2024/02/logo.png | Đã tải logo từ header chính thức |
| Free Fire | [free-fire.svg](./free-fire.svg) | [Garena Free Fire](https://ff.garena.com/en/) | SVG logo trích nguyên từ header trang chính thức; PNG CDN không tải được |

ZIP chỉ lưu gói nguồn thiết kế. Không đưa ZIP, __MACOSX hoặc toàn bộ thư mục này vào frontend bundle. Có nguồn chính thức không tự đồng nghĩa đã được cấp phép cho FG; coding/build kiểm điều kiện sử dụng của từng hãng trước tích hợp/publication.

## Vị trí tích hợp đã yêu cầu

- Thay chữ viết tắt trong sidebar game và tay cầm ở header Lobby bằng logo đúng game; giữ tên game, tooltip, focus và hành vi chọn game.
- Dùng cùng mapping theo enum GameTitle ở onboarding/chọn game quan tâm, hồ sơ và bộ lọc Bảng tin khi các màn tương ứng được build. Không đổi gameId/API/schema chỉ để thêm hình.
- Assets runtime sau kiểm tra đặt trong code/apps/web/public/game-logos/; không hotlink CDN. Giữ nguyên tỷ lệ/màu logo, object-fit contain, không kéo giãn/crop/filter đảo màu. Logo ngang cần khung rộng đủ đọc, hoặc biểu tượng chính thức được xác minh; không tự vẽ lại logo.
- Logo bên cạnh tên dùng alt rỗng để tránh đọc lặp; nút chỉ hình phải có accessible name. Ảnh lỗi giữ tên/biểu tượng fallback, không làm mất chọn game. Hit area mobile ít nhất44px.
- Dota2 đã có ảnh người dùng cung cấp nhưng còn nền caro; bản mockup06 thể hiện hình thức bỏ nền, không phải asset tách nền production. Roblox được dùng trong mockup theo xác nhận quyền sử dụng của người dùng. Ghi đúng trạng thái triển khai, không tuyên bố đủ7 logo đã gắn vào app.

## Mockup xem trước

Người dùng chốt [sidebar hẹp cố định — SIDEBAR-COMPACT-APPROVED](../mockups/08-sidebar-fixed-compact-preview.png) ngày07/10/2026. Lấy bản này làm baseline bố cục danh mục: luôn hẹp, không toggle, logo nhỏ/tooltip. Các bản06/07 bên dưới là lịch sử đề xuất; không ghi đè quyết định cuối hoặc dùng logo ảnh AI thay assets gốc.

[06 — Lobby có7 logo, desktop/mobile](../mockups/06-game-logos-lobby-desktop-mobile.png), tạo ngày07/10/2026 theo yêu cầu người dùng; đang chờ duyệt. Giữ dark/bố cục FG, dùng Dota2 đang chọn. Đây là ảnh AI minh họa, không phải bằng chứng code/API/E2E hoặc nguồn logo production; không lấy chữ/chi tiết logo AI để thay assets gốc. Dữ liệu/rank/ảnh/tin nhắn trong mockup là mẫu. Giữ wordmark FG chuẩn theo design khi build, không thêm tagline từ ảnh.

## SHA256 nguồn tham chiếu

| Tệp | SHA256 |
| --- | --- |
| league-of-legends.png | 24E91CC3B3E467846D84D17A91A5098DF2D5334CCA0006A1E7DD430772AC5B06 |
| valorant.png | 8B0272456D153A79399A777333CA0489CF24447297CAE1B3127A6DFC8BCEB033 |
| tft-dark.png | 93732AFEFF79A5870D5474C3C4255771B579B55E1C19A6959037347C4CB84F94 |
| tft-light.png | 751B5B451954F8C4E94CEFD4A1B64B3F63436C5E111588D13FE78ABC7732D117 |
| lien-quan-mobile.png | 5BB9EA15E98EF94B72424C5430DC3D051034ED382C89E01F137BA2A46489DE69 |
| free-fire.svg | 7AA9F4002EAA0A17250CA527858877202DE57EFF0A16358EB957763B13DDEDC5 |
| dota-2-user.png | EC6F98A26246167F177BA34ACF6DA82D1BAFB2939BBA916AAB98E580076C0A3B |
| roblox-white.png | 65BE7E3DE66CA26921B7E1411B7A83B7168DC091F6A82D6E8F743152150740BA |
| roblox-black.png | A7F6C6109AC8E76A017AE57BAE8957528C4A2BFD2FCF13482F6C3417E8990EA3 |

Không có UI/E2E run hoặc bằng chứng tích hợp app trong lần chuẩn bị này.
