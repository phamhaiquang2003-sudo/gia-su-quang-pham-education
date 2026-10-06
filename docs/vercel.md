# Triển khai LumenPelagi trên Vercel

Website chính: https://lumenpelagi.vercel.app/.

Dự án Vercel `lumenpelagi` kết nối repository `phamhaiquang2003-sudo/gia-su-quang-pham-education`, production branch `main`. Vercel tự triển khai khi push nhánh này.

## Build

`vercel.json` đặt framework Vite, install `npm ci`, build `npm run build` và output `dist`. Dùng Node.js 24.x. Đây là website nhiều trang; giữ đường dẫn `.html` và các tệp tĩnh, như `dang-nhap.html`, `quan-tri.html`, `ho-so.html`, `bai-tap.html` và `nen-dem-sao.html`.

Frontend dùng cấu hình Firebase Web công khai trong `src/lib/firebase-config.ts` và API trong `src/lib/admin-config.ts`. Các trang dùng Vite `base: "./"`, hoạt động ở đường dẫn gốc Vercel và đường dẫn repository GitHub Pages.

## Đăng nhập và bài tập

- Firebase Authentication authorizes `lumenpelagi.vercel.app`.
- Cloudflare Worker cho phép chính xác origin production `https://lumenpelagi.vercel.app` và origin GitHub Pages trong `worker/wrangler.jsonc`.
- Firebase quản lý tài khoản; Cloudflare D1 lưu đề, tệp, lượt làm và điểm. Frontend trên Vercel gọi các dịch vụ này bằng token của tài khoản đã đăng nhập.
- Phiên đăng nhập thuộc từng origin. Khi mở Vercel lần đầu, đăng nhập bằng tài khoản đã được giáo viên cấp.

## Kiểm tra sau triển khai

Mở trang chủ, đăng nhập, kho bài, hồ sơ và quản trị trên URL production. Kiểm tra nền video/nền sao, các tệp đề và thao tác làm bài/nộp/chấm. Ảnh chia sẻ dùng `https://lumenpelagi.vercel.app/lumenpelagi-share.png`.

Các bản preview có URL khác production; khi kiểm tra tính năng tài khoản và bài tập, dùng địa chỉ chính thức bên trên.
