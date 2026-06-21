# Ứng Dụng Kiểm Kê Kho Đa Nền Tảng (Tích hợp Google Sheets)

Ứng dụng kiểm kê kho được thiết kế để chạy trên mọi nền tảng (Điện thoại, Tablet, Laptop, Android, iOS) với giao diện hiện đại (Premium Glassmorphic Dark Mode), hỗ trợ quét mã vạch bằng cả Camera trực tiếp và Máy quét chuyên dụng (CipherLab, máy quét cầm tay).

## 🚀 Hướng Dẫn Cài Đặt và Chạy Thử Nhanh

### Bước 1: Thiết lập Thư mục Làm việc (Workspace)
Để làm việc và phát triển tiếp dự án này, vui lòng chạy lệnh/thiết lập thư mục hoạt động tại đường dẫn:
```text
/Users/mac/.gemini/antigravity/scratch/inventory_app
```

### Bước 2: Chạy Ứng Dụng Trên Máy Tính
Bạn có thể mở trực tiếp file [index.html](file:///Users/mac/.gemini/antigravity/scratch/inventory_app/index.html) bằng trình duyệt web (Chrome, Safari, Edge, Firefox) hoặc chạy bằng Live Server để thử nghiệm:
1. Bạn có thể mở Terminal lên và chạy lệnh sau (nếu máy có sẵn python):
   ```bash
   python3 -m http.server 8000
   ```
2. Mở trình duyệt truy cập: `http://localhost:8000`

---

## 📸 Hướng Dẫn Cấp Quyền Camera Trên Thiết Bị Di Động (Android / iOS)

> [!IMPORTANT]
> **Yêu cầu kết nối HTTPS bảo mật:**
> Trình duyệt Chrome và Safari trên thiết bị di động **bắt buộc chặn tính năng Camera** nếu trang web không chạy qua giao thức bảo mật `https://` (chỉ ngoại lệ đối với `http://localhost` trên máy tính).

Để chạy trên điện thoại và bật được camera:
1. **Cách 1 (Khuyên dùng khi chạy thử):** Dùng phần mềm tạo đường hầm an toàn như [ngrok](https://ngrok.com/) hoặc Local Tunnel để tạo link HTTPS tạm thời từ cổng chạy trên máy tính của bạn:
   ```bash
   npx localtunnel --port 8000
   ```
   Sau đó quét mã QR của link `https://...` được sinh ra bằng điện thoại của bạn. Trình duyệt sẽ cấp quyền camera ngay lập tức.
2. **Cách 2 (Triển khai chính thức):** Deploy code ứng dụng web này lên các hosting miễn phí có sẵn SSL/HTTPS như Vercel, Netlify, Github Pages hoặc host nội bộ có cấu hình HTTPS SSL.

---

## 📊 Hướng Dẫn Kết Nối Google Sheets làm Database Real-time

Ứng dụng được thiết kế chạy sẵn ở chế độ Offline (mô phỏng) sử dụng dữ liệu trong [database.js](file:///Users/mac/.gemini/antigravity/scratch/inventory_app/database.js). Khi bạn muốn kết nối đồng bộ vào file Google Sheet thực tế của công ty, hãy làm như sau:

1. **Chuẩn bị Google Sheet:**
   - Tạo một bảng tính Google Sheet mới.
2. **Triển khai Apps Script:**
   - Tại thanh menu Google Sheet, chọn **Tiện ích mở rộng** (Extensions) -> **Apps Script**.
   - Copy toàn bộ nội dung của file [google_script.gs](file:///Users/mac/.gemini/antigravity/scratch/inventory_app/google_script.gs) trong dự án này và dán đè vào khung soạn thảo Apps Script.
   - Nhấn nút **Lưu** (Save - biểu tượng đĩa mềm).
3. **Triển khai Web App:**
   - Nhấn nút **Triển khai** (Deploy) ở góc trên bên phải -> Chọn **Triển khai mới** (New deployment).
   - Chọn loại triển khai (bánh răng) là **Ứng dụng web** (Web app).
   - Cấu hình:
     - *Thực thi dưới danh nghĩa (Execute as):* **Tôi (Me)**.
     - *Ai có quyền truy cập (Who has access):* **Bất kỳ ai (Anyone)**. (Đây là điểm bắt buộc để App di động gửi được dữ liệu).
   - Nhấn **Triển khai**, hệ thống sẽ yêu cầu Cấp quyền truy cập Google Drive/Sheet. Hãy đồng ý cấp quyền.
   - Trình duyệt sẽ hiển thị một đường dẫn **URL của ứng dụng web**. Hãy copy đường dẫn này.
4. **Kết nối trên ứng dụng:**
   - Nhấp vào biểu tượng bánh răng **⚙️ Cấu hình** ở góc trên cùng bên phải giao diện ứng dụng.
   - Dán URL vừa copy vào ô **Đường dẫn Google Apps Script Web App URL**.
   - Nhấn **Cập nhật kết nối**.
   - Ứng dụng sẽ tự động đồng bộ danh sách nhân viên và sản phẩm thực tế từ file Google Sheet của bạn!

---

## 🛠️ Hướng Dẫn Kiểm Thử Các Tính Năng Đặc Biệt

### 1. Đăng Nhập Nhân Viên Bằng QR Code
- Sử dụng camera quét mã QR của nhân viên có định dạng: `EMP001`, `EMP002`, hoặc `EMP003`.
- Hoặc nhập thủ công mã này vào ô nhập liệu rồi nhấn **Vào**.

### 2. Sử Dụng Máy Quét CipherLab & Máy Quét Cầm Tay
- Không cần phải nhấp chuột vào ô nhập liệu.
- Thiết bị CipherLab hoạt động như bàn phím ảo (Keyboard Wedge). Khi bạn quét một mã vạch (ví dụ: `8930000000001`), máy sẽ gõ nhanh mã vạch đó và nhấn **Enter**.
- Hệ thống có bộ lắng nghe sự kiện nhấn phím toàn cục (Global Keypress Listener) tự động bắt luồng ký tự tốc độ cao này, tự động tra cứu sản phẩm và hiển thị thông tin kiểm kê tương ứng.

### 3. Logic Ghi Nhận Kiểm Kê Lần 1, 2, 3 và Cộng Dồn
- Khi bạn quét sản phẩm A lần đầu tiên: Lịch sử đếm hiển thị Lần 1 trống, bạn nhập số lượng (ví dụ: `5`) -> lưu vào **Lần 1**.
- Khi quét tiếp sản phẩm A ở vị trí khác (lần thứ 2): Giao diện hiển thị đếm Lần 1 là `5` và tự động đánh dấu mục tiêu là **Lần 2**. Bạn nhập số lượng (ví dụ: `10`) -> lưu vào **Lần 2**.
- Khi quét lần thứ 3: Lưu vào **Lần 3**.
- Khi quét lần thứ 4 trở đi: Hệ thống tự động quy đổi về cùng một ĐVT và **cộng dồn trực tiếp vào Lần 3**.
- Dữ liệu lưu trên Google Sheet sẽ tự động phản ánh các cột này riêng biệt cho từng Nhân viên quét và từng Kho riêng biệt.

### 4. Quy Tắc Ưu Tiên Đơn Vị Tính (ĐVT)
- **Kho thương mại (Kho tổng):** Khi quét sản phẩm, hệ thống tự động ưu tiên ĐVT lớn nhất (thùng/kiện) trong dropdown.
- **Kho bán hàng (Siêu thị):** Hệ thống ưu tiên chọn ĐVT mặc định (gốc, được đánh dấu bằng dấu `*` vàng).
- Người dùng vẫn có thể click vào Dropdown để chọn bất kỳ ĐVT nào khác. Khi lưu, hệ thống tự động tính quy đổi ra ĐVT gốc và hiển thị ở cột tổng trên Google Sheets.

### 5. Hàng Không Có Trong Danh Mục & Chụp Ảnh
- Thử nhập mã vạch lạ (ví dụ: `999999`) rồi bấm tìm kiếm.
- Pop-up cảnh báo **"Hàng hóa không có trong dữ liệu"** sẽ hiển thị.
- Bạn có thể chụp ảnh mặt hàng đó bằng camera điện thoại, nhập mô tả (ví dụ: "Sữa dâu mới đổi bao bì") và bấm **Lưu ảnh lỗi**. Dữ liệu này sẽ tự gửi ảnh dưới dạng base64 lên Google Sheets (hoặc Drive) để kế toán kiểm tra.
