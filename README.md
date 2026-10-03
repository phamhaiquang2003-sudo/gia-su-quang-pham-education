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

Các nút **Đăng nhập** dẫn đến [`dang-nhap.html`](https://phamhaiquang2003-sudo.github.io/gia-su-quang-pham-education/dang-nhap.html). Khi đã cấu hình Firebase, form dùng Authentication để xác thực và kiểm tra hồ sơ Firestore được giáo viên cấp. Quản trị viên vào `quan-tri.html`; học sinh vào `hoc-sinh.html`. Ghi nhớ dùng persistence của Firebase và chỉ lưu tên đăng nhập trong localStorage, không lưu mật khẩu. Các mục điều hướng môn học hiện mở hộp thoại minh họa.

## Firebase và quản trị học sinh

Trang quản trị dựa theo mẫu: thêm từng tài khoản, thêm hàng loạt CSV, xem danh sách, khóa/mở khóa, cấp lại mật khẩu và xóa học sinh. Mật khẩu thuộc Firebase Authentication; dữ liệu hồ sơ thuộc Firestore. Các thao tác quản trị được xử lý bằng callable Cloud Functions, có kiểm tra custom claim và hồ sơ quản trị.

![Trang quản trị được kiểm tra với Firebase Emulator](docs/preview-admin.png)

**Hướng dẫn kích hoạt:** [docs/firebase-setup.md](docs/firebase-setup.md). Cần điền cấu hình Web của `phq-education`, triển khai Rules/Functions và cấp quyền cho quản trị viên đầu tiên. Cloud Functions trên dự án thật cần Blaze. Khi chưa có cấu hình, giao diện hiển thị thông báo chưa kết nối thay vì giả lập đăng nhập thành công.

Form đăng nhập nằm trong thẻ xanh navy bo góc, có hiệu ứng kính, chữ sáng và ô nhập trong suốt đồng bộ với trang chủ. Phía sau là giao diện trang chủ cùng video được làm mờ. Nút **Quay lại** ở góc trên trái đưa về trang chủ.

Vite dùng `base: './'` để bản build có thể phục vụ dưới tiền tố kho GitHub Pages.

## Cập nhật website

GitHub Actions trong `.github/workflows/deploy-pages.yml` kiểm tra TypeScript, build React và triển khai thư mục `dist/` lên GitHub Pages mỗi khi đẩy mã lên `main`. Trong phần **Settings → Pages**, nguồn triển khai là **GitHub Actions**.
