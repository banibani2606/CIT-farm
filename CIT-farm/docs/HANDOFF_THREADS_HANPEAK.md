# TÀI LIỆU BÀN GIAO (HANDOFF): HỆ THỐNG AUTOMATION THREADS & HANPEAK

> **Mục đích**: Tài liệu này tổng hợp toàn bộ hiện trạng, kiến trúc kỹ thuật, dữ liệu cấu hình, kịch bản tự động hóa 35 bước và hướng dẫn vận hành cho nhánh **Threads - Hanpeak** để chuyển sang cuộc trò chuyện mới mà không bị đè ngữ cảnh.

---

## 1. Tổng quan Dự án & Chiến dịch Hanpeak

- **Sản phẩm điều hướng**: **Hanpeak** (Ứng dụng web + iOS luyện nói tiếng Trung và phản xạ giao tiếp với AI).
- **Giá trị cốt lõi giải quyết**:
  - Người học biết từ vựng, ngữ pháp nhưng "câm nín", sợ nói, sợ bị đánh giá hoặc phản xạ chậm.
  - Tính năng: Pinyin 101 cho người mới hoàn toàn (thanh mẫu, vận mẫu, thanh 1 vs thanh 4); nạp từ vựng nhanh theo cụm; bài tập phản xạ; thực chiến hội thoại tình huống với AI có chấm lỗi phát âm tức thì.
- **Chiến lược tương tác Threads**:
  - Tự động tìm kiếm các bài viết có chủ đề người học tiếng Trung đang gặp khó khăn, than thở hoặc xin kinh nghiệm.
  - Sử dụng AI đóng vai 5 bạn trẻ Gen Z tương ứng với 5 thiết bị thật, viết bình luận đồng cảm sâu sắc, tự nhiên 100% theo văn hóa Threads (lowercase, dùng slang tự nhiên `=)))`, `má ơi`, `não lag`, `quê xỉu`).
  - Gợi ý Hanpeak như một công cụ tự phát hiện tình cờ (solo với bot AI đỡ ngại, luyện phản xạ công việc).
  - **Quy tắc vàng**: TUYỆT ĐỐI KHÔNG chèn link trực tiếp trong comment để tránh bị Meta quét spam/shadowban. Điều hướng thông qua tên app hoặc Profile / Link-in-Bio.

---

## 2. Kiến trúc & Các File Mã Nguồn Đã Xây Dựng

| File | Chức năng chính |
| :--- | :--- |
| `server/aiCommentService.js` | Engine biên soạn bình luận AI với **5 Gen Z Personas**, cơ chế song song **Gemini 2.5 Flash** (chính) và tự động chuyển đổi sang **OpenRouter DeepSeek-V3** khi lỗi/timeout. |
| `server/keywordRegistry.js` | Bộ từ khóa tìm kiếm phân tầng theo 6 nhóm nỗi đau, bộ nhớ xoay tua chống trùng lặp từ khóa gần nhất trên từng máy, ánh xạ từ khóa theo từng Persona. |
| `server/adb.js` | Quản lý ADB, tự động phát hiện loại bàn phím (`isAdbKeyboardActive`), xử lý gõ Base64 UTF-8 và kết nối Scrcpy Clipboard Injection bảo toàn 100% dấu tiếng Việt. |
| `server/scrcpyManager.js` | Cầu nối Scrcpy Server (`scrcpy-server-v2.4.jar`), hỗ trợ dán clipboard qua socket (`pasteText`) mượt mà trên ColorOS, Realme UI, OneUI. |
| `server/flowRunner.js` | Engine chạy kịch bản: Chạm thông minh theo UI Hierarchy (`Dynamic Touch`), quét nội dung bài viết (`ExtractPostContent`), tạo bình luận (`AiGenerateComment`), chọn từ khóa (`SelectKeyword`), tự phục hồi app (`AutoRecovery`). |
| `server/data.json` | Chứa kịch bản chuẩn `flow_threads_tieng_trung_hanpeak_ai` (35 nodes, 34 edges) đã test thành công trên máy thật. |
| `src/components/FlowBuilder.jsx` | Visual Editor cho phép xem sơ đồ node, chỉnh sửa Category từ khóa cho từng máy, hiển thị trạng thái thực thi thời gian thực. |

---

## 3. Cấu hình 5 Personas & Dàn Thiết Bị (5 Máy Thật)

| Thiết bị (Serial) | Dòng máy | Archetype Persona | Giọng điệu & Slang | Nhóm từ khóa ưu tiên |
| :--- | :--- | :--- | :--- | :--- |
| `BDE00051677` | Vsmart Aris | **Gen Z hướng nội sợ giao tiếp** | Hướng nội, sợ nói chuyện với người thật, sợ bị chê phát âm phèn (`quê xỉu`, `solo bot AI`) | • Luyện phản xạ & Sợ nói<br>• App luyện nói với AI |
| `GAGAA68HPVCEJFJV` | Realme CPH2321 | **Dân văn phòng bị dí tiếng Trung** | Đi làm gặp sếp/đối tác Trung Quốc bị cứng họng (`chầm kảm`, `toang`, `câm như hến`) | • Tiếng Trung đi làm & Công sở<br>• Luyện phản xạ tình huống |
| `R58W41KSL2Y` | Samsung A14 | **Chiến thần nhồi từ vựng nhưng não lag** | Nhồi từ vựng ngữ pháp cả đống nhưng mở mồm không ghép được câu (`não lag`, `mồm nhảy số`) | • Nạp từ theo cụm & Ghép câu<br>• Luyện phản xạ |
| `c216669c` | Oppo A53 | **Bà tám mách mẹo phát âm** | Chia sẻ mẹo thực chiến, từng bị lú thanh 1 thanh 4 (`kiếp nạn thứ 82`, `10 điểm không có nhưng`) | • Phát âm chuẩn & Pinyin 101<br>• Người mới bắt đầu |
| `fcec5b9c` | Realme 5s | **Gen Z mê app xịn / Tự học tiết kiệm** | Thích học nhanh, ghét tốn tiền khóa học đắt đỏ, khoe app xịn có bài học miễn phí | • App & Web luyện nói<br>• Lộ trình tự học từ đầu |

---

## 4. Kịch bản Chuẩn 35 Bước (`flow_threads_tieng_trung_hanpeak_ai`)

```text
[n_start] Bắt đầu
  ↓
[n_wake] Bật màn hình
  ↓
[n_pause_wake] Chờ 2s
  ↓
[n_open_threads] Mở Threads App (com.instagram.barcelona)
  ↓
[n_pause_load] Chờ nạp Threads 5s
  ↓
[n_recovery_1] Bảo vệ màn hình AutoRecovery
  ↓
[n_ensure_feed] Về Tab Feed chính (Tọa độ 98, 1424 / barcelona_tab_main_feed)
  ↓
[n_pause_feed] Chờ 1s
  ↓
[n_tap_search] Bấm icon Tìm kiếm (main_feed_search_button / 664, 120)
  ↓
[n_pause_search] Chờ mở Search 2s
  ↓
[n_focus_input] Focus ô Search (BdsSearchBarInput tại 360, 224)
  ↓
[n_pause_focus] Chờ nạp ô gõ 1s
  ↓
[n_select_keyword] Chọn từ khóa thông minh (SelectKeyword theo Persona từng máy)
  ↓
[n_type_keyword] Gõ: ${SearchKeyword}
  ↓
[n_press_enter] Bấm Enter tìm kiếm (input keyevent 66)
  ↓
[n_pause_results] Chờ nạp kết quả 4s
  ↓
[n_swipe_posts] Cuộn lướt xem bài (Swipe up 750ms)
  ↓
[n_pause_read] Dừng đọc bài 3s
  ↓
[n_extract_post] AI Quét nội dung bài (ExtractPostContent)
  ↓
[n_ai_generate] AI Biên bình luận Hanpeak (AiGenerateComment)
  ↓
[n_open_post_detail] Mở chi tiết bài viết (feed_post_text / 360, 480)
  ↓
[n_pause_detail] Chờ nạp bài 3s
  ↓
[n_like_post] Thả tim bài viết (feed_post_ufi_like_button / 70, 1062)
  ↓
[n_pause_before_comment] Chờ 2s
  ↓
[n_tap_reply_bar] Bấm Trả lời bài viết (feed_post_ufi_reply_button / 209, 1062)
  ↓
[n_pause_composer] Chờ mở ô nhập 2s
  ↓
[n_type_ai_comment] Gõ bình luận AI ${AiComment} (Scrcpy Clipboard / ADB)
  ↓
[n_pause_review] Dừng xem lại 2s
  ↓
[n_tap_post_button] Bấm nút Đăng (new_thread_screen_post_button / 628, 938)
  ↓
[n_pause_posted] Chờ gửi bình luận 4s
  ↓
[n_press_back] Quay lại danh sách (PressBack)
  ↓
[n_pause_exit] Chờ 2s
  ↓
[n_press_home] Về màn hình Home (PressHome)
  ↓
[n_stop_threads] Đóng Threads an toàn (StopApp)
  ↓
[n_finish] Hoàn thành (Stop)
```

---

## 5. Các Vấn Đề Kỹ Thuật Đã Được Giải Quyết Triệt Để

1. **Lỗi gõ tiếng Việt trên ColorOS (Oppo / Realme)**:
   - *Nguyên nhân*: ColorOS chặn phân quyền `WRITE_SECURE_SETTINGS` cho lệnh `ime set`, đồng thời `am broadcast` trả về `result=0` giả dù không có receiver nhận lệnh.
   - *Giải pháp*: Tự động kiểm tra `isAdbKeyboardActive(serial)`. Nếu không phải ADBKeyboard, chuyển sang tiêm văn bản qua `scrcpyManager.pasteText`, dán trực tiếp clipboard với 100% dấu tiếng Việt.
2. **Lỗi lệch tọa độ ô Tìm kiếm Threads**:
   - Khi ở trang tìm kiếm Threads, ô `BdsSearchBarInput` nằm ở `centerY: 224`. Kịch bản cũ bấm nhầm vào tiêu đề `(y: 128)` khiến bàn phím không bật. Đã được sửa sang `(360, 224)` kèm cơ chế `Dynamic Touch` tự quét ID.
3. **Lỗi mở nhầm màn hình Cài đặt khi Threads đang ở Profile**:
   - Bổ sung bước `n_ensure_feed` chạm vào `barcelona_tab_main_feed` trước khi bấm icon Tìm kiếm, đảm bảo luôn ở màn hình chính.
4. **Đã kiểm thử thực tế trên phần cứng (`GAGAA68HPVCEJFJV`)**:
   - Chạy thành công toàn bộ 35 bước, bình luận đã được đăng trực tiếp lên Threads và xác thực qua uiautomator dump.

---

## 6. Các Nhiệm Vụ Tiếp Theo Khi Mở Đoạn Chat Threads Mới

1. **Chạy lặp tự động (Continuous Farming Loop)**:
   - Thêm node lặp `Loop` để mỗi máy chạy quét và comment 3 - 5 bài viết mỗi phiên rồi nghỉ 30 - 60 phút.
2. **Lọc tương tác thông minh**:
   - Bỏ qua các bài viết đã có comment của chính mình hoặc bài viết có tương tác quá cũ (> 2 tuần).
3. **Theo dõi tỷ lệ chuyển đổi (Analytics/Tracking)**:
   - Đo lường lượt click vào Bio hoặc lượt tìm kiếm Hanpeak theo các mốc thời gian farm.
4. **Bật chế độ Farm đồng loạt 5 thiết bị**:
   - Chọn "Tất cả 5 thiết bị" trên giao diện FlowBuilder để 5 máy chạy song song 5 chủ đề khác nhau mà không sợ đụng hàng từ khóa.

