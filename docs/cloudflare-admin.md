# Quản lý tài khoản ngay trên website

Trang `quan-tri.html` cho phép khóa, mở khóa, cấp lại mật khẩu và xóa tài khoản học sinh qua dịch vụ **Cloudflare Workers Free**. Firebase vẫn dùng Spark. Giáo viên thực hiện trực tiếp trên website, không cần mở cổng local hoặc giữ máy tính hoạt động.

## Dịch vụ hiện tại

- Worker: `phq-education-admin`.
- API: `https://phq-education-admin.lumenpelagi-phq.workers.dev/api/admin/manageStudent`.
- Frontend dùng `src/lib/admin-config.ts`; `VITE_ADMIN_API_URL` có thể ghi đè địa chỉ dịch vụ khi build hoặc kiểm thử.
- Endpoint quản lý tài khoản nhận `uid` và `action`: `disable`, `enable`, `resetPassword` hoặc `delete`. Riêng `resetPassword` nhận thêm `password` từ 8–128 ký tự, giữ nguyên khoảng trắng. Worker cũng phục vụ `/api/quiz/*` cho bài tập trực tuyến; xem [hướng dẫn bài tập](bai-tap-truc-tuyen.md).
- Origin cho phép tại `worker/wrangler.jsonc`: `ALLOWED_ORIGIN` là `https://lumenpelagi.vercel.app`; `ALLOWED_ORIGINS` bổ sung `https://phamhaiquang2003-sudo.github.io`. Worker kiểm tra khớp chính xác và trả CORS cho origin tương ứng. Các URL preview Vercel không được cấp quyền tự động.

## Quyền và xử lý lỗi

Worker xác minh ID token bằng khóa công khai của Firebase, yêu cầu đúng dự án `phq-education`, claim `admin: true`, tài khoản Auth chưa bị khóa/thu hồi và hồ sơ quản trị đang hoạt động. Chỉ tài khoản học sinh được quản lý; các thao tác không áp dụng cho quản trị viên. UID, email nội bộ và giữ chỗ tên phải khớp.

- **Khóa:** khóa hồ sơ trước để chặn quyền truy cập ngay, sau đó khóa Firebase Auth và thu hồi phiên cũ.
- **Mở khóa:** mở Firebase Auth trước, sau đó kích hoạt hồ sơ. Không khôi phục phiên đã bị thu hồi; học sinh đăng nhập lại.
- **Cấp lại mật khẩu:** cập nhật mật khẩu trong Firebase Auth và thu hồi phiên cũ; không thay đổi trạng thái khóa/mở khóa. Mật khẩu chỉ đi qua HTTPS để gửi tới Firebase, không được ghi vào Firestore, D1 hoặc log.
- **Xóa:** xóa tài khoản đăng nhập, hồ sơ và giữ chỗ tên; lịch sử bài làm và học phí tiếp tục giữ định danh đã lưu.

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

Worker gọi Firebase Auth và Firestore qua REST bằng OAuth của Service Account. Quản lý tài khoản không cần gRPC, máy chạy thường trực hoặc KV; binding D1 dùng cho bài tập và học phí. Log quan sát được tắt; API không trả ID token, mật khẩu hoặc khóa dịch vụ.

`npm test` kiểm tra quyền quản trị, tài khoản bị thu hồi, mục tiêu được bảo vệ, thứ tự khóa/mở khóa/xóa, cấp lại mật khẩu, lỗi giữa chừng, retry, CORS và giới hạn dữ liệu request. Kiểm tra triển khai thật dùng tài khoản học sinh thử riêng.
