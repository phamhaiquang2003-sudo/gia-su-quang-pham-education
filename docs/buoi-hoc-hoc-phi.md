# Thống kê buổi học và học phí

Đăng nhập quản trị tại https://lumenpelagi.vercel.app/quan-tri.html → **Thống kê buổi học**.

## Ghi nhận buổi học

1. Chọn **Tháng thống kê** và học sinh trong **Thêm buổi học**.
2. Nhập **Ngày học**, **Học phí buổi này (đồng)** và ghi chú nếu cần.
3. Bật **Lưu mức phí này làm mặc định cho học sinh** để buổi mới của em đó tự điền mức phí. Có thể chỉnh tiền riêng cho từng buổi; đổi mặc định không sửa phí các buổi đã lưu.
4. Bấm **Lưu buổi học**. Nếu ngày học thuộc tháng khác, thống kê chuyển sang tháng của buổi vừa lưu.

Ngày hiển thị theo `dd/mm/yyyy`, tháng theo `mm/yyyy`. Ngày mặc định lấy theo giờ Việt Nam. Có thể ghi nhiều buổi cùng ngày nếu học sinh học nhiều lần.

## Xem số buổi và tổng tiền

- **Tổng hợp học phí** cho biết số buổi và tổng số tiền của mỗi học sinh trong tháng được chọn.
- **Chi tiết các buổi học** liệt kê ngày, học sinh, học phí từng buổi và ghi chú. Bấm bút để sửa; bấm thùng rác để xóa buổi nhập nhầm, tổng tiền được tính lại.
- **Lọc học sinh** hoặc **Xem các buổi** lọc báo cáo theo một em. **Tải lại thống kê** cập nhật dữ liệu từ máy chủ.
- Với danh sách nhiều tài khoản, bấm **Tải thêm học sinh** để tiếp tục tải các tài khoản khác.
- Tổng học phí là tổng phí của các buổi đã ghi, không phải trạng thái xác nhận chuyển khoản. Buổi học do giáo viên nhập, không suy ra từ thời gian làm bài trực tuyến.

## Xuất PDF gửi học sinh

Chọn tháng, sau đó bấm **Xuất PDF** ở dòng của học sinh trong bảng tổng hợp. Hoặc chọn em trong **Lọc học sinh** và bấm **Xuất PDF cho học sinh** bên cạnh tiêu đề tổng hợp.

File `Hoc-phi-[ten-dang-nhap]-[nam-thang].pdf` tải trực tiếp về máy, có:

- Họ tên học sinh, tên đăng nhập, giáo viên và tháng thống kê.
- Ngày học và số tiền của từng buổi, sắp xếp từ ngày đầu tháng đến cuối tháng.
- Tổng số buổi và tổng học phí của riêng em đó trong tháng.
- Thông tin chuyển khoản MB Bank và mã QR của giáo viên.

PDF khổ A4, nhúng phông chữ tiếng Việt và ảnh QR, mở được mà không cần mạng. Báo cáo lấy dữ liệu mới nhất từ máy chủ, bao gồm toàn bộ buổi của học sinh trong tháng; danh sách dài tự chia trang. Bạn gửi file đã tải qua Zalo hoặc phương thức liên lạc đang dùng.

## QR ngân hàng

Mã VietQR chuyển khoản được hiển thị trong **file PDF tổng hợp học phí**: **MB Bank**, tài khoản **0365900419**, chủ tài khoản **PHAM HAI QUANG**, theo thông tin người dùng cung cấp. Trang quản trị chỉ hiển thị form ghi nhận buổi học và các bảng thống kê, không hiển thị khung QR ngân hàng. QR không cố định số tiền; người chuyển khoản nhập số tiền theo thống kê tháng.

Ảnh QR được lưu tại `public/qr-mb-pham-hai-quang.png` và nhúng vào PDF, không phụ thuộc dịch vụ tạo QR bên ngoài khi xuất báo cáo.

## Lưu trữ và quyền truy cập

Dữ liệu buổi học và mức phí mặc định nằm trong Cloudflare D1 Free, với migration `0007_tuition_lessons.sql`. API `tuitionMonth`, `tuitionReport`, `tuitionSave`, `tuitionDelete` kiểm tra ID token, hồ sơ hoạt động và quyền admin trên máy chủ; dữ liệu thuộc quản trị viên đã ghi nhận. Học sinh không được đọc/sửa thống kê qua các API này. PDF được tạo trên trình duyệt quản trị từ báo cáo của một học sinh, không gửi dữ liệu sang dịch vụ tạo PDF bên ngoài.

Phông chữ Noto Sans trong `public/fonts/` dùng cho PDF, theo giấy phép SIL Open Font License đi kèm `OFL-NotoSans.txt`.

Phí lưu là số nguyên VND từ 0 đến 1.000.000.000 đồng/buổi. Mỗi buổi có phiên bản để tránh ghi đè khi mở nhiều tab; gửi lại cùng yêu cầu lưu không tạo thêm buổi trùng. Lịch sử giữ tên và UID học sinh tại thời điểm ghi nhận, kể cả khi tài khoản đã bị xóa. Chi tiết hiển thị tối đa 1000 buổi mỗi lần tải; tổng tiền và số buổi vẫn tính đầy đủ, có thể lọc học sinh để xem các buổi của riêng em đó.

Sau khi triển khai mã mới, áp dụng migration vào D1 rồi deploy Worker:

```sh
cd worker
npx wrangler d1 migrations apply phq-education-exercises --remote
npm run deploy
```
