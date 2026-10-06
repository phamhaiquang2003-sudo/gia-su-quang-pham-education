# Kết nối lumenpelagi.id.vn

## Trạng thái chuẩn bị — 07/10/2026

- Tên miền chính dự kiến: `https://lumenpelagi.id.vn/`.
- DNS hiện tại: Mắt Bão, `ns1.matbao.vn` và `ns2.matbao.vn`. Bản ghi A của tên miền đang là `13.67.69.121` và trả trang mẫu của nhà cung cấp.
- Firebase Authentication đã bổ sung `lumenpelagi.id.vn` và `www.lumenpelagi.id.vn` vào authorized domains.
- Worker cho phép cả hai HTTPS origin này và origin GitHub Pages hiện tại, kiểm tra khớp chính xác; tất cả API vẫn xác thực tài khoản như trước.
- GitHub Pages đang dùng GitHub Actions, chưa gán custom domain. Chờ người dùng mở trang DNS Mắt Bão để phối hợp gán tên miền và đổi DNS trong cùng đợt chuyển.

## DNS đích

Thay bản ghi A của `@` đang trỏ `13.67.69.121` bằng bốn bản ghi A bên dưới, rồi thêm CNAME cho `www`:

| Loại | Host | Giá trị |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | phamhaiquang2003-sudo.github.io |

TTL có thể để mặc định hoặc 3600. Giá trị CNAME là hostname, không có giao thức hay đường dẫn repository.

## Hoàn tất chuyển tên miền

1. Khi người dùng sẵn sàng chỉnh DNS, đặt GitHub repository → Settings → Pages → Custom domain thành `lumenpelagi.id.vn` và phối hợp đổi các bản ghi bên trên. Workflow Actions quản lý custom domain trong Pages settings; không cần tệp CNAME để kích hoạt.
2. Kiểm tra DNS, trang chủ, đăng nhập, quản trị, hồ sơ và kho bài ở đường dẫn gốc của tên miền. Vite đang dùng `base: "./"`.
3. Khi chứng chỉ GitHub Pages sẵn sàng, bật **Enforce HTTPS**. DNS và chứng chỉ có thể cần tới 24 giờ.
4. Đổi các URL ảnh chia sẻ trong `index.html` sang `https://lumenpelagi.id.vn/lumenpelagi-share.png`, cập nhật URL website trong README và xác nhận ảnh công khai trả HTTP 200.
5. Kiểm tra đăng nhập và API thật trên origin mới. Phiên đăng nhập thuộc từng origin, nên học sinh có thể cần đăng nhập lại khi đổi từ GitHub Pages sang tên miền riêng.

Tài liệu DNS: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
