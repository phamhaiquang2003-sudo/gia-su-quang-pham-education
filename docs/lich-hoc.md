# Lịch học / lịch dạy

Mở **Trang quản trị → Lịch học**. Chỉ quản trị viên đăng nhập mới được xem và quản lý lịch; học sinh không truy cập được API lịch. Dữ liệu lưu online trong Cloudflare D1 Free, tách riêng theo tài khoản giáo viên. Không cần nâng cấp Firebase Spark.

## Xếp lịch

- Chọn **Ngày**, **Tuần** hoặc **Tháng**; dùng **Hôm nay**, mũi tên hoặc ô ngày để chuyển kỳ. Điện thoại mặc định xem Ngày. Lịch tuần/tháng có thể cuộn ngang nếu màn hình nhỏ.
- Bấm **Thêm buổi học** hoặc một ô trống trong lịch, nhập tên, ngày và giờ bắt đầu/kết thúc. Toàn bộ thời gian là **giờ Việt Nam (UTC+7)**, không phụ thuộc múi giờ máy tính.
- Chọn môn học, màu, một/nhiều học sinh (tối đa 30), địa điểm/link học online và ghi chú. Có thể không chọn học sinh để đặt lịch cá nhân hoặc nhóm chưa có tài khoản.
- Để xếp lịch cố định, bật **Lặp lại hằng tuần**, chọn các thứ và ngày kết thúc. Một lần tạo tối đa **100 buổi trong 180 ngày**. Máy chủ kiểm tra và lưu cả đợt nguyên vẹn, không tạo một phần khi xảy ra lỗi.
- Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày. Buổi qua nửa đêm cần tách thành hai buổi.

## Trùng giờ và chỉnh sửa

- Cảnh báo trùng với mọi buổi chưa hủy của chính giáo viên, kể cả các buổi lặp ngoài khoảng đang xem. Hai buổi nối tiếp đúng giờ kết thúc/bắt đầu không bị coi là trùng.
- Mặc định máy chủ từ chối lưu nếu trùng giờ. Chỉ lưu chồng lịch khi bạn chủ động tích **Cho phép trùng giờ**. Các buổi trùng được xếp cạnh nhau trên lịch.
- Bấm buổi học để sửa, đánh dấu **Đã dạy**, **Đã hủy**, hoặc **Xóa buổi này**. Sửa/xóa một buổi trong lịch lặp không làm thay đổi các buổi còn lại.
- Hai cửa sổ sửa cùng lúc được kiểm tra phiên bản; cửa sổ cũ cần tải lại và mở lại buổi để tránh ghi đè. Gửi lại yêu cầu lưu do mất mạng không tạo thêm các buổi trùng lặp.
- Lọc theo học sinh, trạng thái hoặc tìm tên buổi/địa điểm/học sinh. Nút tải lại lấy dữ liệu mới từ máy chủ.

**Lịch học là kế hoạch, không phải ghi nhận học phí.** Thêm/sửa/hủy/xóa lịch hoặc đánh dấu đã dạy không tự động ghi số buổi, thay đổi tiền học hay PDF. Tiếp tục ghi buổi thực tế ở **Thống kê buổi học** như trước.

## Triển khai

Áp dụng migration `worker/migrations/0010_teaching_schedule.sql` cho D1, sau đó triển khai Worker và frontend. Các API `scheduleList`, `scheduleSave`, `scheduleDelete` dùng cùng xác thực quản trị hiện tại. Migration chỉ tạo bảng/chỉ mục lịch mới, không thay đổi tài khoản, đề, kết quả và học phí đang có.
