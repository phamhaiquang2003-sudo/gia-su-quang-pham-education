# gia-su-quang-pham-education

Website **PHQ Education / LumenPelagi®**: hero video, giao diện kính, đăng nhập học sinh và quản trị tài khoản bằng Firebase.

**Website:** https://phamhaiquang2003-sudo.github.io/gia-su-quang-pham-education/

![Giao diện Velorah trên máy tính](docs/preview-desktop.png)

## Công nghệ

- React + TypeScript + Vite.
- Tailwind CSS v4, tích hợp qua plugin Vite.
- Các component Button và Dialog từ shadcn/ui, tùy chỉnh trên Radix UI.
- Instrument Serif và Inter (400/500) từ Google Fonts.

## Chạy trên máy

Cài Node.js 22.12 trở lên (khuyên dùng Node.js 24 LTS), sau đó:

Trên máy Windows hiện tại, có thể nhấp đúp **`chay-giao-dien.bat`** để mở giao diện. Tệp này hỗ trợ Node.js portable đã được tải cho dự án, hoặc Node.js có trên PATH.

```sh
npm install
npm run dev
```

Mở URL Vite hiển thị trong terminal, thường là `http://127.0.0.1:5173`.

```sh
npm run build      # Kiểm tra TypeScript và dựng bản production vào dist/
npm run preview    # Xem bản production trên máy
```

## Các tệp chính

- `src/App.tsx`: video, điều hướng, nội dung hero và các hộp thoại mẫu.
- `src/index.css`: bảng màu HSL, hiệu ứng kính và animation fade-rise.
- `src/components/ui/`: các component shadcn/ui.
- `components.json`: cấu hình để thêm component shadcn/ui.

Video sử dụng trực tiếp URL CloudFront được cung cấp trong yêu cầu. Không có lớp phủ trang trí trên video. Có nút tạm dừng/phát; khi thiết bị bật giảm chuyển động, video được tạm dừng và animation được rút ngắn.

Các nút **Đăng nhập** dẫn đến [`dang-nhap.html`](https://phamhaiquang2003-sudo.github.io/gia-su-quang-pham-education/dang-nhap.html). Form dùng Authentication để xác thực và kiểm tra hồ sơ Firestore được giáo viên cấp. Quản trị viên vào `quan-tri.html`; học sinh quay về trang chủ video. Nút góc trên bên phải đổi thành **Đăng xuất** và đăng xuất trực tiếp; nút giữa trang hiển thị **Xin chào, [họ tên]**. Bấm lời chào để mở thông tin tài khoản. `hoc-sinh.html` cũng dùng giao diện trang chủ cho tài khoản đã đăng nhập. Ghi nhớ dùng persistence của Firebase và chỉ lưu tên đăng nhập trong localStorage, không lưu mật khẩu. Khi chưa đăng nhập, bấm Toán, Vật lý, KHTN, TSA/HSA/SPT hoặc Giải trí sẽ hiện hộp thoại nổi bật **“Bạn cần đăng nhập để tiếp tục”**, kèm nút **Đăng nhập ngay**. Với tài khoản đã đăng nhập, các mục này hiện mở hộp thoại minh họa.

## Firebase và quản trị học sinh

Mục **Liên hệ gia sư** trên cả menu máy tính và điện thoại mở Zalo của Phạm Hải Quang tại **https://zalo.me/0365900419**, không yêu cầu đăng nhập.

Trang quản trị dựa theo mẫu: thêm từng tài khoản, thêm hàng loạt CSV, xem danh sách, khóa/mở khóa, cấp lại mật khẩu và xóa học sinh. Mật khẩu thuộc Firebase Authentication; dữ liệu hồ sơ thuộc Firestore. **Dùng Firebase Spark miễn phí:** giáo viên thêm tài khoản, thêm hàng loạt và xóa tài khoản ngay trên website công khai. Một phiên Auth riêng trong bộ nhớ giữ nguyên phiên giáo viên khi tạo; Firestore Rules kiểm tra quyền trước khi cấp hồ sơ. Chức năng xóa chạy trên **Cloudflare Workers miễn phí**, kiểm tra ID token, quyền quản trị và trạng thái tài khoản; xóa cả Auth, hồ sơ và giữ chỗ tên đăng nhập. Để khóa/mở khóa hoặc cấp lại mật khẩu, nhấp đúp `quan-tri-mien-phi.bat`. Website hoạt động khi bạn tắt máy. Xem [hướng dẫn dịch vụ Cloudflare](docs/cloudflare-admin.md).

![Trang quản trị được kiểm tra với Firebase Emulator](docs/preview-admin.png)

**Hướng dẫn kích hoạt:** [docs/firebase-setup.md](docs/firebase-setup.md). Cấu hình Web của `phq-education` đã được tích hợp. Còn cần áp dụng Firestore Rules và tạo quản trị viên đầu tiên. Công cụ local dùng khóa Service Account lưu ngoài dự án; không cần triển khai Cloud Functions hay bật thanh toán. Cấu hình phát triển có thể được ghi đè bằng `VITE_FIREBASE_CONFIG`.

Form đăng nhập nằm trong thẻ xanh navy bo góc, có hiệu ứng kính, chữ sáng và ô nhập trong suốt đồng bộ với trang chủ. Phía sau là giao diện trang chủ cùng video được làm mờ. Nút **Quay lại** ở góc trên trái đưa về trang chủ.

Vite dùng `base: './'` để bản build có thể phục vụ dưới tiền tố kho GitHub Pages.

## Cập nhật website

GitHub Actions trong `.github/workflows/deploy-pages.yml` kiểm tra TypeScript, build React và triển khai thư mục `dist/` lên GitHub Pages mỗi khi đẩy mã lên `main`. Trong phần **Settings → Pages**, nguồn triển khai là **GitHub Actions**.
