# Kích hoạt Firebase Spark miễn phí cho PHQ Education

Website dùng gói **Spark**, không cần liên kết thanh toán. Authentication và Firestore hoạt động trong hạn mức miễn phí của Firebase. Học sinh dùng website công khai; bạn cấp và quản lý tài khoản bằng trang quản trị chạy trên máy tính của mình.

## Kiến trúc

- GitHub Pages phục vụ bốn trang: trang chủ, `dang-nhap.html`, `quan-tri.html`, `hoc-sinh.html`.
- Firebase Authentication xác thực và quản lý mật khẩu.
- Firestore `users/{uid}` lưu hồ sơ; `usernames/{username}` giữ tên đăng nhập duy nhất.
- Công cụ Node.js trên máy dùng Firebase Admin SDK để tạo/khóa/cấp lại mật khẩu học sinh. Chỉ tài khoản có custom claim `admin: true` và hồ sơ quản trị đang hoạt động được gọi. Dịch vụ chỉ lắng nghe ở `127.0.0.1`.
- Giáo viên cấp tài khoản học sinh. Form không có đăng ký; tài khoản Auth không có hồ sơ được cấp cũng không được vào hệ thống. Tất cả quyền đọc/ghi được kiểm tra bằng Rules hoặc phía máy chủ.
- Không lưu mật khẩu hay hash mật khẩu trong Firestore. Khi quản trị, trình duyệt gửi yêu cầu có ID token đến dịch vụ trên máy; dịch vụ dùng Admin SDK gửi dữ liệu tới Firebase.
- Khi bạn tắt máy, học sinh vẫn đăng nhập và đọc hồ sơ trên Firebase. Máy chỉ cần mở khi bạn quản lý tài khoản.
- Học sinh đăng nhập thành công được chuyển về trang chủ video. Nút góc trên bên phải là “Đăng xuất”, bấm để đăng xuất trực tiếp. Nút giữa trang là “Xin chào, [họ tên]”, bấm để xem thông tin tài khoản. Tải lại trang vẫn giữ lời chào nếu phiên còn hợp lệ. Đường dẫn `hoc-sinh.html` cũng hiển thị giao diện này sau khi kiểm tra quyền.

## 1. Cấu hình ứng dụng Web

Cấu hình Web do chủ dự án cung cấp đã được tích hợp trong `src/lib/firebase-config.ts`. Bản local và GitHub Pages dùng cấu hình này mặc định, không cần thêm variable để kết nối. `VITE_FIREBASE_CONFIG` vẫn có thể ghi đè cấu hình khi phát triển hoặc chạy emulator. Google Analytics chưa được bật trong code đăng nhập.

Firebase Console → Project settings → General → Your apps → ứng dụng Web → SDK setup and configuration. Lấy `firebaseConfig` từ dự án **phq-education**.

Nếu cần ghi đè trên máy, sao chép `.env.example` thành `.env.local`, điền cấu hình trên một dòng JSON:

```dotenv
VITE_FIREBASE_CONFIG='{"apiKey":"GIÁ_TRỊ_THẬT","authDomain":"phq-education.firebaseapp.com","projectId":"phq-education","storageBucket":"GIÁ_TRỊ_THẬT","messagingSenderId":"GIÁ_TRỊ_THẬT","appId":"GIÁ_TRỊ_THẬT"}'
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

## 3. Áp dụng quyền Firestore

Bạn đã tạo Firestore `(default)`. Trong Firebase Console:

1. Mở Firestore Database → **Rules / Règles / Quy tắc**.
2. Sao chép toàn bộ nội dung tệp `firestore.rules` trong dự án vào trình soạn thảo.
3. Bấm **Publish / Publier / Xuất bản**.

Rules trong `firestore.rules` cho phép học sinh đọc hồ sơ của mình; quản trị có quyền đọc danh sách. Client không được sửa role, status, hồ sơ hay dữ liệu tên đăng nhập. Các collection khác mặc định bị chặn đến khi có tính năng và Rules tương ứng.

## 4. Tạo quản trị viên và mở công cụ trên máy

1. Trong Authentication → Users → Add user, tạo tài khoản quản trị. Có thể dùng **email thật của bạn** để nhận thư khôi phục; khi đăng nhập website, nhập đầy đủ email đó. Hoặc tạo `admin@phq-education.firebaseapp.com` rồi nhập `admin`.
2. Sao chép UID của tài khoản vừa tạo.
3. Project settings → **Service accounts / Tài khoản dịch vụ** → Firebase Admin SDK → **Generate new private key / Tạo khóa riêng mới**. Tải tệp JSON của dự án `phq-education`, lưu **ngoài thư mục dự án**, ví dụ `C:\Users\ADMIN\PHQ-private\firebase-admin-key.json`. Khóa chỉ dùng trên máy tính của bạn; không gửi qua chat hay đưa lên GitHub.
4. Nhấp đúp **`quan-tri-mien-phi.bat`** trong thư mục dự án.
5. Nhập đường dẫn tệp JSON vừa lưu. Ở lần đầu, nhập UID của tài khoản giáo viên. Công cụ sẽ tạo hồ sơ quản trị và custom claim. Những lần sau có thể bỏ trống UID.
6. Trình duyệt mở `http://127.0.0.1:5173/quan-tri.html`. Bấm đến trang đăng nhập và dùng tài khoản giáo viên vừa tạo. Đăng xuất/đăng nhập lại nếu tài khoản đang có phiên trước khi cấp quyền.
7. Giữ cửa sổ công cụ mở khi thêm, khóa hoặc cấp lại mật khẩu học sinh. Nếu cổng 5173 đang bị Vite khác sử dụng, đóng cửa sổ Vite cũ rồi mở công cụ.

Công cụ hỗ trợ Node.js trên PATH hoặc Node portable trên máy Windows hiện tại. Nó tự cài các package cần thiết khi chưa có. Có thể chạy thủ công từ thư mục dự án:

```sh
npm ci
npm --prefix functions ci --omit=dev
node functions/scripts/start-local-admin.js
```

Chỉ thêm `role: admin` bằng Firestore Console chưa đủ quyền quản trị. Khóa Service Account được đọc ở tiến trình Node.js trên máy, không được đưa vào frontend.

Trang quản trị công khai cho phép giáo viên xem danh sách. Các nút thay đổi tài khoản hoạt động trong công cụ local; giao diện sẽ hiển thị hướng dẫn mở tệp `.bat` khi đang ở bản công khai.

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

Để chạy Auth/Firestore Emulator, từ thư mục `functions`:

```sh
node scripts/run-emulators.js --serve
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
