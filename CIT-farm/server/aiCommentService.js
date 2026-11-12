import https from 'https';
import { classifyPost } from './keywordRegistry.js';

// Gemini API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PRIMARY_MODEL = 'gemini-2.5-flash-lite';
const FALLBACK_MODEL = 'gemini-flash-lite-latest';

// Circuit breaker for quota limits (auto-fallback to offline templates when 429)
let quotaExceededUntil = 0;

// Global farm-wide sliding window history to guarantee ZERO comment repetition across all devices
const globalRecentComments = [];

// 5 Distinct Gen Z Archetypes with rotating situational angles for the 5 farming devices
export const DEVICE_PERSONAS = {
  // Device 1: Vsmart Aris
  'BDE00051677': {
    name: 'Gen Z hướng nội sợ giao tiếp',
    tone: 'Nhỏ bạn Gen Z hướng nội, sợ người lạ, tự học trong phòng, sợ nói sai bị chê phát âm phèn, tâm sự chân thành',
    slang: 'nói thật chứ, sợ quê xỉu, qué qué, 😭, tự lẩm nhẩm một mình, ngại xỉu, lú cái đầu, rén ngang',
    angles: [
      'hướng nội học tiếng trung đọc hiểu tốt nhưng mở mồm chào là run bần bật',
      'sợ phát âm sai bị chê quê nên toàn chui trong phòng tự học một mình',
      'mẹo tự luyện khẩu ngữ một mình mà không cần ra trung tâm đông người',
      'nỗi sợ thi nói HSKK hoặc bị gọi đứng trước lớp phát biểu tiếng Trung',
      'cày phim Trung Quốc hiểu hết nhưng bảo mở mồm nói 1 câu là đứng hình'
    ]
  },
  // Device 2: Realme CPH2321
  'GAGAA68HPVCEJFJV': {
    name: 'Gen Z mới đi làm bị dí tiếng Trung',
    tone: 'Dân văn phòng / thực tập sinh công ty, hay gặp sếp hoặc đối tác Trung Quốc mà bị cứng họng',
    slang: 'bác ơi, não 404 not found, sếp hỏi là đơ, toang thật sự, bất lực, mồm ngậm như hến, =))), cứu vớt',
    angles: [
      'đi làm công ty trung quốc: cv ghi biết tiếng trung, vào họp sếp hỏi 1 câu não 404 not found',
      'chat Wechat viết mail thì tra từ điển được chứ sếp gọi điện thoại là mồm ngậm như hến',
      'phỏng vấn xin việc tiếng Trung bị khớp ở vòng test phản xạ tình huống',
      'đi tiếp khách hoặc ăn cơm với đối tác Trung Quốc mà đứng hình mất 10 giây',
      'học xong HSK 5 đi làm thực tế nhận ra tiếng Trung sách vở khác xa đời thực'
    ]
  },
  // Device 3: Samsung A14
  'R58W41KSL2Y': {
    name: 'Chiến thần nhồi từ vựng nhưng não lag',
    tone: 'Đã cày qua cả đống từ vựng ngữ pháp nhưng cứ hễ mở mồm ra là não load chậm như rùa',
    slang: 'não load chậm như rùa, ét o ét, xỉu ngang, 🥲, mồm nhảy số không kịp, nạp từ chay, nghẽn mạng toàn tập',
    angles: [
      'cái bẫy nhồi cả 1.000 từ vựng HSK nhưng đố ghép nổi 1 câu giao tiếp trọn vẹn',
      'nói tiếng Trung bị dịch từng chữ từ tiếng Việt sang trong đầu nên não load cực chậm',
      'dừng ngay việc học từ vựng đơn lẻ, đổi sang nạp theo cụm diễn đạt thực tế',
      'thuộc lòng cả quyển ngữ pháp nhưng lúc nói thì mồm lắp bắp không theo kịp suy nghĩ',
      'bí kíp biến từ vựng chết trong vở thành từ vựng sống nói được ngay'
    ]
  },
  // Device 4: Oppo A53
  'c216669c': {
    name: 'Bà tám Gen Z mách nước phát âm',
    tone: 'Thích chia sẻ mẹo học thực dụng, tính tình thẳng thắn, ghét lý thuyết suông hàn lâm',
    slang: 'mấy bà ơi, lú thanh điệu, kiếp nạn thứ 82, khóc thét, quê muốn độn thổ, 10 điểm không có nhưng, chỉnh âm chuẩn đét',
    angles: [
      'kiếp nạn thanh 1 với thanh 4 đọc y chang nhau khiến người nghe tưởng chửi thề',
      'âm cuộn lưỡi zh ch sh r và âm răng môi z c s đọc vẹo cả quai hàm',
      'bẫy biến điệu thanh điệu: hai thanh 3 đi liền nhau, biến điệu của yī và bù',
      'tự đọc tưởng chuẩn nhưng đo sóng âm mới biết sai bét cao độ',
      'đừng vội học ngữ pháp cao siêu khi phát âm thanh điệu cơ bản còn chưa vững'
    ]
  },
  // Device 5: Realme 5s
  'fcec5b9c': {
    name: 'Gen Z mê trải nghiệm tự học thông minh',
    tone: 'Trẻ trung, mê phương pháp học tiện, ghét tốn tiền vô bổ, thích học nhanh vui vẻ có kết quả liền',
    slang: 'mấy ní ơi, cuốn xỉu, đỉnh chóp, mê chữ ê kéo dài, thử đi nè, kiki, =))), học vui như chơi game',
    angles: [
      'ai bảo muốn nói tiếng trung lưu loát là phải tốn chục triệu đi trung tâm?',
      'mới bắt đầu tự học: tập mở mồm nói phản xạ trước, đừng nhồi lý thuyết suông',
      'lộ trình tự học nói tiếng Trung tại nhà cho sinh viên nghèo tiết kiệm',
      'vừa học vừa giải trí như chơi game không bị nản',
      'cách tự tạo môi trường luyện nói tiếng Trung hàng ngày ngay trên điện thoại'
    ]
  }
};

export const PERSONA_POST_CONFIGS = DEVICE_PERSONAS;

// 6 Phong cách mở đầu ngẫu nhiên chống rập khuôn, chống cố định comment
export const OPENING_STYLES = [
  {
    type: 'curious_question',
    label: 'Hỏi ngược tò mò',
    instruction: 'Mở đầu bằng câu hỏi ngắn gợi sự đồng điệu (ví dụ: "Bác có bị tật vừa nói vừa dịch nhẩm từ tiếng Việt sang không?", "Nghe người ta nói thì hiểu mà mồm cạy không ra chữ đúng không bà?")'
  },
  {
    type: 'insight_discovery',
    label: 'Insight bất ngờ',
    instruction: 'Mở đầu bằng một phát hiện thực tế (ví dụ: "Mình thấy có một khoảng cách khá lớn giữa việc nhận diện câu với việc tự bật ra câu giao tiếp á...", "Cái bẫy lớn nhất là nhồi từ vựng đơn lẻ trên giấy đó mấy bà...")'
  },
  {
    type: 'self_deprecating',
    label: 'Tự dìm hài hước',
    instruction: 'Mở đầu bằng trải nghiệm dìm mình vui nhộn (ví dụ: "Hồi mới học tui cũng cày ngữ pháp dữ lắm xong ra đường gặp người Trung câm như hến =)))", "Tui từng tốn mấy tháng nhồi cả đống từ HSK xong mở mồm ra là nghẽn mạng 🥲...")'
  },
  {
    type: 'actionable_tip',
    label: 'Mẹo thực chiến',
    instruction: 'Mở đầu bằng mẹo thực tế đi thẳng vào việc (ví dụ: "Mẹo nhỏ cho bác: ngưng học từ đơn đi, chuyển sang nạp cả cụm tình huống...", "Bác thử áp dụng quy tắc 3 giây xem sao: nghe câu quen là bật lại luôn...")'
  },
  {
    type: 'gentle_empathy',
    label: 'Đồng cảm nhẹ nhàng',
    instruction: 'Mở đầu bằng sự an ủi chân thành (ví dụ: "Mình nghĩ đây là vấn đề khá phổ biến của hầu hết người học luôn á 🥲...", "Ai mới học cũng bị kẹt ở đoạn chuyển từ hiểu sang tự bật câu này hết trơn á bà...")'
  },
  {
    type: 'casual_chat',
    label: 'Tâm sự đời thường',
    instruction: 'Mở đầu theo vibe tán gẫu đời thường (ví dụ: "Hồi xưa tui cũng rén phát âm sai quê độ lắm =)))", "Dân đi làm công ty Trung Quốc sợ nhất quả sếp hỏi bất ngờ đúng không bác...")'
  }
];

// 5 Tình huống bình luận chiến lược (Archetypes) tạo giá trị (Value-First Seeding)
export const SITUATIONAL_GUIDELINES = {
  SITUATION_1_STRUGGLING: {
    name: 'Tình huống 1: Người đăng học lâu nhưng không nói được (Ưu tiên cao nhất)',
    approach: 'Đồng cảm + Phân tích khoảng cách giữa nhận diện chữ và tự bật câu thành tiếng.',
    ruleApp: 'TUYỆT ĐỐI KHÔNG NHẮC ĐẾN TÊN APP HANPEAK HOẶC BẤT KỲ TÊN APP NÀO Ở BƯỚC NÀY! Chỉ trao giá trị thực tế.',
    coreInsight: `
- Phân tích nguyên nhân: Học từ vựng và ngữ pháp giúp mình hiểu tiếng Trung, nhưng để tự nói được lại cần một quá trình luyện tập khác.
- Khoảng cách cốt lõi: Có một khoảng cách khá lớn giữa việc nhận diện được câu tiếng Trung và tự tạo ra câu để giao tiếp. Đặc biệt là phải tự bật câu thành tiếng, chứ chỉ nhìn và đọc câu mẫu thì không đủ.
- Giải pháp gợi ý: Khi học, thử chuyển mỗi mẫu câu thành vài tình huống khác nhau rồi tự trả lời thành tiếng xem sao. Nhận ra mình đang thiếu phần thực hành nhiều hơn là thiếu kiến thức.
`
  },

  SITUATION_2_REFLEX_PRACTICE: {
    name: 'Tình huống 2: Người hỏi cách luyện phản xạ',
    approach: 'Đưa ra phương pháp thực chiến: Tập phản xạ theo từng tình huống nhỏ, tự nói ra miệng.',
    ruleApp: 'TUYỆT ĐỐI KHÔNG NHẮC ĐẾN TÊN APP HANPEAK HOẶC BẤT KỲ TÊN APP NÀO! Chỉ chia sẻ phương pháp.',
    coreInsight: `
- Phương pháp cốt lõi: Nên tập phản xạ theo từng tình huống nhỏ trước, đừng cố học quá nhiều câu cùng lúc.
- Ví dụ cụ thể: Học chủ đề chào hỏi thì nạp từ vựng, cụm từ, mẫu câu rồi tự tập trả lời các tình huống liên quan.
- Điểm mấu chốt: Quan trọng là phải tự nói ra thành tiếng chứ không chỉ đọc thầm hoặc dịch nhẩm trong đầu.
`
  },

  SITUATION_3_APP_RECOMMENDATION: {
    name: 'Tình huống 3: Người hỏi app học tiếng Trung / xin review app',
    approach: 'Giới thiệu Hanpeak một cách tự nhiên, nêu đúng 3 giá trị trải nghiệm có cơ sở.',
    ruleApp: 'ĐÂY LÀ TÌNH HUỐNG DUY NHẤT ĐƯỢC GIỚI THIỆU HANPEAK (viết hoa chuẩn Hanpeak và AI).',
    coreInsight: `
- Mẫu chuẩn: "Nếu bạn đang tìm app để luyện nói thì có thể thử Hanpeak. Mình thấy hướng học của app khá đáng thử: học từ vựng, cụm từ, mẫu câu rồi luyện nói và thực chiến hội thoại với AI. Có hai phần đầu của Bài 1 miễn phí để trải nghiệm."
`
  },

  SITUATION_4_VOCAB_CHUNKS: {
    name: 'Tình huống 4: Người biết nhiều từ nhưng không ghép được câu',
    approach: 'Chuyển từ học từ đơn sang học theo cụm (chunks) và đặt vào tình huống cụ thể.',
    ruleApp: 'TUYỆT ĐỐI KHÔNG NHẮC ĐẾN TÊN APP HANPEAK HOẶC BẤT KỲ TÊN APP NÀO! Chỉ đưa phương pháp và ví dụ.',
    coreInsight: `
- Phương pháp cốt lõi: Chuyển từ học từ đơn sang học theo cụm và đặt từ vào tình huống cụ thể.
- Ví dụ trực quan: Thay vì chỉ nhớ từ 忙 (bận), hãy tập dùng nó trong câu hỏi và câu trả lời (như "最近忙什么呢?").
- Lợi ích: Khi học từ đã gắn với ngữ cảnh, việc vận dụng sẽ tự nhiên hơn rất nhiều.
`
  },

  SITUATION_5_FEAR_SPEAKING: {
    name: 'Tình huống 5: Người muốn luyện nói nhưng ngại sai',
    approach: 'Tháo gỡ rào cản tâm lý: Tạo cơ hội nói trong môi trường ít áp lực trước.',
    ruleApp: 'TUYỆT ĐỐI KHÔNG NHẮC ĐẾN TÊN APP HANPEAK HOẶC BẤT KỲ TÊN APP NÀO! Chỉ tháo gỡ tâm lý.',
    coreInsight: `
- Phương pháp cốt lõi: Muốn bớt ngại thì phải tạo cơ hội nói trong môi trường ít áp lực trước.
- Cách làm: Bắt đầu bằng việc tự nói một câu, nghe lại giọng mình và sửa từng lỗi nhỏ.
- Lời khuyên: Đừng đợi đến khi nói chuẩn rồi mới bắt đầu luyện nói, vì như vậy rất dễ trì hoãn.
`
  }
};

// 5 Core High-Engagement Viral Frameworks on Threads (Discovered via R&D)
export const VIRAL_POST_FRAMEWORKS = [
  {
    name: 'Kiếp nạn & Nỗi đau giấu kín (Relatable Struggle)',
    hookPattern: 'Mở đầu bằng nỗi sợ, kiếp nạn hoặc tình huống quê xỉu khiến người đọc bật cười vì trúng tim đen (dưới 80 ký tự).',
    bodyPattern: 'Tâm sự trải nghiệm thực tế, rồi chia sẻ cách tháo gỡ nhẹ nhàng cùng app Hanpeak (AI sửa lỗi phát âm, phản xạ 1-1 riêng tư).',
    ctaPattern: 'Câu hỏi mở kéo tương tác: "Ở đây có ai từng bị dính quả này giống tui không =)))" hoặc "Mấy bà có ai bị vậy không?".'
  },
  {
    name: 'Sự thật trần trụi vs Ảo tưởng (Counter-Intuitive Truth)',
    hookPattern: 'Đập tan một ảo tưởng/sai lầm phổ biến khi học tiếng Trung (nhồi từ vựng đơn lẻ, cày ngữ pháp suông, học bằng mắt).',
    bodyPattern: 'Giải thích tại sao cách cũ làm não bị lag/mồm ngậm như hến, mách nước đổi sang luyện cơ miệng & phản xạ theo cụm câu thực chiến trên app Hanpeak.',
    ctaPattern: 'Câu hỏi kích thích tranh luận: "Mọi người thuộc team cày từ vựng trước hay luyện nói trước?" hoặc "Có ai bị tật dịch nhẩm trong đầu giống tui không?".'
  },
  {
    name: 'Góc nhìn người đi làm thực chiến (Workplace Reality)',
    hookPattern: 'Tình huống thực tế công sở, phỏng vấn, gặp sếp/đối tác Trung Quốc bị cứng họng dù có bằng cấp.',
    bodyPattern: 'Chia sẻ kinh nghiệm: tiếng Trung đi làm cần tốc độ phản xạ và từ vựng chuyên môn thực chiến, giải pháp cày 15 phút mỗi tối với bot AI trên app Hanpeak.',
    ctaPattern: 'Câu hỏi kích thích: "Có ai đi làm mà sợ nhất khâu sếp gọi điện thoại bằng tiếng Trung giống tui không?".'
  },
  {
    name: 'Mẹo bẻ khoá phát âm & Pinyin (Pronunciation Hack)',
    hookPattern: 'Đánh trúng kiếp nạn phát âm (thanh 1 vs thanh 4, âm cuộn lưỡi, biến điệu) khiến người nghe hiểu nhầm dở khóc dở cười.',
    bodyPattern: 'Chỉ ra mẹo đặt lưỡi/bật hơi cực dễ hiểu, khuyên không tự luyện mù mờ mà nên để AI app Hanpeak chấm sóng âm cao độ sửa lỗi tức thì.',
    ctaPattern: 'Kêu gọi chia sẻ: "Bà nào còn chưa phân biệt được thanh 1 với thanh 4 điểm danh cái coi =)))".'
  },
  {
    name: 'Lộ trình tự học từ số 0 tiết kiệm (Zero-Budget Roadmap)',
    hookPattern: 'Đập tan suy nghĩ "muốn nói được tiếng Trung phải bỏ chục triệu đi học trung tâm".',
    bodyPattern: 'Vạch lộ trình tự học tại nhà: tập phát âm chuẩn trước -> nạp phản xạ theo cụm tình huống -> luyện nói trực tiếp với AI app Hanpeak hoàn toàn chủ động.',
    ctaPattern: 'Câu hỏi kết nối: "Mọi người tự học ở nhà thấy khó nhất ở bước nào: phát âm, nhớ từ hay mở mồm nói?".'
  }
];

// Offline Posts Matrix for fallbacks
export const OFFLINE_POSTS_MATRIX = {
  'BDE00051677': [
    `Học tiếng Trung đọc hiểu viết mượt mà nhưng cứ gặp người lạ là mồm khóa van luôn =)))\n\nNỗi sợ bị chê phát âm phèn, nói sai ngữ pháp quê muốn độn thổ làm tui chui rúc một mình cả năm trời.\n\nTừ đợt tìm ra chân ái solo 1-1 với bot AI trên app Hanpeak, máy nó chấm lỗi riêng tư nên tha hồ luyện khẩu ngữ không sợ ai cười.\n\nỞ đây có bạn nào hướng nội học tiếng Trung giống tui không?`,
    `Tự học tiếng Trung một mình trong phòng có cái sướng là không ai phán xét 🥲\n\nNgày xưa sợ phát âm sai nên không dám mở mồm nói với ai, giờ tối nào cũng mở app Hanpeak ra nói chuyện với AI 15 phút.\n\nNói vấp hay sai thanh điệu nó sửa ngay tại chỗ, mồm quen nhịp tự nhiên dạn dĩ hẳn lên.\n\nMọi người tự luyện khẩu ngữ một mình bằng cách nào chia sẻ tui với!`,
    `Cày hết chục bộ phim Trung Quốc nghe hiểu vanh vách, tới lúc ra đường gặp người Trung hỏi đường đứng hình mất 5 giây =)))\n\nBộ não nhận diện âm thanh với bộ não điều khiển cơ miệng nói là hai chuyện hoàn toàn khác nhau mấy bà ơi.\n\nPhải chịu khó mở mồm nhại giọng mỗi ngày, tui cày phản xạ hội thoại trên app Hanpeak thấy đỡ lag hơn hẳn.\n\nCó ai bị tình trạng nghe hiểu hết mà cạy mồm không ra chữ nào giống tui không?`
  ],
  'GAGAA68HPVCEJFJV': [
    `CV ghi: Tiếng Trung giao tiếp thành thạo.\nThực tế: Sếp Trung Quốc hỏi câu bất ngờ não 404 Not Found =)))\n\nChat Wechat hay viết mail thì dùng từ điển cứu được, chứ bước vào phòng họp sếp bắn tiếng Trung là mồm ngậm như hến.\n\nMay đợt này tối nào cũng cày phản xạ tình huống công sở trên app Hanpeak, AI đối thoại thực chiến nên giờ sếp hỏi là bật lại được liền.\n\nBác nào đi làm công ty Trung Quốc mà từng bị sếp dí quả này chưa?`,
    `Đi làm mới nhận ra: Tiếng Trung trong sách HSK với tiếng Trung sếp nói ở công ty là hai thế giới khác nhau 🥲\n\nSách dạy văn phong trang trọng, vào xưởng với văn phòng người ta nói vắn tắt, dùng toàn từ lóng với ngữ điệu đời thực.\n\nTui phải chuyển sang luyện phản xạ theo tình huống công việc thực tế trên app Hanpeak mới theo kịp nhịp làm việc.\n\nCác bác đi làm thấy kỹ năng nào quan trọng nhất: đọc viết hợp đồng hay phản xạ nói tức thì?`
  ],
  'R58W41KSL2Y': [
    `Cái bẫy lớn nhất đời tui: Chăm chỉ chép kín 3 quyển sổ từ vựng HSK nhưng đố nói nổi 1 câu trọn vẹn =)))\n\nNão mình ngộ lắm, nạp từ vựng đơn lẻ bằng mắt thì nhớ mặt chữ, nhưng lúc mở mồm ra là nghẽn mạng toàn tập.\n\nMuốn nói mượt thì phải nạp theo cụm tình huống và luyện cơ miệng nhại âm liên tục, tui đổi qua cày phản xạ trên app Hanpeak thấy khác bọt hẳn.\n\nMọi người thuộc team nhồi từ vựng trước hay luyện nói trước?`,
    `Có ai bị cái tật hễ chuẩn bị nói tiếng Trung là não tự động dịch từng chữ từ tiếng Việt sang không? 😭\n\nDịch nhẩm như vậy làm tốc độ nói chậm như rùa bò, câu cú nghe lại sượng trân gượng gạo.\n\nTui tập bỏ tật này bằng cách cày phản xạ nhanh trong 3 giây trên app Hanpeak, AI hỏi câu nào là mồm bật lại câu đó luôn không cho não kịp dịch.\n\nMấy ní có ai trị được tật dịch nhẩm trong đầu khi nói chưa?`
  ],
  'c216669c': [
    `Kiếp nạn phát âm tiếng Trung: Đọc thanh 1 với thanh 4 y chang nhau làm bạn người Trung tưởng mình đang chửi thề =)))\n\nThanh 1 đọc cao và ngân dài ngang, thanh 4 phải dứt khoát hạ giọng từ cao xuống thấp như ai đấm vào bụng vậy á.\n\nBà nào còn chưa phân biệt được thì tải app Hanpeak về cho AI chấm sóng âm cao độ sửa lỗi từng milimet nha.\n\nỞ đây có ai từng nói sai thanh 4 tạo ra hiểu nhầm quê độ chưa mấy bà?`
  ],
  'fcec5b9c': [
    `Ai bảo muốn nói tiếng Trung lưu loát là phải tốn chục triệu đi trung tâm? =)))\n\nThời buổi này tự cày phản xạ giao tiếp với AI trên app Hanpeak vừa tiện vừa cuốn xỉu, ở nhà vẫn bắn tiếng Trung ầm ầm.\n\nKhông tốn tiền học phí đắt đỏ mà lại chủ động thời gian, rảnh lúc nào mở app ra nói lúc đó.\n\nỞ đây có ai tự học tiếng Trung tại nhà từ số 0 mà thành công chưa?`
  ]
};

// Rich Matrix of Offline Fallback Comments categorized by the 5 Situations
// BÁM SÁT 100% CHIẾN THUẬT: TÌNH HUỐNG 1, 2, 4, 5 TUYỆT ĐỐI KHÔNG NHẮC HANPEAK!
// CHỈ DUY NHẤT TÌNH HUỐNG 3 MỚI GIỚI THIỆU HANPEAK.
export const OFFLINE_COMMENTS_MATRIX = {
  // Tình huống 1: Người học lâu không nói được (Core Pain Point) -> KHÔNG NHẮC APP
  situation_1_struggling: [
    `Mình nghĩ đây là vấn đề khá phổ biến luôn á bác.\n\nHọc từ vựng và ngữ pháp giúp mình hiểu tiếng Trung, nhưng để tự nói được lại cần một quá trình luyện tập khác.\n\nĐặc biệt là phải tự bật câu thành tiếng, chứ chỉ nhìn và đọc câu mẫu thì đôi khi vẫn chưa đủ đâu nè!`,

    `Mình thấy có một khoảng cách khá lớn giữa việc nhận diện được câu tiếng Trung và tự tạo ra câu để giao tiếp á.\n\nKhi học, bác thử chuyển mỗi mẫu câu thành vài tình huống khác nhau rồi tự trả lời thành tiếng xem sao nha.\n\nNhiều khi mình nhận ra là đang thiếu phần thực hành nói nhiều hơn là thiếu kiến thức á!`,

    `Nỗi khổ chung của người học tiếng Trung luôn á 🥲\n\nNão mình nhận diện mặt chữ với não điều khiển cơ miệng nói là 2 kỹ năng tách rời nhau.\n\nBác thử tập nhại to từng câu ngắn theo ngữ cảnh đời thực xem sao, nói to ra ngoài cơ miệng mới quen nhịp được á.`,

    `Hồi trước mình cũng cày từ vựng dữ lắm xong mở miệng ra là cứng họng =)))\n\nSau mới nhận ra là mình học bằng mắt nhiều quá mà ít chịu mở mồm nói thành tiếng. Bác thử tập nói từ mấy câu giao tiếp ngắn hàng ngày trước xem sao nha!`
  ],

  // Tình huống 2: Người hỏi cách luyện phản xạ -> KHÔNG NHẮC APP
  situation_2_reflex_practice: [
    `Mình nghĩ nên tập phản xạ theo từng tình huống nhỏ trước, đừng cố học quá nhiều câu cùng lúc nha bác.\n\nVí dụ học chủ đề chào hỏi thì nạp từ vựng, cụm từ, mẫu câu rồi tự tập trả lời các tình huống liên quan.\n\nQuan trọng nhất là phải tự nói ra thành tiếng chứ không chỉ đọc nhẩm trong đầu!`,

    `Bác thử áp dụng quy tắc 3 giây xem sao nè:\n\nNghe câu hỏi quen thuộc là tập bật lại câu trả lời ngay trong vòng 3 giây, đừng cố ghép từng từ từ tiếng Việt sang trong đầu vì sẽ làm não bị lag á.\n\nCứ bắt đầu từ mấy tình huống siêu nhỏ như chào hỏi hay gọi món trước cho quen não nảy số nha!`,

    `Muốn phản xạ nhanh thì bí quyết là phải nạp theo cả cụm câu á bác 🥲\n\nChứ lúc nói mà vừa nghĩ từ vựng vừa ghép ngữ pháp là lag toàn tập liền. Nạp sẵn cả cụm câu vào đầu thì khi cần mồm tự bật ra luôn, không mất thời gian suy nghĩ.`
  ],

  // Tình huống 3: Người hỏi app học tiếng Trung -> ĐƯỢC GIỚI THIỆU HANPEAK
  situation_3_app_recommendation: [
    `Nếu bạn đang tìm app để luyện nói thì có thể thử Hanpeak xem sao nha.\n\nMình thấy hướng học của app khá đáng thử: học từ vựng, cụm từ, mẫu câu rồi luyện nói và thực chiến hội thoại với AI.\n\nCó hai phần đầu của Bài 1 miễn phí để trải nghiệm á!`,

    `Bạn tham khảo app Hanpeak thử nhé!\n\nApp này tập trung vào flow học theo chủ đề: nạp từ vựng, học cụm từ, luyện nói rồi đưa vào hội thoại thực tế. Có bot AI nghe và phản hồi trực tiếp khi mình luyện nói luôn.\n\nHai phần đầu bài học được miễn phí, bạn tải về thử xem có hợp với mình không nha =)))`
  ],

  // Tình huống 4: Biết từ vựng nhưng không ghép được câu / Từ vựng chết -> KHÔNG NHẮC APP
  situation_4_vocab_chunks: [
    `Mình nghĩ có thể thử chuyển từ học từ đơn sang học theo cụm và đặt từ vào tình huống cụ thể bác ơi.\n\nVí dụ thay vì chỉ nhớ từ 忙 (bận) rời rạc, hãy tập dùng nó trong câu hỏi và câu trả lời như "最近忙什么呢?".\n\nKhi học từ đã gắn liền với ngữ cảnh thì việc vận dụng vào giao tiếp sẽ tự nhiên hơn rất nhiều á!`,

    `Bệnh chung của "từ vựng chết" đó bác ơi 😭\n\nBiết từ đơn lẻ nhưng não không biết lắp vào đâu. Hãy ngưng học từ vựng riêng lẻ, chuyển sang nạp theo cụm từ (chunks) và cấu trúc câu hoàn chỉnh ngay đi nhé.\n\nNão mình nhớ theo ngữ cảnh nhanh hơn nhớ từ đơn nhiều lắm!`
  ],

  // Tình huống 5: Ngại nói, sợ nói sai, rào cản tâm lý -> KHÔNG NHẮC APP
  situation_5_fear_speaking: [
    `Mình nghĩ muốn bớt ngại thì phải tạo cơ hội nói trong môi trường ít áp lực trước á bạn.\n\nCó thể bắt đầu bằng việc tự nói một câu, nghe lại giọng mình và sửa từng lỗi nhỏ.\n\nĐừng đợi đến khi nói chuẩn rồi mới bắt đầu luyện nói, vì như vậy rất dễ bị trì hoãn á!`,

    `Sợ sai là tâm lý của 90% người mới học rồi bác ơi 🥲\n\nCứ đóng cửa phòng tự nói một mình trước cho quen cơ miệng đã, nói sai cũng chẳng ai cười mình. Quen với âm thanh giọng mình rồi thì tự khắc sẽ dạn dĩ hơn khi giao tiếp với người ngoài thôi à.`
  ],

  // Khó khăn phát âm / Pinyin -> KHÔNG NHẮC APP
  pronunciation: [
    `Phát âm tiếng Trung đừng tự luyện mù mờ nha bác, dễ bị thành thói quen xấu phết á 🥲\n\nĐặc biệt thanh 1 với thanh 4 đọc sai là người ta hiểu nhầm nghĩa liền. Bác thử tập soi khẩu hình và nghe kỹ cao độ từng âm trước khi ghép câu nha.`
  ],

  // Tiếng Trung đi làm / Công sở -> KHÔNG NHẮC APP
  workplace: [
    `Đi làm thì phản xạ tức thì quan trọng hơn ngữ pháp sách vở nhiều bác ơi.\n\nTrong công việc sếp hay hỏi nhanh, bác cứ tập sẵn mấy cụm báo cáo tiến độ quen thuộc, nghe sếp hỏi là bật lại luôn đỡ bị khớp nha.`
  ],

  general: [
    `Muốn nói trôi chảy thì phải chịu khó mở mồm nhại giọng thành tiếng mỗi ngày á bác!\n\nĐọc thầm bằng mắt thì muôn đời não vẫn bị nghẽn ở khâu phản xạ, cứ nói to ra miệng là tiến bộ nhanh nhất à.`
  ]
};

// Aliases for compatibility
OFFLINE_COMMENTS_MATRIX.vocabulary_lag = OFFLINE_COMMENTS_MATRIX.situation_4_vocab_chunks;
OFFLINE_COMMENTS_MATRIX.introvert_fear = OFFLINE_COMMENTS_MATRIX.situation_5_fear_speaking;
OFFLINE_COMMENTS_MATRIX.beginner_selfstudy = OFFLINE_COMMENTS_MATRIX.situation_2_reflex_practice;

// Track recently used templates per serial/key to ensure non-repetition
const recentPostHistory = new Map();
const recentCommentHistory = new Map();

function getRotatedItem(array, key, historyMap) {
  if (!array || array.length === 0) return '';
  const lastIndices = historyMap.get(key) || [];
  
  const availableIndices = [];
  for (let i = 0; i < array.length; i++) {
    if (!lastIndices.includes(i)) {
      availableIndices.push(i);
    }
  }

  const chosenIdx = availableIndices.length > 0 
    ? availableIndices[Math.floor(Math.random() * availableIndices.length)]
    : Math.floor(Math.random() * array.length);

  lastIndices.push(chosenIdx);
  if (lastIndices.length > Math.max(1, Math.floor(array.length / 2))) {
    lastIndices.shift();
  }
  historyMap.set(key, lastIndices);

  return array[chosenIdx];
}

/**
 * Contextual smart replacement for AI vs Vietnamese pronoun "ai"
 * Prevents "Có ai không" from becoming "Có AI không" while ensuring "bot AI", "app AI" are capitalized.
 */
export function smartReplaceAI(str) {
  if (!str) return '';
  return str
    // 1. Tech contexts: bot ai, app ai, tính năng ai, công nghệ ai, chat ai, với ai, theo ai, cùng ai
    .replace(/\b(bot|app|tính năng|công nghệ|chat|với|theo|cùng|nhờ|solo với|đối thoại với|nói chuyện với)\s+ai\b/gi, (m, p1) => p1 + ' AI')
    // 2. Action contexts: ai chấm, ai sửa, ai phân tích, ai nhận diện, ai luyện, ai đo, ai hướng dẫn, ai bắt
    .replace(/\bai\s+(chấm|sửa|phân tích|nhận diện|luyện|đo|hướng dẫn|chỉ|bắt|nhận xét)\b/gi, (m, p1) => 'AI ' + p1)
    // 3. Keep standard AI / A.I
    .replace(/\bA\.I\b/gi, 'AI');
}

/**
 * Generate an authentic Gen Z Threads comment based on post content, device persona and situational archetype.
 * Enforces:
 * 1. CHIẾN THUẬT SEEDING BẰNG GIÁ TRỊ (VALUE-FIRST):
 *    - Tình huống 1, 2, 4, 5: TUYỆT ĐỐI KHÔNG NHẮC TÊN APP HANPEAK!
 *    - Chỉ duy nhất Tình huống 3 (hỏi app) mới giới thiệu Hanpeak.
 * 2. FORMAT THOÁNG MẮT: 2 - 3 dòng ngắn ngắt bằng \n\n.
 * 3. ANTI-STATIC: Chống cố định, chống lặp từ sáo rỗng.
 */
export async function generateThreadsComment(postContent = '', serial = 'GAGAA68HPVCEJFJV', targetSituation = null) {
  const persona = DEVICE_PERSONAS[serial] || DEVICE_PERSONAS['GAGAA68HPVCEJFJV'];
  const angles = persona.angles || [];
  const randomAngle = angles[Math.floor(Math.random() * angles.length)] || 'luyện phản xạ tiếng Trung';
  const openingStyle = OPENING_STYLES[Math.floor(Math.random() * OPENING_STYLES.length)];
  const sessionNonce = Math.random().toString(36).substring(2, 6);

  // Phân loại tình huống nếu chưa có
  let situationKey = targetSituation;
  if (!situationKey) {
    const postClass = classifyPost(postContent);
    situationKey = postClass.situation;
  }

  const situationGuide = SITUATIONAL_GUIDELINES[situationKey] || SITUATIONAL_GUIDELINES.SITUATION_1_STRUGGLING;
  const isAppAskingSituation = situationKey === 'SITUATION_3_APP_RECOMMENDATION';

  const systemPrompt = `Bạn là một bạn trẻ Gen Z Việt Nam (19 - 24 tuổi) đang lướt mạng xã hội Threads.
Bạn tình cờ đọc được một bài viết của một bạn đang học tiếng Trung và để lại 1 bình luận ngắn chia sẻ góc nhìn hữu ích.

BẢN SẮC & VIBE CỦA BẠN (Phiên ngẫu nhiên #${sessionNonce}):
- Archetype: ${persona.name}
- Phong cách giao tiếp: ${persona.tone}
- Từ ngữ / Slang đặc trưng: ${persona.slang}
- Góc nhìn ưu tiên hôm nay: ${randomAngle}
- Phong cách mở đầu gợi ý: ${openingStyle.label} (${openingStyle.instruction})

TÌNH HUỐNG & CHIẾN LƯỢC TẠO GIÁ TRỊ:
- Tên tình huống: ${situationGuide.name}
- Tiếp cận: ${situationGuide.approach}
- Hướng dẫn nội dung cốt lõi:
${situationGuide.coreInsight}

QUY TẮC BẮT BUỘC VỀ SẢN PHẨM & THƯƠNG HIỆU (CHIẾN THUẬT 2 BƯỚC):
${isAppAskingSituation ? `
1. ĐÂY LÀ BÀI VIẾT HỎI TRỰC TIẾP APP: Bạn ĐƯỢC PHÉP giới thiệu Hanpeak một cách tự nhiên, khách quan:
   - Học từ vựng, cụm từ, mẫu câu trong ngữ cảnh rồi luyện nói và thực chiến hội thoại với AI.
   - AI nghe và phản hồi trực tiếp khi luyện nói.
   - Có 2 phần đầu của Bài 1 miễn phí để trải nghiệm.
   - LUÔN viết hoa chuẩn: "Hanpeak" và "AI".
` : `
1. TUYỆT ĐỐI CẤM NHẮC ĐẾN TÊN APP HANPEAK HOẶC BẤT KỲ TÊN APP NÀO:
   - Đây là chiến thuật Seeding bằng Giá Trị: Trao giá trị trước, không vội giới thiệu app.
   - Tập trung 100% vào phân tích nguyên nhân và chia sẻ giải pháp/mẹo thực tế theo "coreInsight" ở trên.
   - Đóng vai một người học tiếng Trung chân thành chia sẻ kinh nghiệm, giúp người đăng nhận ra vấn đề của mình.
   - Chỉ khi người đó bình luận lại hỏi cách luyện (Bước 2), lúc đó mới giới thiệu Hanpeak.
`}

QUY CÁCH TRÌNH BÀY & FORMAT COMMENT TRÊN THREADS (BẮT BUỘC):
1. BỐ CỤC 2 HOẶC 3 DÒNG THOÁNG MẮT (NGẮT DÒNG BẰNG \\n\\n):
   - Tuyệt đối KHÔNG viết thành một khối chữ liền tù tì dài ngoằng.
   - Bình luận gồm 2 (hoặc 3) dòng ngắn gọn, giữa các dòng CÁCH NHAU 1 DÒNG TRỐNG (dùng \\n\\n) để người đọc lướt trên điện thoại cực kỳ dễ chịu:
     + Dòng 1: Câu mở đầu / phản ứng ấn tượng (< 15 từ).
     + Dòng 2: Chia sẻ nguyên nhân & giải pháp thực tế ngắn gọn (< 25 từ).
     + Dòng 3 (tùy chọn): Mẹo bổ sung hoặc câu hỏi tương tác ngắn gọn (< 15 từ).
2. TỔNG ĐỘ DÀI:
   - Khoảng 25 đến 45 từ. Ngắn gọn, súc tích, tự nhiên như comment dạo của người thật.

QUY TẮC CHỐNG CỐ ĐỊNH & CHỐNG RẬP KHUÔN (ANTI-STATIC):
1. TUYỆT ĐỐI CẤM dùng các cụm từ mở đầu sáo rỗng lặp đi lặp lại: "Y chang tui luôn", "Má ơi tui cũng vậy", "Thề luôn", "Chuẩn luôn bác ơi".
2. Mỗi lần tạo bình luận phải có cấu trúc ngữ pháp và từ ngữ mới mẻ, KHÔNG lặp lại mẫu câu cũ.

QUY TẮC AN TOÀN:
- TUYỆT ĐỐI KHÔNG dùng markdown (không **, không *, không gạch đầu dòng -).
- TUYỆT ĐỐI KHÔNG dùng dấu ngoặc kép bọc ngoài bài viết.
- TUYỆT ĐỐI KHÔNG chứa link URL, không nhắc "bio" hay "profile".`;

  const userPrompt = `Nội dung bài viết trên Threads:
"""
${postContent || 'Mọi người ơi mình học tiếng Trung 2 năm rồi mà đến giờ vẫn không nói được, từ vựng biết nhiều mà mở mồm ra là cứng họng, phải làm sao bây giờ ạ?'}
"""

Bình luận ngắn thoáng mắt (2-3 dòng, ngắt dòng \\n\\n):`;

  // 1. Call Gemini with High Temperature (0.95) for maximum entropy & non-fixed comments
  if (Date.now() >= quotaExceededUntil) {
    try {
      const res = await callGemini(systemPrompt, userPrompt);
      if (res && res.trim().length > 10) {
        const cleaned = cleanComment(res, situationKey);
        // Verify against global farm history to prevent duplicates
        if (!globalRecentComments.includes(cleaned)) {
          recordGlobalComment(cleaned);
          return cleaned;
        }
      }
    } catch (err) {
      if (err.message.includes('429') || err.message.includes('quota')) {
        quotaExceededUntil = Date.now() + 25 * 1000;
        console.warn('[AI Comment] Gemini quota burst limit, switching to rich offline pool for 25s.');
      } else {
        console.warn('[AI Comment] Gemini API attempt failed, retrying once...', err.message);
        try {
          const retryRes = await callGemini(systemPrompt, userPrompt);
          if (retryRes && retryRes.trim().length > 10) {
            const cleaned = cleanComment(retryRes, situationKey);
            recordGlobalComment(cleaned);
            return cleaned;
          }
        } catch (retryErr) {
          if (retryErr.message.includes('429') || retryErr.message.includes('quota')) {
            quotaExceededUntil = Date.now() + 25 * 1000;
          }
        }
      }
    }
  }

  // 2. Fallback to Rich Rotated Offline Comments Matrix with Dynamic Slot-Filling
  const fallback = cleanComment(getOfflineFallbackComment(postContent, serial, situationKey), situationKey);
  recordGlobalComment(fallback);
  return fallback;
}

function recordGlobalComment(comment) {
  if (!comment) return;
  globalRecentComments.push(comment);
  if (globalRecentComments.length > 60) {
    globalRecentComments.shift();
  }
}

function cleanComment(text, situationKey = null) {
  let cleaned = text.trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/^Bình luận:\s*/i, '')
    .replace(/[*#_~`]/g, '')
    .trim();

  // Convert literal \n text into actual line breaks if Gemini outputs escaped characters
  cleaned = cleaned.replace(/\\n/g, '\n');

  // Strip accidental bio mentions
  cleaned = cleaned.replace(/,?\s*(vào|qua|xem|check|lên|ghé)\s*(bio|profile)[^.,!\n]*/gi, '');
  cleaned = cleaned.replace(/,?\s*link\s*(ở|tại|trong)?\s*(bio|profile)[^.,!\n]*/gi, '');
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '');

  // Strip repetitive cliches if Gemini accidentally leaked them
  cleaned = cleaned.replace(/^(Y chang tui luôn,?\s*|Má ơi tui cũng vậy,?\s*|Thề luôn,?\s*)/i, '');

  // Strict enforcement: IF NOT SITUATION_3 (asking app), REMOVE ALL OCCURRENCES OF HANPEAK
  if (situationKey && situationKey !== 'SITUATION_3_APP_RECOMMENDATION') {
    cleaned = cleaned.replace(/\bapp\s+Hanpeak\b/gi, '')
                     .replace(/\btrên\s+Hanpeak\b/gi, '')
                     .replace(/\bbên\s+Hanpeak\b/gi, '')
                     .replace(/\bHanpeak\b/gi, '')
                     .replace(/\s{2,}/g, ' ');
  }

  // Strict capitalization
  cleaned = cleaned.replace(/\bhanpeak\b/gi, 'Hanpeak');
  cleaned = smartReplaceAI(cleaned);

  // Normalize excessive line breaks to clean double newlines
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

  // If the text is a single paragraph without \n, automatically split by sentences into 2-3 airy paragraphs
  if (!cleaned.includes('\n')) {
    const sentences = cleaned.split(/(?<=[.?!]|[\u{1F300}-\u{1FAFF}]|[=)]\))\s+/u).filter(Boolean);
    if (sentences.length >= 2) {
      if (sentences.length === 2) {
        cleaned = sentences.join('\n\n');
      } else {
        cleaned = sentences[0] + '\n\n' + sentences.slice(1, -1).join(' ') + '\n\n' + sentences[sentences.length - 1];
      }
    }
  }

  return cleaned.trim();
}

/**
 * Call Gemini API with automatic fallback between Lite models
 */
function callGemini(systemPrompt, userPrompt, model = PRIMARY_MODEL) {
  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        temperature: 0.95, // High entropy for maximum phrasing diversity
        maxOutputTokens: 600
      }
    });

    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 16000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.candidates && json.candidates[0]?.content?.parts?.[0]?.text) {
            resolve(json.candidates[0].content.parts[0].text);
          } else {
            // If primary model failed with quota, try fallback model
            if (model === PRIMARY_MODEL && (body.includes('429') || body.includes('quota'))) {
              callGemini(systemPrompt, userPrompt, FALLBACK_MODEL)
                .then(resolve)
                .catch(reject);
            } else {
              reject(new Error(body.substring(0, 150)));
            }
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemini API timeout'));
    });
    req.write(payload);
    req.end();
  });
}

function getOfflineFallbackComment(postContent = '', serial = 'GAGAA68HPVCEJFJV', forcedSituation = null) {
  let category = 'general';

  if (forcedSituation && OFFLINE_COMMENTS_MATRIX[forcedSituation.toLowerCase()]) {
    category = forcedSituation.toLowerCase();
  } else {
    const postClass = classifyPost(postContent);
    switch (postClass.situation) {
      case 'SITUATION_1_STRUGGLING':
        category = 'situation_1_struggling';
        break;
      case 'SITUATION_2_REFLEX_PRACTICE':
        category = 'situation_2_reflex_practice';
        break;
      case 'SITUATION_3_APP_RECOMMENDATION':
        category = 'situation_3_app_recommendation';
        break;
      case 'SITUATION_4_VOCAB_CHUNKS':
        category = 'situation_4_vocab_chunks';
        break;
      case 'SITUATION_5_FEAR_SPEAKING':
        category = 'situation_5_fear_speaking';
        break;
      case 'SITUATION_PRONUNCIATION':
        category = 'pronunciation';
        break;
      default: {
        const lower = (postContent || '').toLowerCase();
        if (lower.includes('phát âm') || lower.includes('pinyin') || lower.includes('thanh điệu')) {
          category = 'pronunciation';
        } else if (lower.includes('đi làm') || lower.includes('sếp') || lower.includes('công sở')) {
          category = 'workplace';
        } else {
          category = 'situation_1_struggling';
        }
      }
    }
  }

  const pool = OFFLINE_COMMENTS_MATRIX[category] || OFFLINE_COMMENTS_MATRIX['general'];
  return getRotatedItem(pool, `${serial}_${category}`, recentCommentHistory);
}

/**
 * Generate a high-converting, authentic Gen Z Threads post for a specific device persona.
 * Enforces strict 4-block viral layout: Hook (< 80 chars) \n\n Pain/Struggle \n\n Hanpeak Solution \n\n Open CTA Question.
 */
export async function generateThreadsPost(serial = 'GAGAA68HPVCEJFJV', customTopic = null) {
  const persona = DEVICE_PERSONAS[serial] || DEVICE_PERSONAS['GAGAA68HPVCEJFJV'];
  const angles = persona.angles || ['tự học phản xạ tiếng Trung giao tiếp'];
  const chosenAngle = customTopic || angles[Math.floor(Math.random() * angles.length)];
  const framework = VIRAL_POST_FRAMEWORKS[Math.floor(Math.random() * VIRAL_POST_FRAMEWORKS.length)];
  const sessionNonce = Math.random().toString(36).substring(2, 6);

  const systemPrompt = `Bạn là một Content Creator Gen Z (20 - 24 tuổi) chuyên viết các bài chia sẻ viral trên mạng xã hội Threads về hành trình học tiếng Trung.

VAI TRÒ & PHONG CÁCH (Phiên ngẫu nhiên #${sessionNonce}):
- Archetype tác giả: ${persona.name} (${persona.tone})
- Slang đặc trưng: ${persona.slang}
- Chủ đề: ${chosenAngle}
- Framework cấu trúc viral hôm nay: ${framework.name}

CÔNG THỨC VIRAL THREADS (BẮT BUỘC TUÂN THỦ 100%):
1. NHỊP ĐIỆU & KHOẢNG THỞ (CADENCE):
   - Tuyệt đối KHÔNG viết thành một đoạn văn dài nguyên khối.
   - Bài viết chia thành đúng 3 hoặc 4 khối ngắn, GIỮA MỖI KHỐI PHẢI CÁCH NHAU 1 DÒNG TRỐNG (dùng \\n\\n).
   - Mỗi khối chỉ gồm 1 đến 2 câu ngắn (mỗi dòng đọc như một tiếng thở dài, một câu thì thầm hoặc một phát hiện thú vị).

2. BỐ CỤC 4 PHẦN CHUẨN VIRAL:
   - Khối 1 (Hook - 1 câu cực ngắn, dưới 80 ký tự): ${framework.hookPattern}
   - Khối 2 (Nỗi đau / Bối cảnh - 1 đến 2 câu ngắn): Tình huống đời thường, tự dìm mình chân thật, dùng slang tự nhiên.
   - Khối 3 (Giải pháp / Insight thực chiến - 1 đến 2 câu ngắn): ${framework.bodyPattern}
   - Khối 4 (CTA kéo tương tác - 1 câu ngắn): ${framework.ctaPattern}

3. QUY TẮC THƯƠNG HIỆU & NỘI DUNG:
   - LUÔN viết hoa chuẩn chữ: "Hanpeak" (TUYỆT ĐỐI KHÔNG viết thường "hanpeak").
   - Viết hoa chuẩn chữ "AI" khi nói về trí tuệ nhân tạo (bot AI, công nghệ AI...).
   - Nhắc đến app Hanpeak như một phát hiện tình cờ/chân ái của bản thân, không dùng từ ngữ quảng cáo thô thiển.
   - TUYỆT ĐỐI KHÔNG dùng các từ: "bio", "vào bio", "link ở bio", "xem bio", "bio tui", "profile", không để link URL.
   - Không chèn hashtag vào giữa thân bài; nếu có thì tối đa 2-3 hashtag ở dòng cuối cùng cách 1 dòng trống.

4. ĐẦU RA:
   - Chỉ trả về nội dung bài viết hoàn chỉnh, không kèm chú thích, không kèm tiêu đề phụ hay dấu ngoặc kép bọc ngoài.`;

  const userPrompt = `Hãy viết một bài đăng Threads cực cuốn theo đúng archetype và cấu trúc trên.
Chủ đề: ${chosenAngle}
Framework: ${framework.name}`;

  if (Date.now() >= quotaExceededUntil) {
    try {
      const res = await callGemini(systemPrompt, userPrompt);
      if (res && res.trim().length > 30) {
        return cleanPost(res);
      }
    } catch (err) {
      if (err.message.includes('429') || err.message.includes('quota')) {
        quotaExceededUntil = Date.now() + 25 * 1000;
        console.warn('[AI Post] Gemini quota limit, using offline viral post.');
      } else {
        try {
          const retryRes = await callGemini(systemPrompt, userPrompt);
          if (retryRes && retryRes.trim().length > 30) {
            return cleanPost(retryRes);
          }
        } catch {}
      }
    }
  }

  // Fallback to offline matrix
  const list = OFFLINE_POSTS_MATRIX[serial] || OFFLINE_POSTS_MATRIX['GAGAA68HPVCEJFJV'];
  return getRotatedItem(list, serial, recentPostHistory);
}

function cleanPost(text) {
  let cleaned = text.trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/^Bài viết:\s*/i, '')
    .trim();

  // Strip bio mentions
  cleaned = cleaned.replace(/,?\s*(vào|qua|xem|check|lên|ghé)\s*(bio|profile)[^.,!\n]*/gi, '');
  cleaned = cleaned.replace(/,?\s*link\s*(ở|tại|trong)?\s*(bio|profile)[^.,!\n]*/gi, '');
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, 'app Hanpeak');

  cleaned = cleaned.replace(/\bhanpeak\b/gi, 'Hanpeak');
  cleaned = smartReplaceAI(cleaned);

  return cleaned.trim();
}
