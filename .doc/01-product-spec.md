# FG — Đặc tả sản phẩm

Ngày cập nhật: 04/10/2026.
Trạng thái: Bản nháp để cùng chủ sản phẩm hoàn thiện. Các mục ghi “cần chốt” chưa phải yêu cầu đã được phê duyệt.

Tên website đã chốt: **FG**. Người dùng đã duyệt phong cách hai mockup: giữ màu sắc, typography và bố cục khi build frontend. Hướng dẫn triển khai hình thức ở [02-frontend-design.md](./02-frontend-design.md); đây là tài liệu thiết kế đi cùng spec.

## 1. Mục tiêu và phạm vi ra mắt

Website dành cho game thủ Việt Nam, giải quyết hai nhu cầu có ưu tiên ngang nhau: tìm đội để chơi ngay và kết bạn để chơi lâu dài. Ra mắt cho cộng đồng thật, sử dụng miễn phí, chưa có quảng cáo hoặc gói trả phí.

Bản ra mắt đầu tiên gồm Lobby, tìm đội, hồ sơ, kết bạn, nhắn riêng, phòng nhóm lâu dài, gọi thoại, chia sẻ màn hình, xem live ngoài, PWA và thông báo. Không tách gọi thoại/live sang đợt phát hành sau.

Hỗ trợ máy tính và điện thoại. Ưu tiên chi phí vận hành thấp nhất có thể; chưa có ngân sách tháng cố định. Mục tiêu tải là 1.000 người đồng thời dùng gọi thoại hoặc xem live, không chỉ 1.000 người mở website. Mục tiêu này phải được kiểm thử; chưa có xác nhận khả năng đáp ứng hoặc dự toán hạ tầng.

## 2. Game và Lobby

Các game ban đầu:

- Liên Minh Huyền Thoại.
- Valorant.
- Teamfight Tactics (TFT).
- Dota 2.
- Roblox.
- Liên Quân Mobile.
- Free Fire.

Tên TFT và Dota 2 được chuẩn hóa từ cách gọi trong trao đổi; cần xác nhận khi chốt danh mục game chính thức.

Mỗi game có một phòng chat chung tên **Lobby**, là nơi trung tâm để cộng đồng gặp nhau, tìm bạn chơi, bàn luận về game và tán gẫu. Phiên bản đầu không chia thêm các kênh theo chủ đề hoặc chế độ.

“+1 flex” chỉ là ví dụ tin nhắn tự do, không phải cú pháp hệ thống hoặc tên chức năng.

Lobby có:

- Tin chữ, emoji, ảnh, trả lời tin cụ thể và @nhắc tên.
- Cập nhật tin mới trực tiếp, lưu lịch sử, mở tại các tin gần nhất và cuộn lên xem tin cũ.
- Danh sách người online. Online/offline do hệ thống xác định, tách biệt với trạng thái tự chọn: Đang tìm đội, Đang chơi, Chỉ trò chuyện.
- Bấm tên/ảnh người gửi để xem hồ sơ, nhắn riêng trực tiếp hoặc gửi lời mời kết bạn.
- Khu vực thẻ tìm đội riêng cạnh chat trên máy tính. Điện thoại chuyển giữa chat và danh sách tìm đội.

Khách chưa đăng nhập được xem Lobby, chat chung và thẻ tìm đội. Đăng nhập mới được nhắn, tạo thẻ, xin vào đội hoặc kết bạn. Chat riêng, chat phòng nhóm và cuộc gọi không mở cho khách.

## 3. Tài khoản, hồ sơ và kết bạn

Đăng nhập bằng Google và Discord.

Lần đầu đăng nhập, người dùng chọn biệt danh, ảnh đại diện và các game quan tâm rồi có thể vào Lobby. Có thể dùng ảnh từ tài khoản đăng nhập. Không bắt buộc hoàn thiện hồ sơ game trước khi chat hoặc tìm đội.

Hồ sơ gồm tên, ảnh, giới thiệu; thông tin riêng từng game gồm tên trong game, rank nếu có, vai trò, giờ chơi và phong cách chơi. Thông tin bổ sung sau. Chưa đưa đánh giá sau trận vào bản đầu.

Kết bạn cần hai bên đồng ý. Có nhắn riêng và mời bạn vào đội. Nhắn riêng không yêu cầu kết bạn trước. Có chức năng chặn và báo cáo.

## 4. Tìm đội và lượt chơi

### Thẻ tìm đội

Thẻ hỗ trợ chơi ngay hoặc hẹn giờ chơi sau. Thẻ thể hiện chủ đội, game, chế độ/nội dung muốn chơi, số người cần và yêu cầu tham gia. Chi tiết trường theo từng game cần được đặc tả tiếp; Roblox cần làm rõ trò chơi cụ thể bên trong Roblox.

Người dùng gửi yêu cầu, chủ đội xem hồ sơ rồi chấp nhận hoặc từ chối. Rank/vai trò trên thẻ là yêu cầu tham khảo; không ngăn người chưa đáp ứng gửi yêu cầu.

Ưu tiên giúp người chơi tìm đội phù hợp đang thiếu người trước khi tạo lượt tuyển mới. Cách tính độ phù hợp và sắp xếp danh sách cần chốt.

### Tránh tuyển trùng khi chơi ngay

- Một người được giữ nhiều phòng nhóm lâu dài.
- Có thể gửi nhiều yêu cầu vào đội chơi ngay.
- Khi được nhận vào một đội chơi ngay, tự hủy các yêu cầu chơi ngay còn lại.
- Mỗi người chỉ tham gia hoặc tuyển cho một đội chơi ngay đang hoạt động.
- Chủ đội bấm “Kết thúc buổi chơi” để kết thúc lượt chơi.
- Thành viên có thể tự rời lượt chơi mà vẫn giữ tư cách thành viên phòng.
- Kết thúc hoặc rời lượt chơi giải phóng người dùng để tìm/tuyển đội chơi ngay khác.

Quy tắc đội chơi ngay không được áp dụng cho việc chỉ vào xem live. Cách chuyển đội hẹn giờ sang lượt chơi đang hoạt động cần chốt.

Đã xác nhận trong trao đổi tiếp theo: thành viên bấm tham gia buổi chơi, chủ đội duyệt danh sách người thuộc đội chơi; người chỉ vào gọi hoặc xem live không được tính vào đội chơi.

## 5. Phòng nhóm lâu dài

Sau khi được nhận vào đội, thành viên có phòng chat riêng để trao đổi. Phòng và lịch sử chat được giữ sau buổi chơi để nhóm tiếp tục rủ nhau chơi.

Chủ phòng có thể đóng thẻ tuyển mà vẫn giữ phòng. Lần sau, chủ phòng tùy chọn tuyển thêm từ phòng cũ hoặc tạo đội/phòng mới.

Hai chế độ phòng:

| Chế độ | Khả năng tìm thấy và tham gia |
| --- | --- |
| Công khai | Có thể mở thẻ tuyển cạnh Lobby; người ngoài xin tham gia. Nội dung chat phòng chỉ thành viên xem. |
| Riêng | Không hiện trong danh sách tìm đội; nhận thành viên qua lời mời. |

Chuyển công khai/riêng và tự đóng thẻ tuyển khi chuyển sang riêng là đề xuất trong trao đổi, chưa được xác nhận riêng.

Chủ phòng cấu hình quyền mời:

- Chủ phòng duyệt: thành viên mời bạn; người được mời đồng ý rồi chờ chủ phòng duyệt.
- Thành viên được mời trực tiếp: người được mời đồng ý là vào đội nếu còn chỗ.

Mặc định chủ phòng duyệt là đề xuất, cần xác nhận. Lời mời từ chính chủ đội cần người được mời đồng ý; tác động tới giới hạn đội chơi ngay phải được kiểm tra.

Thành viên tự rời phòng. Chủ phòng muốn rời có thể chuyển quyền cho thành viên khác hoặc giải tán phòng. Nếu chỉ còn chủ phòng, rời phòng sẽ đóng phòng.

Số thành viên tối đa của phòng lâu dài chưa được chốt; không đồng nhất với giới hạn 10 người của cuộc gọi.

## 6. Nhóm gọi, mic và live

Trong phòng nhóm lâu dài, có thể tạo các nhóm gọi nhỏ cho những người cùng chơi. Một phòng có thể mở nhiều nhóm gọi đồng thời.

Chỉ thành viên phòng được vào nhóm gọi hoặc xem live. Bạn của nhóm chưa là thành viên cần được mời/nhận vào phòng trước.

Người xem không chiếm suất trong đội chơi, nhưng có tính vào giới hạn cuộc gọi. Người không chơi vẫn được dùng mic bình thường. Mỗi người tự bật/tắt mic; có thể chỉnh âm lượng hoặc tắt tiếng riêng từng người khác, chỉ ảnh hưởng phía mình nghe.

Mỗi nhóm gọi:

- Tối đa 10 người, tính cả người chơi và người xem.
- Tối đa 3 người chia sẻ màn hình đồng thời.
- Người xem chọn một luồng chính và chuyển nhanh giữa các luồng đang phát.
- Live mặc định 720p, 30 FPS; tự giảm chất lượng khi mạng yếu, ưu tiên giữ âm thanh cuộc gọi ổn định.
- Tự đóng khi người cuối cùng rời đi. Phòng lâu dài và lịch sử chat vẫn được giữ.

Hỗ trợ cả chia sẻ màn hình trực tiếp trong cuộc gọi và xem live YouTube/Twitch trong phòng. Chia sẻ màn hình được hỗ trợ trên trình duyệt máy tính tương thích; điện thoại dùng mic và xem live, không yêu cầu phát màn hình trực tiếp từ PWA trong bản đầu.

Chủ phòng có thể ngắt mic, dừng chia sẻ màn hình hoặc đưa người ra khỏi cuộc gọi. Người bị ngắt mic cần được cho phép lại trước khi nói tiếp.

Chủ phòng có thể bổ nhiệm người hỗ trợ, chọn riêng quyền quản lý chat, cuộc gọi, tuyển đội và thành viên. Chuyển quyền sở hữu và giải tán phòng dành cho chủ phòng.

Cách xác định team chơi theo danh sách xin tham gia và được chủ đội duyệt đã được xác nhận. Cần chốt: quy tắc rời/mất kết nối và vào lại; quyền đưa live ngoài vào phòng và cách chọn live ngoài so với màn hình đang phát. Chưa yêu cầu camera, ghi hình cuộc gọi hoặc lưu bản phát live.

## 7. PWA và thông báo

Website có thể thêm/cài vào màn hình chính trên iPhone và Android tương thích, mở bằng biểu tượng riêng.

Trên iPhone, push yêu cầu iOS 16.4 trở lên và website đã thêm vào màn hình chính. Yêu cầu cấp quyền thông báo phải xuất phát từ thao tác của người dùng, ví dụ bấm “Bật thông báo”. Cài đặt website không thay thế quyền của hệ điều hành/trình duyệt.

Giữ cả thông báo trong website, push và email. Người dùng bật/tắt riêng từng kênh và loại thông báo. Không được mặc định coi việc đăng nhập hoặc cài PWA là đã cấp quyền push.

Đề xuất nhóm thông báo, cần xác nhận danh sách cuối:

- Tin nhắn riêng và @nhắc tên.
- Lời mời kết bạn, lời mời vào đội.
- Yêu cầu vào đội và kết quả duyệt.
- Nhắc lịch chơi.

Đề xuất không gửi push cho mọi tin chat Lobby. Email đề xuất tập trung lời mời và lịch chơi. Bấm thông báo mở nội dung/phòng liên quan theo quyền truy cập hiện tại.

## 8. Quản trị cộng đồng

Giai đoạn đầu, chủ website quản trị toàn bộ cộng đồng: nhận báo cáo, xử lý tin vi phạm và khóa tài khoản. Có chặn người dùng, báo cáo người dùng/tin nhắn và trang quản trị. Chưa phân công moderator theo game.

Quyền quản trị website tách biệt với quyền quản lý phòng do chủ phòng cấp. Quy tắc vi phạm, mức khóa, cách chặn ảnh hưởng chat chung và quy trình xử lý báo cáo cần đặc tả tiếp.

## 9. Kịch bản nghiệm thu chính

1. Khách xem Lobby và thẻ tuyển nhưng không thể gửi tin hoặc xin vào đội; chat riêng/phòng nhóm không bị lộ.
2. Đăng nhập bằng Google/Discord, hoàn thành hồ sơ ban đầu rồi vào Lobby mà không bắt buộc khai rank.
3. Tin chat cập nhật trực tiếp; tải lịch sử, gửi ảnh, trả lời và @nhắc tên hoạt động đúng quyền.
4. Từ Lobby có thể xem hồ sơ, nhắn riêng chưa kết bạn, gửi/chấp nhận lời mời kết bạn và chặn/báo cáo.
5. Chủ đội duyệt yêu cầu dù hồ sơ không đáp ứng rank tham khảo; thẻ và số chỗ được cập nhật nhất quán.
6. Hai chủ đội duyệt cùng một người gần đồng thời không khiến người đó vào hai đội chơi ngay; yêu cầu còn lại được hủy.
7. Kết thúc/rời lượt chơi giải phóng trạng thái tìm đội nhưng không làm mất phòng nhóm hay lịch sử chat.
8. Phòng riêng không xuất hiện trong danh sách tuyển; người chưa là thành viên không xem được chat hoặc vào gọi/live.
9. Chủ phòng chuyển quyền rồi rời, hoặc giải tán; người hỗ trợ chỉ thực hiện được quyền đã cấp.
10. Một phòng mở nhiều nhóm gọi; mỗi nhóm không vượt 10 người hoặc 3 luồng màn hình; người xem không chiếm suất đội chơi.
11. Bật/tắt mic, âm lượng riêng, chuyển luồng, ngắt mic và dừng chia sẻ theo quyền hoạt động đúng; giảm chất lượng hình không làm mất ưu tiên âm thanh.
12. Nhóm gọi đóng khi trống; hành vi mất kết nối phải được chốt trước khi kiểm thử tiêu chí này.
13. PWA, cấp/từ chối/thu hồi quyền push và tùy chọn email hoạt động trên thiết bị được hỗ trợ; không có quyền push vẫn dùng website bình thường.
14. Kiểm thử 1.000 người đồng thời dùng gọi/live với kịch bản số nhóm, số người phát, tỷ lệ xem, thời lượng và điều kiện mạng được xác định trong kế hoạch kỹ thuật. Chưa được kết luận đạt chỉ bằng thử chat hoặc mở 1.000 kết nối.

## 10. Các quyết định tiếp theo

- Hoàn thiện quy tắc đội hẹn giờ và mất kết nối; danh sách team chơi do chủ đội duyệt đã được chốt.
- Chốt các trường thẻ theo từng game, sức chứa phòng lâu dài và sắp xếp đội phù hợp.
- Xác nhận các đề xuất mặc định còn đánh dấu ở trên; chốt quyền riêng tư hồ sơ và hành vi chặn.
- Chốt kịch bản tải gọi/live, tiêu chí hiệu năng và dự toán vận hành; chọn kiến trúc sau đó.
- Chốt thời điểm ra mắt và tiêu chí thành công của thử nghiệm cộng đồng.
- Tên FG và phong cách mockup đã được duyệt; áp dụng 02-frontend-design.md khi xây các màn hình chi tiết.

## 11. Nguồn xác minh khả năng nền tảng

- [Apple — Web Push trên website/web app](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).
- [WebKit — Push cho Home Screen web app và thao tác cấp quyền](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
- [MDN — Cài đặt PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
- [MDN — Dữ liệu tương thích getDisplayMedia](https://github.com/mdn/browser-compat-data/blob/main/api/MediaDevices.json).

Khả năng nền tảng được kiểm tra ngày 04/10/2026; cần kiểm tra lại khi triển khai và trên thiết bị thực tế.
