# Xóa tài khoản ngay trên website

Trang `quan-tri.html` có thể xóa đầy đủ tài khoản đăng nhập Firebase, hồ sơ `users/{uid}` và giữ chỗ `usernames/{username}` qua dịch vụ **Cloudflare Workers Free**. Firebase vẫn dùng Spark, không triển khai Cloud Functions.

## Dịch vụ hiện tại

- Worker: `phq-education-admin`.
- API: `https://phq-education-admin.lumenpelagi-phq.workers.dev/api/admin/manageStudent`.
- Frontend dùng `src/lib/admin-config.ts`; `VITE_ADMIN_API_URL` có thể ghi đè địa chỉ dịch vụ khi build hoặc kiểm thử.
- Endpoint quản lý tài khoản chỉ chấp nhận thao tác `delete`. Khóa/mở khóa và cấp lại mật khẩu vẫn dùng công cụ local. Worker cũng phục vụ `/api/quiz/*` cho bài tập trực tuyến; xem [hướng dẫn bài tập](bai-tap-truc-tuyen.md).
- Origin cho phép được cấu hình tại `worker/wrangler.jsonc`: `ALLOWED_ORIGIN` là địa chỉ GitHub Pages; `ALLOWED_ORIGINS` bổ sung các địa chỉ HTTPS `lumenpelagi.id.vn` và `www.lumenpelagi.id.vn`. Worker kiểm tra khớp chính xác từng origin và trả CORS cho đúng origin đã cho phép.

## Quyền và xử lý lỗi

Worker xác minh ID token bằng khóa công khai của Firebase, yêu cầu đúng dự án `phq-education`, claim `admin: true`, tài khoản Auth chưa bị khóa/thu hồi và hồ sơ quản trị đang hoạt động. Chỉ hồ sơ học sinh được xóa; không thể xóa quản trị viên. UID, email nội bộ và giữ chỗ tên phải khớp.

Trình tự xóa: khóa hồ sơ ngay → xóa Auth → xóa hồ sơ và giữ chỗ cùng commit. Các ghi Firestore dùng precondition phiên bản để tránh xóa dữ liệu đã thay đổi đồng thời. Nếu Firebase hoặc mạng gặp lỗi giữa chừng, hồ sơ còn lại giữ trạng thái khóa; tải lại danh sách rồi bấm xóa để hoàn tất. Nếu Auth đã được xóa ở lần trước, Worker vẫn dọn được hồ sơ còn lại.

## Triển khai lại

Từ thư mục `worker` với Node.js 22+:

```sh
npm ci
npm run login
npm test
npm run check
npm run deploy
```

Wrangler mở trình duyệt để đăng nhập Cloudflare và xin quyền triển khai. Lần đầu cần đăng ký subdomain `workers.dev` cho tài khoản. Worker được cấu hình với account ID hiện tại; đổi giá trị này khi triển khai sang tài khoản khác.

Biến bí mật **`FIREBASE_SERVICE_ACCOUNT`** chứa JSON của khóa Service Account thuộc dự án `phq-education`. Có thể đặt bằng Cloudflare Dashboard → Worker → Settings → Variables and Secrets → **Secret**, hoặc `wrangler secret put FIREBASE_SERVICE_ACCOUNT` với nội dung đọc trực tiếp từ tệp khóa riêng trên máy. Khóa không thuộc mã nguồn, bản build website hoặc biến `VITE_*`.

Worker gọi Firebase Auth và Firestore qua REST bằng OAuth của Service Account. Chức năng xóa không cần gRPC, máy chạy thường trực hoặc KV; binding D1 dùng riêng cho kho bài tập. Log quan sát được tắt; API không trả ID token, mật khẩu hoặc khóa dịch vụ.

`npm test` kiểm tra thứ tự xóa, quyền quản trị, tài khoản bị thu hồi, mục tiêu được bảo vệ, lỗi giữa chừng, retry, CORS và giới hạn dữ liệu request. Kiểm tra triển khai thật nên dùng tài khoản học sinh thử riêng.
