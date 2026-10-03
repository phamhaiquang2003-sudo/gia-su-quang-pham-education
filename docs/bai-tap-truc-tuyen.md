# Tạo đề và làm bài trực tuyến

## Dùng trên website

1. Đăng nhập tài khoản quản trị, mở `quan-tri.html` → **Bài tập**.
2. Điền tên đề, môn học, danh mục, hướng dẫn và thời gian từ **1–360 phút**.
3. Chọn cách đưa đề lên:
   - **Soạn từng câu trực tiếp:** nhập nội dung và các lựa chọn; có thể gắn ảnh công thức/minh họa.
   - **PDF / ảnh + phiếu trả lời:** tải tệp đề, thêm câu theo thứ tự trong tệp. Nội dung câu có thể để trống; các lựa chọn/ý có thể ghi A/B/C/D hoặc Ý a/b/c/d.
4. Mỗi câu có dạng **A/B/C/D**, **Đúng/Sai (4 ý)** hoặc **trả lời ngắn**. Nhập đáp án đúng, điểm trọng số và lời giải nếu có.
5. Bấm **Xem trước**, **Lưu nháp** hoặc **Xuất bản đề**. Đề xuất bản xuất hiện trong kho của môn đã chọn.
6. Bấm **Mở bài để làm thử** để thử bằng tài khoản quản trị. Trong **Danh sách đề → Kết quả học sinh**, lượt này được ghi là **Làm thử**.

PDF/PNG/JPG/WebP được tải trực tiếp, tối đa **1,8 MB mỗi tệp**, 8 tệp đề và 20 tệp tổng cộng/đề. Mỗi đề tối đa 100 câu. Nén tệp lớn trước khi tải. Bản đang soạn được giữ trong tab trình duyệt; bấm **Lưu nháp** để lưu lên máy chủ.

### Quy tắc chấm

- Điểm từng câu là trọng số, tổng điểm được quy đổi về thang 10 và làm tròn 2 chữ số thập phân.
- A/B/C/D: đúng được toàn bộ điểm câu.
- Đúng/Sai: chia đều 25%/ý đúng hoặc tính 10% / 25% / 50% / 100% khi đúng 1 / 2 / 3 / 4 ý.
- Trả lời ngắn: mỗi dòng là một đáp án chấp nhận. Nhận diện `0,5`, `0.5`, `1/2` là tương đương; có thể đặt sai số tuyệt đối cho kết quả số. Văn bản được chuẩn hóa khoảng trắng và chữ hoa/thường, vẫn phân biệt dấu tiếng Việt.
- Ô **Hiện đáp án và lời giải ngay sau khi nộp** quyết định việc học sinh có thấy đáp án sau khi chấm hay không.

### Học sinh

Đăng nhập → mở kho môn học → **Mở bài tập** → **Bắt đầu làm bài**. Đồng hồ mới chạy khi bắt đầu; mỗi tài khoản có một lượt/đề. Bấm số câu để chuyển nhanh; dấu cờ **Đánh dấu xem lại** độc lập với trạng thái đã trả lời và không ảnh hưởng điểm.

Câu trả lời và dấu cờ tự lưu sau khoảng 0,9 giây ngừng thay đổi. Khi mất mạng, trang giữ bản chưa đồng bộ trên thiết bị và thử lại; trạng thái lưu hiển thị trên trang. Tải lại trang lấy cùng lượt làm và thời hạn từ máy chủ. Trước khi nộp sớm có thông báo số câu chưa hoàn tất/đánh dấu.

Hết giờ, khóa trả lời và chấm **các câu đã được máy chủ lưu trước hạn**, kể cả khi yêu cầu gửi đáp án đến muộn. Trang đang mở tự nộp; tác vụ máy chủ chạy mỗi 5 phút hoàn tất các lượt hết hạn theo từng đợt khi học sinh đã đóng trang. Khi offline, việc ghi kết quả có thể trễ và cần nhiều đợt nếu có nhiều lượt chờ, nhưng thời hạn được giữ nguyên. Mở lại bài hoặc giáo viên tải kết quả cũng hoàn tất các lượt đã hết hạn. Kết quả đã nộp không thể sửa hoặc làm lại bằng cùng tài khoản.

Đề hiện giao cho tất cả tài khoản hoạt động. Có thể **ẩn đề** khỏi kho; các lượt đã bắt đầu vẫn tiếp tục/xem kết quả. Sửa đề không thay đổi nội dung/đáp án của lượt đã bắt đầu, vì mỗi lượt lưu bản chụp riêng. Muốn cho học sinh làm một lượt mới, tạo một đề mới.

## Kiến trúc và triển khai

- Firebase Auth + hồ sơ Firestore tiếp tục xác thực tài khoản/claim quản trị, trạng thái hoạt động, khóa Auth và thu hồi phiên.
- Worker `phq-education-admin` nhận các thao tác `/api/quiz/*`; chỉ quản trị được lưu/xem đáp án và xem toàn bộ kết quả. Học sinh chỉ xem lượt làm của chính mình.
- Cloudflare **D1 Free** `phq-education-exercises`, binding `QUIZ_DB`, lưu đề, tệp nhị phân, lượt làm, đáp án và kết quả. Không dùng Firebase Storage, Cloud Functions hoặc Blaze.
- Tệp chưa xuất bản chỉ quản trị truy cập. Tệp đề xuất bản được tài khoản hoạt động đọc; tệp của phiên bản cũ vẫn truy cập được qua lượt làm của chính học sinh.
- Dữ liệu gửi học sinh trước nộp không chứa đáp án/lời giải; điểm tính trên Worker. Đáp án giáo viên soạn chỉ lưu trong vùng quản trị và trên máy chủ.
- Các thay đổi tiến độ dùng số phiên bản; hai cửa sổ sửa cùng lượt sẽ yêu cầu tải lại để tránh ghi đè âm thầm. Nộp lặp lại trả về cùng kết quả.
- Firestore Rules không cần mở thêm quyền cho kho đề này.

Chạy từ thư mục `worker`:

```powershell
npm test
npx wrangler d1 migrations apply phq-education-exercises --remote
npm run deploy
```

Frontend triển khai qua GitHub Actions khi push `main`. Migration ở `worker/migrations/0001_quizzes.sql`. Kiểm thử dùng SQLite thật để xác minh truy vấn, snapshot, quyền truy cập, chấm điểm, hạn nộp và tính lặp an toàn. D1, Worker và Firebase đều chịu hạn mức gói miễn phí tương ứng.
