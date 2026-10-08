# Kích hoạt Firebase Spark miễn phí cho PHQ Education

Website dùng gói **Spark**, không cần liên kết thanh toán. Authentication và Firestore hoạt động trong hạn mức miễn phí của Firebase. Giáo viên có thể thêm, xem danh sách, khóa/mở khóa, cấp lại mật khẩu và xóa tài khoản ngay trên website công khai. Dịch vụ quản lý tài khoản dùng Cloudflare Workers gói miễn phí.

## Kiến trúc

- Vercel phục vụ website chính; GitHub Pages phục vụ bản triển khai bổ sung.
- Firebase Authentication xác thực và quản lý mật khẩu.
- Firestore `users/{uid}` lưu hồ sơ; `usernames/{username}` giữ tên đăng nhập duy nhất.
- Khi cấp tài khoản online, một phiên Authentication riêng chỉ lưu trong bộ nhớ tạo tài khoản học sinh; phiên đăng nhập giáo viên được giữ nguyên. Giáo viên dùng phiên quản trị để ghi hồ sơ và giữ chỗ tên trong cùng giao dịch Firestore. Rules chỉ cho quản trị viên có claim và hồ sơ đang hoạt động tạo hồ sơ học sinh, không cho tạo quản trị viên.
- Khi xóa online, website gửi ID token quản trị tới Cloudflare Worker. Worker xác minh chữ ký, dự án, thời hạn, trạng thái Auth, token thu hồi, claim và hồ sơ quản trị. Worker khóa hồ sơ học sinh trước, xóa Auth rồi xóa hồ sơ và giữ chỗ tên trong một commit có kiểm tra phiên bản. Khóa dịch vụ Firebase được lưu trong Worker Secret. Xem [cloudflare-admin.md](cloudflare-admin.md).
- Khi khóa/mở khóa hoặc cấp lại mật khẩu, website gửi ID token tới cùng Worker; quyền và hồ sơ học sinh được kiểm tra trước khi thay đổi Firebase Auth/Firestore.
- Giáo viên cấp tài khoản học sinh. Form không có đăng ký; tài khoản Auth không có hồ sơ được cấp cũng không được vào hệ thống. Tất cả quyền đọc/ghi được kiểm tra bằng Rules hoặc phía máy chủ.
- Không lưu mật khẩu hay hash mật khẩu trong Firestore hoặc browser storage. Khi cấp tài khoản online, mật khẩu được gửi trực tiếp đến Firebase Authentication. Khi giáo viên cấp lại mật khẩu, Worker gửi mật khẩu tới Firebase Auth qua HTTPS và không lưu lại.
- Học sinh và giáo viên sử dụng toàn bộ chức năng trực tiếp trên website. Máy tính của giáo viên có thể tắt; không cần dịch vụ quản trị local.
- Học sinh đăng nhập thành công được chuyển về trang chủ video. Nút góc trên bên phải là “Đăng xuất”, bấm để đăng xuất trực tiếp. Nút giữa trang là “Xin chào, [họ tên]”, bấm để xem thông tin tài khoản. Tải lại trang vẫn giữ lời chào nếu phiên còn hợp lệ. Đường dẫn `hoc-sinh.html` cũng hiển thị giao diện này sau khi kiểm tra quyền.
- Bấm các mục môn học hoặc Giải trí khi đã đăng nhập mở `bai-tap.html?mon=...`, có nền đêm sao từ tệp người dùng cung cấp, tìm kiếm, lọc danh mục và sắp xếp. Trang kiểm tra phiên và hồ sơ hoạt động trước khi hiển thị kho bài tập. Hiện chưa có đề; danh sách rỗng và không đọc collection đề thi cho đến khi tính năng đăng đề được xây dựng.

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
- Authorized domains: `lumenpelagi.vercel.app`, `phamhaiquang2003-sudo.github.io`; thêm `localhost`, `127.0.0.1` cho phát triển nếu cần.
- Học sinh `hs001` được tạo với email nội bộ `hs001@phq-education.firebaseapp.com`, nhưng chỉ cần nhập `hs001` trên website. Định danh này không phải hộp thư nhận thư khôi phục. Giáo viên cấp lại mật khẩu qua trang quản trị.
- Tên đăng nhập: 3–32 ký tự chữ thường không dấu, chữ số, `_`, `-`; ký tự đầu là chữ hoặc số.
- Mật khẩu: 8–128 ký tự; nếu Firebase có chính sách mạnh hơn, mật khẩu phải đáp ứng chính sách đó.

## 3. Áp dụng quyền Firestore

Bạn đã tạo Firestore `(default)`. Trong Firebase Console:

1. Mở Firestore Database → **Rules / Règles / Quy tắc**.
2. Sao chép toàn bộ nội dung tệp `firestore.rules` trong dự án vào trình soạn thảo.
3. Bấm **Publish / Publier / Xuất bản**.

Rules trong `firestore.rules` cho phép học sinh đọc hồ sơ của mình; quản trị có quyền đọc danh sách và tạo mới hồ sơ học sinh kèm giữ chỗ tên duy nhất trong một giao dịch. Hồ sơ mới luôn có role `student`, status `active`, danh sách lớp rỗng và không được chứa mật khẩu. Client không được sửa/xóa hồ sơ hay giữ chỗ đã tồn tại. Các collection khác mặc định bị chặn đến khi có tính năng và Rules tương ứng.

## 4. Thiết lập quản trị viên đầu tiên

Dự án hiện tại đã có tài khoản quản trị hoạt động. Các bước dưới đây chỉ dùng khi thiết lập một tài khoản quản trị mới, không phải thao tác hằng ngày.

1. Trong Authentication → Users → Add user, tạo tài khoản quản trị. Có thể dùng **email thật của bạn** để nhận thư khôi phục; khi đăng nhập website, nhập đầy đủ email đó. Hoặc tạo `admin@phq-education.firebaseapp.com` rồi nhập `admin`.
2. Sao chép UID của tài khoản vừa tạo.
3. Project settings → **Service accounts / Tài khoản dịch vụ** → Firebase Admin SDK → **Generate new private key / Tạo khóa riêng mới**. Tải tệp JSON của dự án `phq-education`, lưu **ngoài thư mục dự án**, ví dụ `C:\Users\ADMIN\PHQ-private\firebase-admin-key.json`. Khóa chỉ dùng trên máy tính của bạn; không gửi qua chat hay đưa lên GitHub.
4. Chạy script cấp hồ sơ và custom claim một lần bằng Node.js, từ thư mục dự án:

```powershell
npm.cmd --prefix functions ci --omit=dev
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\Users\ADMIN\PHQ-private\firebase-admin-key.json'
npm.cmd --prefix functions run bootstrap-admin -- 'UID_GIAO_VIEN' 'admin' 'Phạm Hải Quang'
```

5. Đăng nhập tại `https://lumenpelagi.vercel.app/quan-tri.html`. Đăng xuất/đăng nhập lại nếu đang có phiên trước khi cấp quyền.

Chỉ thêm `role: admin` bằng Firestore Console chưa đủ quyền quản trị. Script cấp quyền không mở cổng mạng và kết thúc sau khi xử lý. Khóa Service Account không được đưa vào frontend.

## 5. Cấp tài khoản học sinh

Mở `quan-tri.html` trên website và đăng nhập bằng tài khoản quản trị đã được cấp quyền. Không cần mở tệp `.bat` để thêm tài khoản.

- **Thêm tài khoản:** nhập username, mật khẩu ban đầu, họ tên. Role luôn là học sinh. Ghi lại thông tin để gửi riêng cho học sinh.
- **Danh sách:** tải 50 hồ sơ mỗi trang; có nút tải thêm. Quản trị viên được hiển thị nhưng không thể bị sửa/xóa từ trang học sinh.
- **Khóa:** đổi trạng thái Firestore ngay để thu hồi quyền, khóa Auth và thu hồi refresh token qua Worker.
- **Mở khóa:** mở Auth rồi kích hoạt hồ sơ qua Worker; học sinh đăng nhập lại.
- **Cấp lại mật khẩu:** cập nhật Auth và thu hồi phiên cũ qua Worker. Thao tác không tự mở khóa tài khoản đang khóa; mật khẩu giữ nguyên khoảng trắng và cần 8–128 ký tự.
- **Tự đổi mật khẩu:** mở menu tên tài khoản → **Tài khoản** → **Đổi mật khẩu**, nhập mật khẩu hiện tại và mật khẩu mới (8–128 ký tự), bấm **Lưu mật khẩu mới**. Firebase xác nhận mật khẩu hiện tại rồi cập nhật mật khẩu của chính người đang đăng nhập. Sau khi thành công, dùng mật khẩu mới ở lần đăng nhập tiếp theo. Biểu mẫu không lưu mật khẩu trong Firestore, localStorage hay sessionStorage; tên hiển thị và tên đăng nhập nằm trong phần **Thông tin tài khoản**.
- **Xóa:** khóa hồ sơ, xóa tài khoản Auth, hồ sơ và giữ chỗ tên đăng nhập. Trên website bấm **Xóa tài khoản → Xác nhận**. Lịch sử bài làm và học phí giữ định danh đã lưu.

Firebase có thể giới hạn tốc độ tạo tài khoản; thử lại sau nếu gặp giới hạn. Nếu cấp hồ sơ bị từ chối, hệ thống cố gắng xóa tài khoản Auth vừa tạo. Khi kết nối mất khiến kết quả chưa xác định, tải lại danh sách trước; chỉ dọn tài khoản Auth chưa có hồ sơ qua Firebase Console khi đã kiểm tra rõ.

Tài khoản thử đã tạo trực tiếp trong Authentication, ví dụ `hs001`, chưa có hồ sơ liên kết sẽ chưa đăng nhập được vào website. Với tài khoản thử không có dữ liệu, có thể xóa trong Console rồi tạo lại qua trang quản trị để hệ thống tạo đủ hồ sơ. Không tự ý xóa tài khoản đang sử dụng.

## 6. Kiểm tra trên Firebase Emulator

Yêu cầu Java 21+ và Node.js 22+. Trong thư mục `functions`:

```sh
npm ci
npm run test:emulators
```

Kiểm tra bằng Auth/Firestore Emulator với dự án `demo-phq-education`: quyền quản trị, cấp hồ sơ online theo cặp nguyên tử, chặn tự cấp hồ sơ/quyền, chặn truy cập hồ sơ người khác, tạo hàng loạt, trùng tên đồng thời, rollback khi tạo lỗi, khóa/mở khóa, đổi mật khẩu và xóa.

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
