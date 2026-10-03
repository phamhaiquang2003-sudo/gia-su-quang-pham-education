# gia-su-quang-pham-education

Giao diện mẫu **Velorah®**: hero toàn màn hình với video lặp, thanh điều hướng và nút liquid glass, typography điện ảnh, responsive trên điện thoại.

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

Các nút **Đăng nhập** dẫn đến trang riêng [`dang-nhap.html`](https://phamhaiquang2003-sudo.github.io/gia-su-quang-pham-education/dang-nhap.html), với form tên đăng nhập, mật khẩu, hiện/ẩn mật khẩu và ghi nhớ tên tài khoản trên thiết bị. Form được dựng trong `src/pages/LoginPage.tsx`; đây là giao diện frontend, chưa kết nối xác thực tài khoản. Mật khẩu không được lưu trong localStorage hay gửi lên máy chủ. Các mục điều hướng còn lại mở hộp thoại minh họa.

Form đăng nhập nằm trong thẻ trắng bo góc, phía sau là giao diện trang chủ cùng video được làm mờ. Nút **Quay lại** ở góc trên trái đưa về trang chủ.

Vite dùng `base: './'` để bản build có thể phục vụ dưới tiền tố kho GitHub Pages.

## Cập nhật website

GitHub Actions trong `.github/workflows/deploy-pages.yml` kiểm tra TypeScript, build React và triển khai thư mục `dist/` lên GitHub Pages mỗi khi đẩy mã lên `main`. Trong phần **Settings → Pages**, nguồn triển khai là **GitHub Actions**.
