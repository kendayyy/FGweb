# FG — Đặc tả sản phẩm

Ngày cập nhật: 07/10/2026.
Trạng thái: Đã phê duyệt chính thức (T00 Baseline). Người dùng đã chốt toàn bộ gói đề xuất kỹ thuật và nghiệp vụ vào ngày 04/10/2026.

Tên website đã chốt: **FG**. Người dùng đã duyệt phong cách ba mockup: giữ màu sắc, typography và bố cục khi build frontend. Hướng dẫn triển khai hình thức ở [02-frontend-design.md](./02-frontend-design.md); đây là tài liệu thiết kế đi cùng spec.

## 1. Mục tiêu và phạm vi ra mắt

Website dành cho game thủ Việt Nam, giải quyết hai nhu cầu có ưu tiên ngang nhau: tìm đội để chơi ngay và kết bạn để chơi lâu dài. Ra mắt cho cộng đồng thật, sử dụng miễn phí, chưa có quảng cáo hoặc gói trả phí.

Bản ra mắt đầu tiên gồm Bảng tin cộng đồng, Lobby, tìm đội, hồ sơ, kết bạn, nhắn riêng, phòng nhóm lâu dài, gọi thoại, chia sẻ màn hình, xem live ngoài, PWA và thông báo. Không tách gọi thoại/live sang đợt phát hành sau.

Hỗ trợ máy tính và điện thoại. Ưu tiên chi phí vận hành thấp nhất có thể; người dùng chưa chọn ngân sách tháng cố định và sẽ duyệt trần chi phí (cost ceiling) sau khi có số liệu dự toán đo được từ traffic/egress/TURN thực tế trước khi chạy các bài kiểm thử tải trả phí hoặc chi tiêu ở T41 (gate vận hành trì hoãn này không chặn T00/T01). Mục tiêu tải là 1.000 người đồng thời dùng gọi thoại hoặc xem live (1.000 media concurrent target), không chỉ 1.000 người mở website. Mục tiêu này bắt buộc phải được kiểm thử thực tế tại T41.

## 2. Game và Lobby

Danh mục 7 game chính thức đã được phê duyệt:

- Liên Minh Huyền Thoại.
- Valorant.
- Teamfight Tactics (TFT).
- Dota 2.
- Roblox.
- Liên Quân Mobile.
- Free Fire.

Mỗi game có một phòng chat chung tên **Lobby**, là nơi trung tâm để cộng đồng gặp nhau, tìm bạn chơi, bàn luận về game và tán gẫu. Phiên bản đầu không chia thêm các kênh theo chủ đề hoặc chế độ.

SIDEBAR-CHANGE-01 cập nhật (07/10/2026): người dùng bỏ yêu cầu toggle; danh mục bên trái luôn hẹp72px trên desktop/tablet, chỉ logo và tooltip tên, không nút mở rộng/thu gọn hoặc lưu lựa chọn rộng/hẹp. Giữ truy cập cả7 game; mobile dùng drawer. Không làm mất game/chat/dữ liệu nhập/session khi điều chỉnh bố cục; chi tiết và ảnh tham chiếu08 ở frontend-design mục6.

Người dùng chốt [mockup sidebar hẹp cố định — SIDEBAR-COMPACT-APPROVED](./mockups/08-sidebar-fixed-compact-preview.png) ngày07/10/2026. Đây là baseline bố cục sidebar mới, thay phương án toggle trước đó; chưa là bằng chứng code/kiểm thử hoàn thành.

GAME-LOGO-01 (07/10/2026): bổ sung logo chính thức tại điều hướng/chọn game và header Lobby theo yêu cầu người dùng, giữ tên game và thiết kế FG. Danh mục nguồn/trạng thái ảnh ở [game-logos/README.md](./game-logos/README.md); không đổi danh mục7 game hoặc contracts. Assets chưa tải được/chưa đủ điều kiện sử dụng dùng fallback có tên, không báo tích hợp thành công giả.

“+1 flex” chỉ là ví dụ tin nhắn tự do, không phải cú pháp hệ thống hoặc tên chức năng.

Lobby có:

- Tin chữ, emoji, ảnh, trả lời tin cụ thể và @nhắc tên.
- Cập nhật tin mới trực tiếp, lưu lịch sử, mở tại các tin gần nhất và cuộn lên xem tin cũ.
- Danh sách người online. Online/offline do hệ thống xác định, tách biệt với trạng thái tự chọn: Đang tìm đội, Đang chơi, Chỉ trò chuyện.
- Bấm tên/ảnh người gửi để xem hồ sơ, nhắn riêng trực tiếp hoặc gửi lời mời kết bạn.
- Khu vực thẻ tìm đội riêng cạnh chat trên máy tính. Điện thoại chuyển giữa chat và danh sách tìm đội.

Khách chưa đăng nhập được xem Lobby, chat chung và thẻ tìm đội. Đăng nhập mới được nhắn, tạo thẻ, xin vào đội hoặc kết bạn. Chat riêng, chat phòng nhóm và cuộc gọi không mở cho khách.

## 3. Tài khoản, hồ sơ và kết bạn

Giữ đăng nhập Discord và bổ sung đăng ký/đăng nhập email + mật khẩu bằng Better Auth theo AUTH-CHANGE-02 ở mục14. Phạm vi và bố cục auth mockup04 đã được người dùng chốt ngày07/10/2026.

Lần đầu đăng nhập, người dùng chọn biệt danh, ảnh đại diện và các game quan tâm rồi có thể vào Lobby. Có thể dùng ảnh từ tài khoản đăng nhập. Không bắt buộc hoàn thiện hồ sơ game trước khi chat hoặc tìm đội.

Hồ sơ gồm tên, ảnh, giới thiệu; thông tin riêng từng game gồm tên trong game, rank nếu có, vai trò, giờ chơi và phong cách chơi. Thông tin chi tiết và cơ chế riêng tư hồ sơ nâng cao tiếp tục được quy định cụ thể bởi API contracts và ACL ở các task tương ứng (như T04, T10). Chưa đưa đánh giá sau trận vào bản đầu.

Kết bạn cần hai bên đồng ý. Có nhắn riêng và mời bạn vào đội. Nhắn riêng không yêu cầu kết bạn trước.

Chức năng chặn: Chặn người dùng dừng gửi tin nhắn riêng (DM) mới và lời mời mới. Trong Lobby, nội dung tin nhắn từ người bị chặn bị ẩn cục bộ ở phía người chặn (locally hidden). Chặn không tự động kick người dùng khỏi phòng nhóm lâu dài hoặc xóa lịch sử chat cũ. Có chức năng báo cáo người dùng/tin nhắn vi phạm.

## 4. Tìm đội và lượt chơi

### Thẻ tìm đội

Thẻ hỗ trợ chơi ngay (`now`) hoặc hẹn giờ chơi sau (`scheduledAt`). Các trường chuẩn của thẻ gồm: `gameId`, chế độ chơi tự do (`mode` free-text), tiêu đề (`title`), tổng số người trong đội (`playerCapacity` - bao gồm cả chủ đội, ví dụ 5 cho đội 5 người), thời điểm (`now` hoặc `scheduledAt`), văn bản yêu cầu (`requirementText`). Riêng đối với game Roblox, bổ sung thêm tên trải nghiệm (`experienceName`) và đường dẫn (`experienceUrl`).

Rank và vai trò trên thẻ là yêu cầu tham khảo (advisory rank/role); không tạo hard gate ngăn người chưa đáp ứng gửi yêu cầu. Người dùng gửi yêu cầu, chủ đội xem hồ sơ rồi chấp nhận hoặc từ chối.

Danh sách tuyển đội ưu tiên hiển thị và gợi ý các thẻ tuyển công khai (`OPEN PUBLIC recruitments`) đúng game và chế độ chơi đang thiếu ít người nhất (gần đủ đội nhất). Sắp xếp danh sách cố định (stable tiebreak) dựa trên thời gian cập nhật `updatedAt` mới nhất và `id`.

### Tránh tuyển trùng khi chơi ngay

- Một người được giữ nhiều phòng nhóm lâu dài.
- Có thể gửi nhiều yêu cầu vào đội chơi ngay.
- Khi được nhận vào một đội chơi ngay, tự hủy các yêu cầu chơi ngay còn lại.
- Mỗi người chỉ tham gia hoặc tuyển cho một đội chơi ngay đang hoạt động (`active_play_slots`).
- Chủ đội bấm “Kết thúc buổi chơi” để kết thúc lượt chơi.
- Thành viên có thể tự rời lượt chơi mà vẫn giữ tư cách thành viên phòng.
- Kết thúc hoặc rời lượt chơi giải phóng người dùng để tìm/tuyển đội chơi ngay khác.

Quy tắc đội chơi ngay không được áp dụng cho việc chỉ vào xem live.

Đối với đội hẹn giờ (`scheduledAt`): những người chơi được duyệt sẽ giữ chỗ hẹn trong danh sách (reserve scheduled roster). Buổi chơi chỉ được bắt đầu khi chủ đội hoặc người hỗ trợ có quyền `MANAGE_RECRUITMENT` bấm bắt đầu (`start`) thủ công; thời gian đến giờ hẹn đơn thuần không tự động bắt đầu buổi chơi. Khi người có quyền bấm bắt đầu (`start`), hệ thống thực hiện phân bổ các suất hoạt động (`active_play_slots`) một cách nguyên tử (atomically). Nếu bất kỳ thành viên nào gặp xung đột (đang thuộc active play session khác), toàn bộ lệnh start bị hủy bỏ (abort) và không tự loại người dùng khỏi đội khác.

Thành viên bấm tham gia buổi chơi, chủ đội duyệt danh sách người thuộc đội chơi; người chỉ vào gọi hoặc xem live không được tính vào đội chơi.

## 5. Phòng nhóm lâu dài

Sau khi được nhận vào đội, thành viên có phòng chat riêng để trao đổi. Phòng và lịch sử chat được giữ sau buổi chơi để nhóm tiếp tục rủ nhau chơi.

Chủ phòng có thể đóng thẻ tuyển mà vẫn giữ phòng. Lần sau, chủ phòng tùy chọn tuyển thêm từ phòng cũ hoặc tạo đội/phòng mới.

Hai chế độ phòng:

| Chế độ | Khả năng tìm thấy và tham gia |
| --- | --- |
| Công khai | Có thể mở thẻ tuyển cạnh Lobby; người ngoài xin tham gia. Nội dung chat phòng chỉ thành viên xem. |
| Riêng | Không hiện trong danh sách tìm đội; nhận thành viên qua lời mời. Chuyển phòng sang chế độ riêng tư (`PRIVATE`) tự động đóng các thẻ tuyển công khai (`CLOSED`), bảo toàn danh sách thành viên và lịch sử chat. |

Phân quyền mời và tham gia:

- Mặc định quy trình tham gia là chủ phòng duyệt (`OWNER_APPROVAL`): thành viên mời bạn; người được mời đồng ý rồi chờ chủ phòng duyệt.
- Lời mời trực tiếp (`DIRECT_MEMBER`): người được mời đồng ý là vào phòng nếu còn chỗ.
- Lời mời từ chính chủ đội cần người được mời đồng ý. Phân biệt rõ lời mời vào phòng (`ROOM` invitation - chỉ cấp membership) và lời mời vào buổi chơi (`PLAY_SESSION` invitation - kiểm tra và cấp roster/active slot).

Sức chứa phòng lâu dài tối đa 50 thành viên (`max50`). Quy mô đội chơi (`playerCapacity`) do chủ phòng cấu hình từ 1 đến 10 thành viên (`owner roster 1-10`), hoàn toàn độc lập với giới hạn cuộc gọi.

Thành viên tự rời phòng. Chủ phòng muốn rời có thể chuyển quyền cho thành viên khác hoặc giải tán phòng. Nếu chỉ còn chủ phòng, rời phòng sẽ đóng phòng.

## 6. Nhóm gọi, mic và live

Trong phòng nhóm lâu dài, có thể tạo các nhóm gọi nhỏ cho những người cùng chơi. Một phòng có thể mở nhiều nhóm gọi đồng thời.

Chỉ thành viên phòng được vào nhóm gọi hoặc xem live. Bạn của nhóm chưa là thành viên cần được mời/nhận vào phòng trước.

Mỗi người dùng chỉ ở 1 nhóm gọi tại một thời điểm; muốn vào nhóm gọi khác phải rời nhóm gọi cũ trước (`leave old first`). Người xem không chiếm suất trong đội chơi, nhưng có tính vào giới hạn cuộc gọi. Người không chơi vẫn được dùng mic bình thường. Mỗi người tự bật/tắt mic; có thể chỉnh âm lượng hoặc tắt tiếng riêng từng người khác (local mute/volume adjustment), chỉ ảnh hưởng phía mình nghe.

Mỗi nhóm gọi:

- Tối đa 10 người, tính cả người chơi và người xem.
- Tối đa 3 người chia sẻ màn hình đồng thời.
- Người xem chọn một luồng chính và chuyển nhanh giữa các luồng đang phát (selected main video subscription).
- Live mặc định 720p, 30 FPS; tự giảm chất lượng khi mạng yếu, ưu tiên giữ âm thanh cuộc gọi ổn định.
- Tự đóng khi người cuối cùng chủ động rời đi (`explicit last leave`). Phòng lâu dài và lịch sử chat vẫn được giữ.
- Mất kết nối mạng bất ngờ có thời gian chờ (grace period) 30 giây để rejoin. Cơ chế ngắt nhịp (heartbeat) 15 giây, thời gian tồn tại trạng thái (presence TTL) 45 giây.

Hỗ trợ chia sẻ màn hình trực tiếp trong cuộc gọi và xem live YouTube/Twitch trong phòng:
- Tối đa 1 nguồn stream ngoài (YouTube/Twitch) per call do một thành viên hiện tại thiết lập. Mỗi người xem tự chọn tab xem phía trình duyệt của mình, không đồng bộ phát (no sync playback) và không relay qua SFU.
- Chia sẻ màn hình được hỗ trợ trên trình duyệt máy tính tương thích; điện thoại dùng mic và xem live, không yêu cầu phát màn hình trực tiếp từ PWA trong bản đầu.
- Không hỗ trợ camera, ghi hình cuộc gọi hoặc lưu trữ bản phát live.

Chủ phòng có thể ngắt mic, dừng chia sẻ màn hình hoặc đưa người ra khỏi cuộc gọi. Người bị ngắt mic cần được cho phép lại trước khi nói tiếp.

Chủ phòng có thể bổ nhiệm người hỗ trợ (helper), chọn riêng quyền quản lý chat, cuộc gọi, tuyển đội và thành viên. Chuyển quyền sở hữu và giải tán phòng dành riêng cho chủ phòng.

## 7. PWA và thông báo

Website có thể thêm/cài vào màn hình chính trên iPhone và Android tương thích, mở bằng biểu tượng riêng.

Trên iPhone, push yêu cầu iOS 16.4 trở lên và website đã thêm vào màn hình chính. Yêu cầu cấp quyền thông báo phải xuất phát từ thao tác của người dùng, ví dụ bấm “Bật thông báo”. Cài đặt website không thay thế quyền của hệ điều hành/trình duyệt.

Giữ cả thông báo trong website, push và email. Người dùng bật/tắt riêng từng kênh và loại thông báo. Không được mặc định coi việc đăng nhập hoặc cài PWA là đã cấp quyền push.

Danh sách thông báo chính thức được phê duyệt:

- In-app và Web Push: tin nhắn riêng, @nhắc tên, lời mời kết bạn, lời mời vào đội/phòng, yêu cầu vào đội và kết quả duyệt, nhắc lịch chơi.
- Email: lời mời (kết bạn, vào đội/phòng) và nhắc lịch chơi.
- Nhắc lịch chơi được gửi trước 10 phút (`reminder 10min`).
- Không gửi push hoặc email cho mọi tin nhắn trong Lobby.

Bấm thông báo mở nội dung/phòng liên quan theo quyền truy cập hiện tại.

## 8. Quản trị cộng đồng và tệp tải lên

Giai đoạn đầu, chủ website quản trị toàn bộ cộng đồng: nhận báo cáo, xử lý tin vi phạm và khóa tài khoản. Có chặn người dùng, báo cáo người dùng/tin nhắn và trang quản trị. Chưa phân công moderator theo game.

Quyền quản trị website tách biệt với quyền quản lý phòng do chủ phòng cấp. Chính sách kiểm duyệt biên tập nội dung và quy trình xử lý vi phạm chi tiết sẽ tiếp tục được hoàn thiện trong các task quản trị (như T37).

Quy định xử lý tập tin hình ảnh tải lên:
- Định dạng cho phép: JPG, PNG, WebP với dung lượng tối đa 5MiB và độ phân giải tối đa 20MP. Tất cả ảnh tải lên được tự động re-encode sang WebP.
- Phân quyền tập tin đính kèm chặt chẽ theo conversation access. Không hỗ trợ SVG hoặc GIF trong v1.

## 9. Chỉ số hiệu năng và Kịch bản nghiệm thu chính

### Chỉ số hiệu năng mục tiêu (Performance Targets)
- REST API response time: p95 < 500ms.
- Realtime chat delivery latency: p95 < 1s.
- Call join setup latency: p95 < 3s.
- Tỷ lệ lỗi hệ thống (Error rate): < 1%.
- Mất gói âm thanh cuộc gọi (Audio packet loss): < 2% trong bài kiểm thử tải; phải kiểm thử nghe âm thanh thực tế (actual audible quality test).
- Bảo toàn mục tiêu media: 1.000 người dùng đồng thời gọi/live (10 total/3 publishers/1 selected main stream/720p30).

### Kịch bản nghiệm thu chính
1. Khách xem Lobby và thẻ tuyển nhưng không thể gửi tin hoặc xin vào đội; chat riêng/phòng nhóm không bị lộ.
2. Đăng nhập bằng Discord hoặc email + mật khẩu đã xác minh, hoàn thành hồ sơ ban đầu rồi vào Lobby mà không bắt buộc khai rank.
3. Tin chat cập nhật trực tiếp; tải lịch sử, gửi ảnh, trả lời và @nhắc tên hoạt động đúng quyền.
4. Từ Lobby có thể xem hồ sơ, nhắn riêng chưa kết bạn, gửi/chấp nhận lời mời kết bạn và chặn/báo cáo.
5. Chủ đội duyệt yêu cầu dù hồ sơ không đáp ứng rank tham khảo; thẻ và số chỗ được cập nhật nhất quán.
6. Hai chủ đội duyệt cùng một người gần đồng thời không khiến người đó vào hai đội chơi ngay; yêu cầu còn lại được hủy.
7. Kết thúc/rời lượt chơi giải phóng trạng thái tìm đội nhưng không làm mất phòng nhóm hay lịch sử chat.
8. Phòng riêng không xuất hiện trong danh sách tuyển; người chưa là thành viên không xem được chat hoặc vào gọi/live.
9. Chủ phòng chuyển quyền rồi rời, hoặc giải tán; người hỗ trợ chỉ thực hiện được quyền đã cấp.
10. Một phòng mở nhiều nhóm gọi; mỗi nhóm không vượt 10 người hoặc 3 luồng màn hình; người xem không chiếm suất đội chơi.
11. Bật/tắt mic, âm lượng riêng, chuyển luồng, ngắt mic và dừng chia sẻ theo quyền hoạt động đúng; giảm chất lượng hình không làm mất ưu tiên âm thanh.
12. Nhóm gọi đóng khi người cuối cùng rời đi; mất mạng có 30s grace period để rejoin.
13. PWA, cấp/từ chối/thu hồi quyền push và tùy chọn email hoạt động trên thiết bị được hỗ trợ; không có quyền push vẫn dùng website bình thường.
14. Kiểm thử 1.000 người đồng thời dùng gọi/live với kịch bản số nhóm, số người phát, tỷ lệ xem, thời lượng và điều kiện mạng được xác định trong kế hoạch kỹ thuật T41. Chưa được kết luận đạt chỉ bằng thử chat hoặc mở 1.000 kết nối.

## 10. Quyết định baseline T00 và các cổng hoạt động tiếp theo

**Tech Stack đã phê duyệt:** Frontend (React, Vite, Tailwind CSS, Inter font self-host), Backend API (NestJS, Node24, TypeScript), Database (PostgreSQL, Drizzle ORM), Cache & Queue (Redis, BullMQ), Auth (Better Auth Discord provider), Realtime (Socket.IO), Media (Self-hosted LiveKit SFU), Worker/Delivery (Nodemailer SMTP, Web Push VAPID). Không bổ sung dịch vụ trả phí nếu chưa được người dùng chọn.

Các đề xuất kỹ thuật và nghiệp vụ cho T00 đã được người dùng phê duyệt chính thức ngày 04/10/2026. Danh mục các cổng chuẩn bị và hoạt động tiếp theo:
1. **T02 Setup Gate**: Đăng ký và cấu hình các thông số OAuth Client ID/Secret (Discord), SMTP server credentials, VAPID keys và PUBLIC_ORIGIN thực tế trước T02.
2. **T41 Operational Cost Gate**: Đo đạc lưu lượng thực tế, dự toán chi phí traffic/egress/TURN và trình người dùng phê duyệt trần chi phí (cost ceiling) trước khi thực hiện kiểm thử tải trả phí hoặc chi tiêu hạ tầng.
3. **Kế hoạch vận hành**: Thời điểm ra mắt chính thức và quy chế biên tập/kiểm duyệt nội dung cộng đồng sẽ do bộ phận vận hành chốt ở các giai đoạn sau; các chi tiết kỹ thuật cụ thể vẫn được định nghĩa bởi contracts và ACL từng task.
4. Tên FG và phong cách mockup đã được duyệt; áp dụng [02-frontend-design.md](./02-frontend-design.md) khi xây các màn hình chi tiết.

## 11. Nguồn xác minh khả năng nền tảng

- [Apple — Web Push trên website/web app](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).
- [WebKit — Push cho Home Screen web app và thao tác cấp quyền](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
- [MDN — Cài đặt PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
- [MDN — Dữ liệu tương thích getDisplayMedia](https://github.com/mdn/browser-compat-data/blob/main/api/MediaDevices.json).

Khả năng nền tảng được kiểm tra ngày 04/10/2026; cần kiểm tra lại khi triển khai và trên thiết bị thực tế.

## 12. Lịch sử thay đổi đã được chủ sản phẩm xác nhận

- 07/10/2026 — AUTH-PASSWORD-03: Người dùng đổi policy chung thành tối thiểu8 ký tự, có ít nhất1 chữ hoa và1 ký tự đặc biệt; tối đa128, không trim/normalize mật khẩu. Áp dụng khi tạo/đổi/reset/thêm mật khẩu, gồm provision kingame; ngoại lệ độ dài cũ không miễn yêu cầu ký tự đặc biệt. Email khôi phục admin đã được người dùng chỉ định riêng, không ghi địa chỉ trong tài liệu công khai. Chưa sửa code/provision trong checkpoint tài liệu.

- 07/10/2026 — SUPPORT-ADMIN-01: Người dùng duyệt mockup05, form góp ý/báo lỗi và chat hỗ trợ do admin trả lời; bot chỉ xác nhận nhận tin. Chỉ tài khoản kingame có admin, đăng nhập tại trang chung. Người dùng duyệt ngoại lệ độ dài khởi tạo, sau đó đổi policy chung qua AUTH-PASSWORD-03; policy mới áp dụng cả admin. Mật khẩu không ghi trong docs/logs. Chưa tạo tài khoản hoặc cấp quyền trong lần sửa tài liệu.

- 07/10/2026 — THEME-CHANGE-01: Người dùng duyệt kế hoạch bản xem trước sáng trên app FG thật, bộ chọn Sáng/Tối/Hệ thống và lưu trình duyệt; giữ chức năng API/DB hiện có, không giả Bảng tin/auth chưa triển khai. Checkpoint frontend chỉ bắt đầu sau task hiện tại PASS và rebaseline review. Hình thức light cần người dùng xem/chốt từ app và ảnh thật, không xem phê duyệt kế hoạch là duyệt ảnh chưa tồn tại.

- 07/10/2026 — AUTH-UI-APPROVAL-04: Người dùng xác nhận “tôi chốt mockup này” cho mockup04-login-desktop-mobile.png. Chốt bố cục đăng nhập email/mật khẩu + Discord trên desktop/mobile, giữ phong cách FG. Bên coding/build dùng ảnh04 theo task AUTH-CHANGE-02; duyệt ảnh không là PASS triển khai.

- 07/10/2026 — AUTH-CHANGE-02: Người dùng chốt thêm email/mật khẩu bên cạnh Discord; hash mật khẩu scrypt, xác minh email, reset/đổi mật khẩu, liên kết có xác minh và bảo vệ dữ liệu riêng. Thay giới hạn Discord-only của AUTH-CHANGE-01. Chỉ cập nhật tài liệu và tạo mockup04 để người dùng chốt bố cục; bên coding/build triển khai sau. Không chạy Antigravity, sửa runtime hoặc đánh PASS trong lần ghi tài liệu này.

- 07/10/2026 — TEST-VISIBILITY-01 (đã điều chỉnh): Chỉ UI tương tác trên ứng dụng và E2E local phải hiện cửa sổ browser/app headed để quan sát. Không cần hiện terminal/log; unit/component DOM giả lập, integration/API/DB/smoke/load được chạy nền. Mọi test vẫn lưu evidence và exit code thật. UI/E2E không có GUI phải báo hạn chế trước run. Quy trình cụ thể ở task.md và testing rule08; đây là tiêu chí phát triển, không thay tính năng runtime FG.

- 04/10/2026 — AUTH-CHANGE-01: Người dùng yêu cầu bỏ đăng nhập Google. FG chỉ hỗ trợ đăng nhập Discord; cập nhật T02, T08, T09 và nghiệm thu tương ứng. Better Auth, onboarding và session guard giữ theo phạm vi đã chốt. Client Secret không lưu trong tài liệu hoặc evidence.
- 07/10/2026 — FEED-CHANGE-01: Người dùng chốt Bảng tin cộng đồng chung, đăng chữ/ảnh, thích, bình luận/trả lời, lọc game/loại bài và liên hệ qua hồ sơ/DM. Người dùng xác nhận bố cục mockup 03 ổn và yêu cầu ghi tài liệu để coding/build triển khai, giữ màu sắc/phong cách FG đã duyệt. Thêm ba checkpoint trước T39; không đánh PASS hoặc thay bằng chứng các task cũ chỉ vì thay yêu cầu.

## 13. Bảng tin cộng đồng — FEED-CHANGE-01

### Phạm vi và bố cục đã duyệt

- Bảng tin chung cho toàn FG, ngang hàng với Lobby; desktop ở sidebar phía trên danh sách game, mobile thêm Bảng tin vào bottom navigation cùng Lobby/Bạn bè/Thông báo. Vẫn truy cập được Phòng của tôi và danh mục game.
- Nội dung gồm Tìm bạn chơi lâu dài, Chia sẻ khoảnh khắc và Thảo luận game. Lọc theo game và loại bài. Bảng tin bổ sung cho chat Lobby và thẻ tuyển buổi chơi, không thay các quy tắc tuyển đội/roster/phòng.
- Bản đầu gồm đăng chữ/ảnh, thích/bỏ thích, bình luận/trả lời bình luận, mở hồ sơ và nhắn riêng qua chức năng hiện có. Không thêm chia sẻ lại, theo dõi người đăng hoặc feed xếp hạng bằng thuật toán.
- [Mockup 03 — desktop/mobile](./mockups/03-community-feed-desktop-mobile.png) là baseline bố cục được người dùng duyệt ngày 07/10/2026. Giữ navy tối, accent xanh, Inter và design tokens FG. Khung trình bày, logo/ảnh/avatars/số liệu mẫu không là UI hoặc dữ liệu production.

### Mặc định triển khai để coding/build có hành vi rõ ràng

Các mục dưới là mặc định kỹ thuật cho bản đầu, không phải từng chi tiết đã được người dùng duyệt riêng trong mockup.

- Bài công khai: guest xem feed/bài/bình luận; đăng, thích, bình luận và liên hệ cần Discord login. Chỉ tài khoản hợp lệ, không bị ban được ghi. Giữ quyền hồ sơ/DM/block hiện có.
- Mỗi bài chọn một game trong danh mục và một loại `FIND_PLAYMATES` / `SHARE` / `DISCUSSION`. Nội dung plain text 1–5.000 ký tự sau trim; tối đa 4 ảnh. Không có trường tiêu đề bắt buộc; câu đầu có thể là tiêu đề như mockup. Áp dụng JPG/PNG/WebP, 5MiB/20MP và re-encode WebP hiện có.
- Feed mới nhất trước, cursor ổn định `(createdAt,id)`, 20 mục/lần; lọc game/loại bài ở server. Không dùng updatedAt để đưa bài chỉnh sửa lên đầu. Truy cập trực tiếp `/feed/posts/:id` được để mở bài/bình luận.
- Bình luận plain text 1–1.000 ký tự; trả lời một cấp với parent là bình luận gốc cùng bài. Không ảnh đính kèm bình luận; icon ảnh trong ô bình luận của mockup là chi tiết ảnh sinh, không tạo thêm scope.
- Chủ nội dung được sửa/xóa bài hoặc bình luận của mình; admin được xóa nội dung vi phạm qua report/audit. Xóa bài ẩn toàn bài, bình luận và ảnh; xóa bình luận gốc giữ placeholder để các trả lời hợp lệ vẫn đọc được. Không để endpoint/URL ảnh đọc lại nội dung đã xóa.
- Thích là một quan hệ duy nhất user/bài; PUT/DELETE idempotent, không đếm trùng khi retry hoặc hai tab. Không cho thích/bình luận bài đã xóa.
- Block ẩn bài/bình luận của người bị chặn ở phía người chặn như Lobby; không hứa đây là quyền riêng tư của bài công khai. Report bài/bình luận tích hợp quản trị website hiện có; chống spam theo cơ chế rate limit server của FG.
- V1 không thêm push/email hoặc loại thông báo riêng cho thích/bình luận. DM/kết bạn giữ chính sách thông báo hiện có. Không có yêu cầu socket realtime cho feed; cập nhật từ response thật và refetch, không fake counters/success.

### Nghiệm thu bổ sung

- Guest đọc được feed nhưng write bị từ chối; tài khoản khác không sửa/xóa nội dung ngoài quyền; ban, block và moderation có kiểm thử thật.
- Đăng chữ/ảnh, lọc, phân trang, thích/bỏ thích, bình luận/trả lời, sửa/xóa, hồ sơ/DM hoạt động từ API/DB thật; refresh giữ đúng dữ liệu, retry không nhân đôi lượt thích.
- UI có loading/empty/error/guest, giữ nội dung nhập khi gửi lỗi, không tràn 360px, keyboard/focus sử dụng được. Screenshot thật tại 1440×900, 1280×800, 390×844, 360×800 đối chiếu mockup 03.
- Bao gồm Bảng tin trong T39 hồi quy, T40 backup/restore, T41 tải API và T42 bàn giao; giữ nguyên yêu cầu voice/live/PWA/email và 1.000 media concurrent.

## 14. Đăng ký web và bảo mật — AUTH-CHANGE-02

- Giữ Discord; thêm đăng ký/đăng nhập email + mật khẩu, xác minh email, gửi lại xác minh, quên/reset/đổi mật khẩu. Tài khoản web phải xác minh email trước đăng nhập rồi dùng onboarding và đầy đủ FG như tài khoản Discord.
- Better Auth hash mật khẩu bằng scrypt với salt; không lưu mật khẩu gốc hoặc ghi vào log. Policy AUTH-PASSWORD-03:8–128 Unicode code points, ít nhất1 chữ hoa (Unicode Lu) và1 ký tự dấu câu/ký hiệu (Unicode P hoặc S, ví dụ !/@/#); khoảng trắng không tính là ký tự đặc biệt. Cho phép Unicode/khoảng trắng, không trim hoặc normalize mật khẩu. Cùng validation FE/BE khi tạo/đổi/reset/thêm mật khẩu và provision; server là nguồn enforce. Login kiểm hash hiện có, không áp composition policy mới để khóa user cũ; mật khẩu mới phải đáp ứng policy. Link xác minh24giờ, reset1giờ; server giới hạn gửi lại/thử đăng nhập.
- Không tự ghép identities vì trùng email. Người dùng đăng nhập tài khoản Discord hiện có, xác minh quyền sở hữu email rồi thêm mật khẩu, giữ userId/hồ sơ/bạn bè/phòng. Đăng ký email đã có trả thông báo chung không tiết lộ tài khoản. Flow thêm mật khẩu cần xác minh mới gắn với session/user hiện tại, không chỉ dựa emailVerified cũ.
- Đổi mật khẩu yêu cầu mật khẩu hiện tại; reset thành công thu hồi phiên cũ. Token hết hạn/đã dùng không được tái sử dụng. Ban và quyền session áp dụng cả hai phương thức.
- DTO riêng của chủ tài khoản cho phép discordId=null; bỏ yêu cầu mọi user có Discord. Email chỉ trả chủ tài khoản qua API bảo vệ, public profile không lộ email/provider IDs/tokens/hash.
- Thông tin cần đọc lại không hash một chiều: dùng HTTPS, kiểm quyền, mã hóa lưu trữ/backup và che thông tin nhạy cảm khỏi log/API công khai. Bản này không mã hóa riêng từng trường trong DB. T40 cần evidence mã hóa disk/backup và restore, không coi cấu hình văn bản là đã bảo mật thực tế.
- Email xác minh/reset dùng SMTP thật; thiếu SMTP hoặc địa chỉ test được người dùng chỉ định thì báo blocker phần delivery, không fake sent. Mail auth bắt buộc không phụ thuộc opt-out email thông báo cộng đồng.
- Giao diện gồm đăng ký, xác minh/gửi lại, quên/reset/đổi mật khẩu và thêm mật khẩu cho Discord. Các CTA đăng nhập mở trang chọn phương thức; giữ phong cách FG. Mockup04 được người dùng chốt ngày07/10/2026, là baseline bố cục đăng nhập desktop/mobile cho coding/build.
- Acceptance: API/DB thật kiểm luồng chính, email trùng, token replay/expired, sai mật khẩu/rate limit, ban/revoke và chống chiếm tài khoản; kiểm DB chứa salted hash (hai user cùng mật khẩu hash khác), không mật khẩu gốc; migration giữ dữ liệu Discord. UI/E2E local headed, mọi test có evidence/exit code thật. T39/T42 kiểm cả hai phương thức.

## 15. Sáng / Tối / Hệ thống — THEME-CHANGE-01

- Áp dụng app FG hiện có và các màn mới khi triển khai, gồm header/login/Lobby/phòng. Bộ chọn ba giá trị `light`/`dark`/`system`, mặc định system, lưu trên trình duyệt, không đồng bộ tài khoản hoặc thêm API/migration.
- THEME-VISUAL-02 (07/10/2026): người dùng chốt [light Xám khói](./mockups/fg-light-smoke-approved.png), thay phương án trắng kem sau review app quá chói. Giữ Inter, CTA xanh tiết chế, sidebar hẹp đã chốt và bố cục chat/tuyển đội. Người dùng cũng chốt [Dark Xám khói](./mockups/fg-dark-smoke-approved.png) ngày07/10/2026; cả hai theme trở thành hướng hình thức đã duyệt. Bộ chọn giao diện đang được thiết kế thêm theo yêu cầu mới, phải giữ đủ Sáng/Tối/Hệ thống. Runtime chỉ cập nhật qua checkpoint/migration có review và kiểm thử thật. Duyệt ảnh không thay review/kiểm thử app thật hoặc task PASS.
- Chọn light/dark cố định; system theo prefers-color-scheme và thay đổi thiết bị trong phiên. Lưu key `fg.theme`; chỉ nhận ba giá trị. Storage bị chặn/giá trị sai thì khởi tạo system; vẫn đổi được trong phiên. Storage event đồng bộ tabs, xóa key trở về system. Áp dụng data-theme và color-scheme trước paint để tránh flash sai màu.
- Nút header và trang login mở bộ chọn nhãn tiếng Việt, thể hiện lựa chọn đã lưu, dùng keyboard/Escape/focus/44px. Đổi màu không remount app, mất composer, auth session hoặc ngắt socket/call.
- Preview dùng API/DB thật hiện có; chưa có Bảng tin hoặc email auth thì không dựng success/data giả. Thiếu service/credential hoặc quan sát UI không được phải ghi rõ; không coi UI đổi màu là mọi tính năng FG đã PASS.
- Acceptance: ba chế độ/reload/device change/multi-tab/storage failure, keyboard, tương phản chữ4.5:1 và controls/focus3:1, mobile360px no overflow, không mất dữ liệu nhập/session. UI/E2E local headed; ảnh thật1440/1280/390/360 và user review light trước chốt hình thức.

## 16. Góp ý, chat hỗ trợ và admin duy nhất — SUPPORT-ADMIN-01

- Mở rộng quản trị FG hiện có. Người dùng gửi form Góp ý/Báo lỗi hoặc chat riêng với admin; hệ thống chỉ xác nhận tin đã được lưu, không AI tự trả lời hay hứa thời gian giải quyết. Dữ liệu private theo người gửi và admin; không lộ ghi chú nội bộ cho người dùng.
- Mục Góp ý & Hỗ trợ ở cuối sidebar desktop/menu tài khoản mobile; admin có hộp thư, số tin chưa đọc, trạng thái Mới/Đang xử lý/Đã giải quyết, ghi chú nội bộ và lịch sử xử lý. Chỉ báo trạng thái online khi có presence thật. Hành vi guest cần chốt trong checkpoint contracts; không tự mở guest chat/đọc lịch sử private từ link login.
- [Mockup05 quản trị hỗ trợ](./mockups/05-admin-support-desktop.png) được người dùng duyệt ngày07/10/2026. Giữ FG navy/blue/Inter/tokens; dữ liệu mẫu, tên MinhAnh và số liệu không là tài khoản hay quyền thật. Khi build cùng request phải cùng trạng thái ở list/detail. Mockup05 là admin dark, không phải duyệt theme light.
- Chỉ tài khoản quản trị `kingame` được cấp quyền admin website. Đăng nhập từ trang chung bằng tên đăng nhập kingame và mật khẩu; tên này được provision riêng, không cho người dùng tự đăng ký/đổi sang nó. Không cấp quyền dựa trên displayName/username/email nhập từ client.
- Quyền gắn với duy nhất userId bất biến của kingame trong ADMIN_USER_IDS server. Coding/build phải enforce đúng một ID và bỏ đường cấp quyền ADMIN_DISCORD_IDS/nhiều IDs cho policy mới, không chỉ thêm kingame vào allowlist cũ. Account Discord khác, user thường, helper phòng không được admin; không tự liên kết Discord vào kingame trong scope này.
- Provision server-side idempotent sau checkpoint được phép: không mật khẩu hardcoded/default fallback, không secrets trong repo/docs/logs/browser. Mật khẩu đầu vào từ kênh cấu hình local bảo mật, lưu salted scrypt hash Better Auth. Không dùng hash thường/SHA256 thay password hash; hash không ngăn đoán mật khẩu online, vẫn cần rate limit và kiểm session/ban. Không xuất hash ra API.
- Policy mới8–128/chữ hoa/ký tự đặc biệt áp dụng cả kingame. Ngoại lệ độ dài được duyệt trước đó không cho phép thiếu ký tự đặc biệt; mật khẩu khởi tạo đã chỉ định chưa đáp ứng composition mới, cần người dùng đặt mật khẩu đáp ứng qua cấu hình local bảo mật trước provision. Email sở hữu/khôi phục admin đã được cung cấp riêng; cấu hình server-only, không ghi trong docs/logs/repo. Không dùng email giả hoặc tự đặt emailVerified=true để vượt xác minh; chưa có provisioning evidence thì chưa có tài khoản hoạt động.
- Sau triển khai, kingame đăng nhập → menu Quản trị → /admin. Menu chỉ hiện admin; URL có thể được biết nhưng server từ chối khách/user/helper trên mọi API và realtime. Không cache dữ liệu admin ra guest/user. Đăng xuất, ban hoặc thu hồi quyền phải ngắt subscription, chặn request kế tiếp và clear dữ liệu nhạy cảm ở client.
- Acceptance: admin login có thể thao tác; guest/user/helper/direct URL/cross-user requests bị từ chối, client sửa role/name không nâng quyền; user chỉ xem yêu cầu của mình, ghi chú nội bộ private; nhiều ID hoặc Discord allowlist không cấp thêm admin. UI/E2E headed và API/DB thật; chưa có trang/tài khoản/provision evidence thì không tuyên bố đăng nhập admin dùng được.
