# Kích hoạt Firebase cho PHQ Education

## Kiến trúc

- GitHub Pages phục vụ bốn trang: trang chủ, `dang-nhap.html`, `quan-tri.html`, `hoc-sinh.html`.
- Firebase Authentication xác thực và quản lý mật khẩu.
- Firestore `users/{uid}` lưu hồ sơ; `usernames/{username}` giữ tên đăng nhập duy nhất.
- Hai callable Cloud Functions `createStudents`, `manageStudent` chạy ở Singapore (`asia-southeast1`). Chỉ tài khoản có custom claim `admin: true` và hồ sơ quản trị đang hoạt động được gọi.
- Giáo viên cấp tài khoản học sinh. Form không có đăng ký; tài khoản Auth không có hồ sơ được cấp cũng không được vào hệ thống. Tất cả quyền đọc/ghi được kiểm tra bằng Rules hoặc phía máy chủ.
- Không lưu mật khẩu hay hash mật khẩu trong Firestore. Chỉ truyền mật khẩu đến Firebase qua SDK khi đăng nhập hoặc qua callable có xác thực khi tạo/cấp lại.

## 1. Cấu hình ứng dụng Web

Cấu hình Web do chủ dự án cung cấp đã được tích hợp trong `src/lib/firebase-config.ts`. Bản local và GitHub Pages dùng cấu hình này mặc định, không cần thêm variable để kết nối. `VITE_FIREBASE_CONFIG` vẫn có thể ghi đè cấu hình khi phát triển hoặc chạy emulator. Google Analytics chưa được bật trong code đăng nhập.

Firebase Console → Project settings → General → Your apps → ứng dụng Web → SDK setup and configuration. Lấy `firebaseConfig` từ dự án **phq-education**.

Nếu cần ghi đè trên máy, sao chép `.env.example` thành `.env.local`, điền cấu hình trên một dòng JSON:

```dotenv
VITE_FIREBASE_CONFIG='{"apiKey":"GIÁ_TRỊ_THẬT","authDomain":"phq-education.firebaseapp.com","projectId":"phq-education","storageBucket":"GIÁ_TRỊ_THẬT","messagingSenderId":"GIÁ_TRỊ_THẬT","appId":"GIÁ_TRỊ_THẬT"}'
VITE_FIREBASE_FUNCTIONS_REGION=asia-southeast1
```

Nếu cần ghi đè cấu hình khi build trên GitHub: repository → Settings → Secrets and variables → Actions → **Variables** → New repository variable:

- Name: `VITE_FIREBASE_CONFIG`
- Value: cùng chuỗi JSON, **không có dấu nháy đơn bọc ngoài**, không gồm `const firebaseConfig =`.

Đây là cấu hình Web công khai được đưa vào bản build. Bảo vệ dữ liệu dựa trên Auth/Rules, không dựa trên giấu cấu hình. Khóa Service Account chỉ dùng trên máy tin cậy, không đưa vào biến `VITE_*` hay kho GitHub.

Sau khi cập nhật variable, vào Actions → Build and deploy PHQ Education → Run workflow để dựng lại website.

## 2. Authentication

- Bật Email/Password.
- Authorized domains: `phamhaiquang2003-sudo.github.io`; thêm `localhost`, `127.0.0.1` cho phát triển nếu cần.
- Học sinh `hs001` được tạo với email nội bộ `hs001@phq-education.firebaseapp.com`, nhưng chỉ cần nhập `hs001` trên website. Định danh này không phải hộp thư nhận thư khôi phục. Giáo viên cấp lại mật khẩu qua trang quản trị.
- Tên đăng nhập: 3–32 ký tự chữ thường không dấu, chữ số, `_`, `-`; ký tự đầu là chữ hoặc số.
- Mật khẩu: 8–128 ký tự; nếu Firebase có chính sách mạnh hơn, mật khẩu phải đáp ứng chính sách đó.

## 3. Triển khai Rules và Cloud Functions

Bạn đã tạo Firestore `(default)`. Để trang quản trị tạo tài khoản ngay trên web, cần **nâng dự án lên Blaze và liên kết thanh toán**. Chi phí tùy mức sử dụng; giới hạn instance không phải giới hạn hóa đơn. Có thể đặt cảnh báo ngân sách trong Google Cloud Billing.

Trên máy có Node.js 22+:

```sh
cd functions
npm ci
npx firebase login
npx firebase deploy --config ../firebase.json --project phq-education --only firestore:rules,functions
```

Lệnh đăng nhập sẽ mở trình duyệt; chủ dự án tự đăng nhập Google. Lần deploy đầu có thể yêu cầu bật API và thiết lập quyền dịch vụ. Firebase CLI sẽ hiển thị bước cần hoàn tất.

Rules trong `firestore.rules` cho phép học sinh đọc hồ sơ của mình; quản trị có quyền đọc danh sách. Client không được sửa role, status, hồ sơ hay dữ liệu tên đăng nhập. Các collection khác mặc định bị chặn đến khi có tính năng và Rules tương ứng.

## 4. Tạo quản trị viên đầu tiên

1. Trong Authentication → Users → Add user, tạo tài khoản quản trị. Có thể dùng **email thật của bạn** để nhận thư khôi phục; khi đăng nhập website, nhập đầy đủ email đó. Hoặc tạo `admin@phq-education.firebaseapp.com` rồi nhập `admin`.
2. Sao chép UID của tài khoản vừa tạo.
3. Trên máy tin cậy, thiết lập Application Default Credentials bằng tài khoản có quyền quản lý Auth và Firestore. Nếu dùng khóa Service Account tải từ Project settings → Service accounts, lưu khóa **ngoài thư mục dự án**, không gửi qua chat.
4. Ví dụ PowerShell, trong thư mục `functions`:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\duong-dan-rieng\firebase-admin-key.json'
npm.cmd run bootstrap-admin -- 'UID_VUA_TAO' 'admin' 'Phạm Hải Quang'
Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS
```

Script tạo hồ sơ quản trị và custom claim. Đăng xuất/đăng nhập lại sau khi chạy để có token mới. Chỉ thêm `role: admin` bằng Firestore Console chưa đủ quyền quản trị.

5. Mở `dang-nhap.html` và đăng nhập. Tài khoản quản trị được chuyển đến `quan-tri.html`.

## 5. Cấp tài khoản học sinh

- **Thêm tài khoản:** nhập username, mật khẩu ban đầu, họ tên. Role luôn là học sinh. Ghi lại thông tin để gửi riêng cho học sinh.
- **Thêm hàng loạt:** mỗi dòng CSV gồm `username,password,displayName`, không có dòng tiêu đề; tối đa 50 dòng. Mật khẩu được giữ nguyên, không tự cắt khoảng trắng. Cột có dấu phẩy phải đặt trong ngoặc kép.
- **Danh sách:** tải 50 hồ sơ mỗi trang; có nút tải thêm. Quản trị viên được hiển thị nhưng không thể bị sửa/xóa từ trang học sinh.
- **Khóa:** đổi trạng thái Firestore ngay để thu hồi quyền, khóa Auth và thu hồi refresh token.
- **Mở khóa:** mở Auth rồi kích hoạt hồ sơ.
- **Cấp lại mật khẩu:** cập nhật Auth và thu hồi refresh token. ID token hiện có có thể còn hợp lệ đến khi hết hạn; nếu cần chặn truy cập ngay, khóa tài khoản trước.
- **Xóa:** khóa hồ sơ, xóa tài khoản Auth, hồ sơ và giữ chỗ tên đăng nhập. Giai đoạn này chưa có bài làm; khi thêm bài làm cần quyết định chính sách giữ lịch sử trước khi mở rộng thao tác xóa.

Tài khoản thử đã tạo trực tiếp trong Authentication, ví dụ `hs001`, chưa có hồ sơ liên kết sẽ chưa đăng nhập được vào website. Với tài khoản thử không có dữ liệu, có thể xóa trong Console rồi tạo lại qua trang quản trị để hệ thống tạo đủ hồ sơ. Không tự ý xóa tài khoản đang sử dụng.

## 6. Kiểm tra trên Firebase Emulator

Yêu cầu Java 21+ và Node.js 22+. Trong thư mục `functions`:

```sh
npm ci
npm run test:emulators
```

Kiểm tra bằng Auth/Firestore Emulator với dự án `demo-phq-education`: quyền quản trị, chặn truy cập hồ sơ người khác, chặn sửa quyền, tạo hàng loạt, trùng tên đồng thời, rollback khi tạo lỗi, khóa/mở khóa, đổi mật khẩu và xóa.

Để xem giao diện với dữ liệu emulator, chạy cả ba dịch vụ từ thư mục `functions`:

```sh
node scripts/run-emulators.js --serve --functions
```

Ở `.env.local` của frontend, dùng cấu hình dự án demo và chỉ bật emulator khi phát triển:

```dotenv
VITE_FIREBASE_CONFIG='{"apiKey":"demo-api-key","authDomain":"demo-phq-education.firebaseapp.com","projectId":"demo-phq-education","appId":"demo-web-app"}'
VITE_USE_FIREBASE_EMULATORS=true
```

Tên miền nội bộ của tài khoản demo là `demo-phq-education.firebaseapp.com`. Trong PowerShell chạy script bootstrap cho demo, thiết lập:

```powershell
$env:GCLOUD_PROJECT = 'demo-phq-education'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
npm.cmd run bootstrap-admin -- 'UID_TAI_KHOAN_DEMO' 'admin' 'Giáo viên thử'
```

Không dùng cấu hình demo trong bản production.
