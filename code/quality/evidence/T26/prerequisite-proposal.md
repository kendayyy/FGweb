# T26 — quyết định admission cho LiveKit self-hosted

## Kết quả kiểm chứng

T25 đã PASS. T26 đã có 10 kiểm thử HTTP/PostgreSQL RED thực sự: endpoint calls chưa tồn tại, nhận404 thay vì201. Chưa viết logic production calls.

Probe riêng trên image đã khóa `livekit/livekit-server:v1.8.4` kết nối báo hiệu native, nhận JoinResponse, được SFU liệt kê là một participant. Sau RemoveParticipant, danh sách về0; dùng lại đúng token60s ban đầu nhận JoinResponse lần nữa và participantCount1. Room thử đã xóa. Evidence: `signaling-replay/result.json`, `codex-native-signaling-replay-1.json`.

Đây là kiểm chứng admission qua SFU, không phải kiểm chứng kết nối WebRTC, âm thanh hay tải media. Các probe Chromium headed trước đó không hoàn tất ICE, không được tính là kiểm thử replay thành công. Log riêng cho thấy ICE requests không có responses. Các thử nghiệm cô lập loopback/LAN/mDNS/TCP đều được giữ kết quả thất bại; không đổi cấu hình/phiên bản dịch vụ chính hoặc tắt firewall.

Tài liệu chính thức cũng xác nhận self-hosted RemoveParticipant không vô hiệu hóa JWT đã cấp: https://docs.livekit.io/frontends/reference/tokens-grants/ . TTL ngắn và chặn API cấp token mới chưa đáp ứng yêu cầu FG về token cũ/logout/ban/kick/revoke.

## Đề xuất khuyến nghị: gateway admission, giữ SFU self-hosted

- Đặt đường HTTP/WebSocket báo hiệu LiveKit sau gateway FG; SFU signaling chỉ nhận từ backend/private network, không có đường public bypass. Audio/video vẫn WebRTC trực tiếp qua SFU; không chuyển media sang Socket.IO hoặc backend.
- Gateway kiểm chữ ký JWT và lease admission lưu server tại mỗi handshake/validate/reconnect: đúng call OPEN, thành viên phòng hiện tại, session gốc còn hiệu lực, không bị ban, chưa rời/kick. Không tin role/user/session/capacity do client gửi.
- Mỗi lần admission mới dùng identity opaque riêng cho lease; không dùng userId làm identity cố định có thể hồi sinh token cũ. Token được SFU tự refresh vẫn phải khớp lease đang còn hiệu lực. Lease đã thu hồi không sống lại khi cùng user đăng nhập hoặc tham gia lần sau.
- Reservation/capacity và duy nhất một call/user được khóa nguyên tử trong PostgreSQL, max10 bao gồm viewers. Token ngắn hạn; SFU room max10. Screen/camera không cấp sớm; microphone được phép cho viewers, moderation/publish theo T29.
- Khi logout/ban/kick/leave/revoke, thu hồi lease, đóng signaling và remove participant. Xử lý lỗi/retry phải fail closed; rejoin token cũ qua gateway phải bị chặn trước SFU. Cần kiểm đầy đủ đường thu hồi có sẵn, kể cả helper/owner transfer/dissolve và native Better Auth logout/reset.
- Giữ contracts CallGroupDTO/CallJoinDTO hiện có; sfuUrl trỏ gateway. Nếu review tìm thấy request/lifecycle contracts còn thiếu, sửa trong checkpoint T03 sở hữu trước T26.
- Không tự mua LiveKit Cloud, không thêm recording/camera, không giảm yêu cầu revoke/grace30s/media1000.

## Checkpoint/scope sau khi duyệt cách triển khai

1. Checkpoint sở hữu database T07-FIX2: lease/admission identity, binding session, reservation/expiry/revocation và migrations/tests PostgreSQL thật. Không sửa lại migration đã PASS. Đính chính ID sau duyệt: T07-FIX1 đã tồn tại và PASS cho constraints calls; dùng ID mới T07-FIX2, giữ nguyên phạm vi đề xuất đã duyệt.
2. Checkpoint setup sở hữu dependency/gateway config nếu cần: khai báo trực tiếp phiên bản ws đã cài, lockfile, config SFU private signaling. Không đổi phiên bản LiveKit hoặc secrets để vượt kiểm thử.
3. T26 mở đúng files gateway/calls và wiring CallsModule trong AppModule, các hook auth/room revocation chính xác sau khi audit; pin scope trước sửa. Nếu phải sửa contracts, thêm checkpoint T03 trước đó.
4. Trở về T26: RED→GREEN native HTTP/PG + SFU + headed WebRTC. Giữ10 RED hiện tại; thêm tests: replay trước JWT expiry, SFU-refreshed token, rejoin sau logout/ban/kick/membership removal, old identity sau new admission,11 concurrent incl viewers, one-user/two-call race, failure rollback/expired reservations và SFU max10.
5. Chỉ mở T27 sau T26 PASS; T27 giữ ownership webhook/grace/reconcile. Không tự đánh PASS hoặc mở task sau do proposal tồn tại.

## Lựa chọn khác

LiveKit Cloud có tính năng thu hồi token, nhưng là thay đổi dịch vụ/chi phí cần người dùng chọn và vẫn phải kiểm chứng các cửa sổ cutoff/refreshed-token. Không khuyến nghị cho ngân sách khởi nghiệp hiện tại. Không chọn giảm yêu cầu bảo mật để đi tiếp.

## Thông tin cần người dùng chốt

Duyệt triển khai gateway admission giữ LiveKit self-hosted và các checkpoint prerequisites nêu trên. Không cần cung cấp secret mới. Kết nối WebRTC local vẫn là mục phải giải quyết và kiểm chứng trước PASS; proposal không tuyên bố đã sửa được ICE.
