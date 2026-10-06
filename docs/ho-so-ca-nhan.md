# Hồ sơ cá nhân

Mở menu tên tài khoản → **Hồ sơ cá nhân** để truy cập `ho-so.html`. Trang yêu cầu đăng nhập, dùng nền đêm sao và hiển thị dữ liệu của chính tài khoản đang sử dụng.

- Thẻ thông tin hiển thị họ tên, vai trò, tên đăng nhập và ảnh đại diện đã lưu hoặc chữ cái đầu của tên. Trang hồ sơ không có nút thay đổi ảnh đại diện.
- **Số môn đã học** là số môn có lượt làm bài. **Số bài đã làm** là số lượt đã nộp, gồm cả lượt làm lại và tự luận chờ chấm.
- **Thời gian làm bài** cộng thời gian từ lúc bắt đầu đến lúc nộp hoặc hết giờ; không phải thời gian theo dõi hoạt động trên trình duyệt.
- **Chuỗi ngày học** đếm những ngày bắt đầu làm bài liên tiếp theo giờ Việt Nam, với ngày gần nhất là hôm nay hoặc hôm qua.
- **Tiến độ học tập** = số đề đang xuất bản đã nộp ít nhất một lần / tổng số đề đang xuất bản của môn đó. Làm lại cùng một đề không làm tăng số đề hoàn thành.
- **Lịch sử làm bài gần đây** hiển thị tối đa 10 lượt, giữ tên đề tại thời điểm làm bài. Bài tự luận chưa chấm hiển thị **Chờ chấm**; lượt đang làm hiển thị **Đang làm**. Điểm dùng thang 10. Khi giáo viên cấp lượt làm lại, lượt cũ được xóa khỏi lịch sử và thống kê; lượt mới bắt đầu trống.

Ảnh và lịch sử được lấy theo UID đã xác thực trên máy chủ. Các API `profileOverview`, `profileAvatar`, `profileAvatarUpload` không nhận UID đích từ trình duyệt. Mật khẩu và thông tin phân quyền vẫn thuộc Firebase.
