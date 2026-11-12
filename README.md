# CIT-FARM (Android Phone Farm Automation Platform)

> **Hệ thống điều khiển & tự động hóa Phone Farm Android chuyên nghiệp**, được phát triển dựa trên kiến trúc tương thích GenFarmer, tích hợp truyền hình ảnh phần cứng Scrcpy H.264 GPU 60 FPS, trình giả lập hành vi người dùng, quản lý tài khoản & 2FA thời gian thực, và lập lịch nuôi nick thông minh.

---

## 🌟 Tính Năng Nổi Bật

- 🚀 **Scrcpy H.264 Hardware Streaming (30 - 60 FPS)**:
  - Tích hợp trực tiếp `scrcpy-server v2.4` trên thiết bị và giải mã bằng WebCodecs phía trình duyệt (`VideoDecoder` tăng tốc phần cứng GPU NVIDIA / Intel / AMD).
  - Độ trễ cực thấp (< 50ms), điều khiển cảm ứng chuột (chạm, vuốt mượt mà, cuộn bánh xe chuột) theo thời gian thực.
  - Hỗ trợ đa dạng Preset: `60 FPS HD`, `30 FPS Mượt`, `20 FPS Farm`, `12 FPS Eco`.
- 📱 **Quản lý Farm Đa Thiết Bị (Multi-Device ADB Control)**:
  - Tự động nhận diện thiết bị cắm cáp USB qua ADB.
  - Hỗ trợ điều khiển đồng thời hoặc điều khiển riêng từng máy.
  - Phím tắt điều khiển: Home, Back, Menu, Tăng/Giảm âm lượng, Đánh thức màn hình (Wake / Unlock).
- 🔍 **UI Inspector & Trích Xuất Giao Diện**:
  - Dump cấu trúc XML cây giao diện phân tích toạ độ, resource-id, class, text nhanh chóng.
  - Hỗ trợ click trực tiếp lên ảnh chụp màn hình để trích xuất Selector cho kịch bản.
- 🔄 **Flow Builder & Động Cơ Tự Động Hóa (Tương thích GenFarmer JSON)**:
  - Trình dựng kịch bản dạng Node Flow trực quan (`@xyflow/react`).
  - Hỗ trợ đầy đủ các thao tác: `Click`, `Swipe`, `InputText` (hỗ trợ tiếng Việt qua ADBKeyboard), `Sleep`, `Loop`, `Condition`, `AppLaunch`, `ShellCommand`.
  - Tự động thay thế biến động: `${field.uid}`, `${field.password}`, `${field.2fa}`, `{{account.otp}}`.
- 👥 **Quản lý Tài Khoản & 2FA TOTP (RFC 6238)**:
  - Nhập hàng loạt định dạng: `UID|Pass|2FA|Mail|MailPass`.
  - Phân bổ tài khoản thông minh: Chia đều danh sách tài khoản theo thuật toán Round-Robin cho các máy đang Online.
  - Tự động tính toán mã 2FA 6 số theo thời gian thực kèm đồng hồ đếm ngược chu kỳ 30 giây.
- ⏰ **Hệ Thống Lập Lịch Chạy Nền (Scheduler Engine)**:
  - Động cơ chạy ngầm độc lập kiểm tra mỗi 10 giây.
  - Hỗ trợ hẹn giờ cố định hàng ngày (Daily) hoặc chu kỳ lặp lại (Interval: 15m, 30m, 60m, 120m...).
  - Tự động đánh thức máy và luân phiên tài khoản (Account Rotation) với thời gian nghỉ an toàn (Cooldown).
- 🤖 **AI Seeding & Tương Tác Tự Nhiên (Gemini AI)**:
  - Tích hợp Google Gemini API tự động phân tích bài viết và bình luận thông minh chuẩn giọng Gen Z, chống spam / lặp lại nội dung.

---

## 🛠️ Công Nghệ Sử Dụng

- **Frontend**: React 19, Vite 8, Tailwind CSS, `@xyflow/react`, `lucide-react`, WebCodecs API.
- **Backend**: Node.js v20+, Express 5, WebSocket (`ws`), pure Node TOTP engine (`otplib`), `fast-xml-parser`.
- **Hạ Tầng Thiết Bị**: Android Debug Bridge (ADB), `scrcpy-server-v2.4`, `ADBKeyboard.apk`.

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Yêu Cầu Tiên Quyết
- Máy tính chạy **Windows 10 / 11**.
- **Node.js** phiên bản 20 trở lên.
- Thiết bị Android đã bật **Tùy chọn nhà phát triển** và **Gỡ lỗi USB (USB Debugging)**.
- Đã cài đặt **Android SDK Platform-Tools** (hoặc cấu hình đường dẫn `ADB_PATH`).

### 2. Cài Đặt Mã Nguồn

```bash
# Clone repository
git clone https://github.com/ndtam1112/farmer.git
cd farmer

# Cài đặt các gói phụ thuộc
npm install
```

### 3. Cấu Hình Môi Trường (.env)

Tạo file `.env` từ file mẫu `.env.example`:

```bash
cp .env.example .env
```

Điền thông tin khóa API Gemini (tùy chọn nếu sử dụng tính năng AI Seeding):
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=55555
```

### 4. Khởi Chạy Hệ Thống

Chạy đồng thời cả Backend API và Frontend Dev Server:

```bash
npm run dev
```

- **Frontend UI**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://127.0.0.1:55555](http://127.0.0.1:55555)
- **Scrcpy WebSocket**: `ws://127.0.0.1:55555/ws/scrcpy`

---

## 📋 Cấu Trúc Thư Mục

```text
cit-farm/
├── apks/                  # APK phụ trợ (ADBKeyboard, etc.)
├── public/                # Tài nguyên tĩnh
├── samples/               # Mẫu kịch bản tương thích GenFarmer JSON
├── server/
│   ├── adb.js             # Quản lý kết nối ADB & lệnh thiết bị
│   ├── scrcpyManager.js   # Quản lý H.264 video stream & điều khiển cảm ứng
│   ├── flowRunner.js      # Bộ thực thi kịch bản tự động hóa
│   ├── scheduler.js       # Background Scheduler Engine
│   ├── dataStore.js       # Lưu trữ tài khoản, lịch trình, kịch bản
│   ├── totp.js            # Bộ sinh mã 2FA RFC 6238
│   ├── aiCommentService.js# Tích hợp Gemini AI tạo nội dung
│   └── index.js           # Express API & WebSocket Server
├── src/
│   ├── components/        # ControlCenter, FlowBuilder, AccountManager, SchedulerManager...
│   ├── utils/             # scrcpyPool (WebCodecs H.264 Player)
│   └── App.jsx            # Điều hướng chính của ứng dụng
├── .env.example           # File mẫu biến môi trường
└── package.json
```

---

## 📄 Bản Quyền & Giấy Phép

Phát triển bởi đội ngũ CIT. Mã nguồn phục vụ mục đích nghiên cứu, học tập và tự động hóa thử nghiệm.
