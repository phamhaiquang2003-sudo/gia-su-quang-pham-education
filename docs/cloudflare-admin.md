# Xóa tài khoản ngay trên website

Trang `quan-tri.html` có thể xóa đầy đủ tài khoản đăng nhập Firebase, hồ sơ `users/{uid}` và giữ chỗ `usernames/{username}` qua dịch vụ **Cloudflare Workers Free**. Firebase vẫn dùng Spark, không triển khai Cloud Functions.

## Dịch vụ hiện tại

- Worker: `phq-education-admin`.
- API: `https://phq-education-admin.lumenpelagi-phq.workers.dev/api/admin/manageStudent`.
- Frontend dùng `src/lib/admin-config.ts`; `VITE_ADMIN_API_URL` có thể ghi đè địa chỉ dịch vụ khi build hoặc kiểm thử.
- Worker chỉ chấp nhận thao tác `delete`. Khóa/mở khóa và cấp lại mật khẩu vẫn dùng công cụ local.
- Origin cho phép: `https://phamhaiquang2003-sudo.github.io`, cấu hình tại `worker/wrangler.jsonc`. Khi đổi tên miền website, cần đổi origin và triển khai lại Worker.

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

Worker gọi Firebase Auth và Firestore qua REST bằng OAuth của Service Account. Không cần gRPC, máy chạy thường trực, D1 hay KV. Log quan sát được tắt; API không trả ID token, mật khẩu hoặc khóa dịch vụ.

`npm test` kiểm tra thứ tự xóa, quyền quản trị, tài khoản bị thu hồi, mục tiêu được bảo vệ, lỗi giữa chừng, retry, CORS và giới hạn dữ liệu request. Kiểm tra triển khai thật nên dùng tài khoản học sinh thử riêng.
