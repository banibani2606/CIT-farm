/**
 * Bộ từ khóa tìm kiếm Threads chuyên sâu cho Hanpeak (Học nói & Luyện phản xạ tiếng Trung)
 * Phân chia theo 6 nhóm từ khóa ưu tiên (Intent), Top 15 từ khóa hàng ngày,
 * Bộ lọc bài viết loại trừ (Negative Filter) và Hệ thống phân loại 4 nhóm A/B/C/D.
 */

// 6 Nhóm từ khóa được phân chia theo mức độ ưu tiên và ý định người học
export const KEYWORD_CATEGORIES = {
  group1_struggling_speaking: {
    id: 'group1_struggling_speaking',
    priority: 1,
    label: 'Nhóm 1: Học lâu nhưng không nói được (Ưu tiên cao nhất - Core Pain Point)',
    description: 'Người học lâu năm, biết từ nhưng câm nín, sợ nói, không có phản xạ, mất gốc',
    targetRatio: 0.40, // 40% ngân sách tìm kiếm
    keywords: [
      'học tiếng Trung mãi không nói được',
      'học tiếng Trung nhưng không giao tiếp được',
      'biết từ vựng nhưng không biết nói',
      'học tiếng Trung bị mất gốc',
      'học tiếng Trung khó quá',
      'học tiếng Trung bao lâu thì giao tiếp được',
      'học tiếng Trung không hiệu quả',
      'nghe hiểu nhưng không nói được tiếng Trung',
      'sợ nói tiếng Trung',
      'không có phản xạ tiếng Trung'
    ]
  },

  group2_learning_methods: {
    id: 'group2_learning_methods',
    priority: 2,
    label: 'Nhóm 2: Tìm kiếm phương pháp & Lộ trình tự học',
    description: 'Người đang chủ động tìm giải pháp, cách tự học hiệu quả, luyện phản xạ tại nhà',
    targetRatio: 0.30, // 30% ngân sách tìm kiếm
    keywords: [
      'phương pháp học tiếng Trung',
      'cách tự học tiếng Trung',
      'học tiếng Trung hiệu quả',
      'cách học tiếng Trung cho người đi làm',
      'lộ trình học tiếng Trung',
      'học tiếng Trung tại nhà',
      'kinh nghiệm học tiếng Trung',
      'cách luyện giao tiếp tiếng Trung',
      'cách luyện phản xạ tiếng Trung',
      'học tiếng Trung như thế nào'
    ]
  },

  group3_foundation_weak_speaking: {
    id: 'group3_foundation_weak_speaking',
    priority: 3,
    label: 'Nhóm 3: Có nền tảng HSK nhưng yếu kỹ năng nói',
    description: 'Đã có HSK 2/3/4, biết ngữ pháp nhưng không giao tiếp thực tế được',
    targetRatio: 0.10,
    keywords: [
      'HSK 2 giao tiếp',
      'HSK 3 nhưng không nói được',
      'HSK 4 giao tiếp',
      'học HSK nhưng không giao tiếp được',
      'biết ngữ pháp nhưng không nói được',
      'học từ vựng HSK',
      'luyện nói HSK',
      'luyện khẩu ngữ tiếng Trung',
      'phản xạ giao tiếp tiếng Trung',
      'luyện nói tiếng Trung mỗi ngày'
    ]
  },

  group4_conversational_chinese: {
    id: 'group4_conversational_chinese',
    priority: 4,
    label: 'Nhóm 4: Học giao tiếp & Tình huống thực tế',
    description: 'Nhu cầu giao tiếp thực tế hàng ngày, công sở, nói chuyện với người Trung Quốc',
    targetRatio: 0.08,
    keywords: [
      'tiếng Trung giao tiếp',
      'học giao tiếp tiếng Trung',
      'tiếng Trung giao tiếp hàng ngày',
      'mẫu câu giao tiếp tiếng Trung',
      'hội thoại tiếng Trung',
      'luyện nói tiếng Trung',
      'tiếng Trung cho người mới bắt đầu',
      'tiếng Trung công sở',
      'tiếng Trung đi làm',
      'giao tiếp với người Trung Quốc'
    ]
  },

  group5_pronunciation_pinyin: {
    id: 'group5_pronunciation_pinyin',
    priority: 5,
    label: 'Nhóm 5: Khó khăn phát âm & Pinyin & Thanh điệu',
    description: 'Người mới hoặc người bị sai thanh điệu, pinyin khó, phân biệt thanh 2 thanh 3',
    targetRatio: 0.06,
    keywords: [
      'phát âm tiếng Trung',
      'luyện thanh điệu tiếng Trung',
      'phát âm tiếng Trung khó',
      'Pinyin khó',
      'phân biệt thanh 2 thanh 3',
      'phát âm sai tiếng Trung',
      'luyện phát âm tiếng Trung',
      'nghe và nói tiếng Trung',
      'sửa lỗi phát âm tiếng Trung'
    ]
  },

  group6_workplace_chinese: {
    id: 'group6_workplace_chinese',
    priority: 6,
    label: 'Nhóm 6: Tiếng Trung đi làm & Thương mại & Công việc',
    description: 'Người học có động lực cao: đi làm, phỏng vấn, nói chuyện với sếp/đối tác',
    targetRatio: 0.06,
    keywords: [
      'học tiếng Trung đi làm',
      'tiếng Trung cho người đi làm',
      'giao tiếp với sếp Trung Quốc',
      'làm việc với người Trung Quốc',
      'tiếng Trung xuất nhập khẩu',
      'tiếng Trung thương mại',
      'tiếng Trung văn phòng',
      'phỏng vấn tiếng Trung',
      'tiếng Trung giao tiếp công việc',
      'học tiếng Trung để kinh doanh'
    ]
  }
};

// 15 Từ khóa ưu tiên hàng ngày (Tập trung tối đa vào Nhóm 1 và Nhóm 2)
export const TOP_15_DAILY_KEYWORDS = [
  'học tiếng Trung mãi không nói được',
  'biết từ vựng nhưng không biết nói',
  'sợ nói tiếng Trung',
  'không có phản xạ tiếng Trung',
  'nghe hiểu nhưng không nói được tiếng Trung',
  'cách luyện phản xạ tiếng Trung',
  'cách tự học tiếng Trung',
  'lộ trình học tiếng Trung',
  'học HSK nhưng không giao tiếp được',
  'luyện khẩu ngữ tiếng Trung',
  'tiếng Trung giao tiếp hàng ngày',
  'tiếng Trung công sở',
  'tiếng Trung cho người đi làm',
  'phát âm tiếng Trung',
  'phân biệt thanh 2 thanh 3'
];

// Bộ Hashtag mục tiêu chính
export const TARGET_HASHTAGS = [
  '#hoctiengtrung',
  '#tiengtrunggiaotiep',
  '#tuvungtiengtrung',
  '#tuhoctiengtrung',
  '#hsk',
  '#tiengtrungonline',
  '#tiengtrungmoibatdau',
  '#luyennoitiengtrung',
  '#tiengtrungcongso',
  '#pinyin',
  '#hanpeak'
];

// Danh sách các từ khóa tiêu cực để LOẠI TRỪ TUYỆT ĐỐI bài viết quảng cáo trung tâm / khóa học
export const NEGATIVE_SPAM_SIGNALS = [
  'khóa học', 'khoá học', 'học phí', 'ưu đãi', 'tuyển sinh', 'khai giảng',
  'inbox ngay', 'ib ngay', 'ib để', 'inbox để', 'lớp học', 'combo khóa', 'combo khoá',
  'giảm giá', 'học bổng', 'lớp online', 'lớp offline', 'đăng ký ngay', 'đăng kí ngay',
  'nhận tài liệu qua ib', 'chấm để nhận', 'cmt để nhận', 'học viên', 'trung tâm tiếng trung',
  'trung tâm hoa ngữ', 'khai giảng tháng', 'ưu đãi học phí', 'tặng kèm khóa học',
  'học thử miễn phí tại trung tâm', 'tuyển sinh lớp'
];

// Ưu tiên chủ đề cho từng thiết bị theo Archetype - Luôn kết hợp Nhóm 1 (Core Pain Point)
export const PERSONA_KEYWORD_PREFERENCES = {
  // Device 1: Vsmart Aris - Hướng nội sợ giao tiếp, sợ phát âm sai
  'BDE00051677': ['group1_struggling_speaking', 'group5_pronunciation_pinyin', 'group2_learning_methods'],

  // Device 2: Realme CPH2321 - Đi làm bị dí tiếng Trung, cần thực chiến công sở
  'GAGAA68HPVCEJFJV': ['group6_workplace_chinese', 'group1_struggling_speaking', 'group4_conversational_chinese'],

  // Device 3: Samsung A14 - Nhồi từ vựng nhưng não lag, mở mồm không ghép được câu
  'R58W41KSL2Y': ['group1_struggling_speaking', 'group3_foundation_weak_speaking', 'group2_learning_methods'],

  // Device 4: Oppo A53 - Mách mẹo phát âm, pinyin, thanh 2 thanh 3
  'c216669c': ['group5_pronunciation_pinyin', 'group1_struggling_speaking', 'group2_learning_methods'],

  // Device 5: Realme 5s - Mê app xịn, tự học từ đầu tiết kiệm chi phí
  'fcec5b9c': ['group2_learning_methods', 'group1_struggling_speaking', 'group4_conversational_chinese']
};

// Lịch sử xoay tua từ khóa
const globalUsedKeywords = [];
const deviceHistoryMap = new Map();

/**
 * Phân loại bài viết theo 4 Tier (A, B, C, D) và nhận diện tình huống cụ thể
 * Đồng thời áp dụng Bộ lọc loại trừ (Negative Filter) cho bài quảng cáo khóa học.
 * @param {string} postText - Nội dung bài viết trên Threads
 * @returns {{ tier: 'A'|'B'|'C'|'D'|'ADS', situation: string, shouldComment: boolean, priorityScore: number, reason: string }}
 */
export function classifyPost(postText = '') {
  if (!postText || typeof postText !== 'string') {
    return {
      tier: 'D',
      situation: 'SITUATION_CASUAL_MEME',
      shouldComment: true,
      priorityScore: 30,
      reason: 'Bài viết ngắn hoặc không rõ nội dung'
    };
  }

  const lower = postText.toLowerCase();

  // 1. NEGATIVE FILTER: Loại bỏ tuyệt đối bài viết quảng cáo trung tâm / tuyển sinh / ưu đãi học phí
  for (const signal of NEGATIVE_SPAM_SIGNALS) {
    if (lower.includes(signal)) {
      return {
        tier: 'ADS',
        situation: 'ADS_FILTERED',
        shouldComment: false,
        priorityScore: 0,
        reason: `Chứa từ khóa quảng cáo/trung tâm: "${signal}"`
      };
    }
  }

  // Tiêu chí cộng điểm ưu tiên hàng đầu:
  // 1. Bài có người đang đặt câu hỏi (?, phải làm sao, thế nào, ai biết không...)
  const hasQuestion = /[?？]|(?:phải\s+làm\s+sao|như\s+thế\s+nào|thế\s+nào|có\s+ai\s+không|xin\s+kinh\s+nghiệm|cho\s+mình\s+hỏi|mọi\s+người\s+cho\s+em\s+hỏi|làm\s+sao\s+để|cách\s+nào|bạn\s+nào\s+biết|ai\s+giống\s+mình)/i.test(lower);
  // 2. Người đăng thể hiện nhu cầu cá nhân (mình, em, tui, tớ, bản thân...)
  const hasPersonalNeed = /(?:mình|em|tui|tớ|bản\s+thân|của\s+mình)/i.test(lower);

  const bonus = (hasQuestion ? 8 : 0) + (hasPersonalNeed ? 7 : 0);

  // 2. Nhận diện Tình huống 3: Người trực tiếp hỏi app / công cụ học tiếng Trung (Type B)
  const isAskingApp = /(?:có\s+app\s+nào|xin\s+review\s+app|app\s+luyện\s+nói|app\s+nào\s+học|app\s+tiếng\s+trung|web\s+nào|phần\s+mềm\s+học|công\s+cụ\s+nào|dùng\s+app\s+gì)/i.test(lower);
  if (isAskingApp) {
    return {
      tier: 'B',
      situation: 'SITUATION_3_APP_RECOMMENDATION',
      shouldComment: true,
      priorityScore: 90 + bonus,
      reason: 'Type B: Người đăng chủ động tìm kiếm app/công cụ luyện nói'
    };
  }

  // 3. Nhận diện Tình huống 4: Biết từ vựng nhưng không ghép được câu / từ vựng chết (Type A)
  const isVocabLag = /(?:biết\s+từ\s+vựng\s+nhưng|không\s*(?:biết|thể)?\s*ghép\s*(?:được)?\s*câu|thuộc.*từ.*nhưng|học\s+từ\s+vựng\s+mãi|não\s+lag|không\s+nhớ\s+được\s+từ|từ\s+vựng\s+chết|học\s+trước\s+quên\s+sau|nạp\s+từ\s+vựng|nhồi\s+từ\s+vựng)/i.test(lower);
  if (isVocabLag) {
    return {
      tier: 'A',
      situation: 'SITUATION_4_VOCAB_CHUNKS',
      shouldComment: true,
      priorityScore: 94 + bonus,
      reason: 'Type A (Nhu cầu rõ): Biết từ vựng nhưng không ghép câu được'
    };
  }

  // 4. Nhận diện Tình huống 5: Ngại nói, sợ nói sai, rào cản tâm lý (Type A)
  const isFearSpeaking = /(?:sợ\s+nói|ngại\s+nói|sợ\s+sai|sợ\s+phát\s+âm\s+sai|ngại\s+giao\s+tiếp|không\s+dám\s+(?:nói|mở\s+miệng)|hướng\s+nội|run\s+bần\s+bật|câm\s+nín|ngượng|bị\s+khớp|rén)/i.test(lower);
  if (isFearSpeaking) {
    return {
      tier: 'A',
      situation: 'SITUATION_5_FEAR_SPEAKING',
      shouldComment: true,
      priorityScore: 93 + bonus,
      reason: 'Type A (Nhu cầu rõ): Rào cản tâm lý, ngại nói sợ phát âm sai'
    };
  }

  // 5. Nhận diện Tình huống 1: Học lâu nhưng không nói được / mất gốc / không giao tiếp được (Type A - Core Pain Point)
  const isStruggling = /(?:mãi\s+không\s+nói\s+được|không\s+giao\s+tiếp\s+được|học\s+\d+\s+năm|không\s+nói\s+được|mất\s+gốc|không\s+có\s+phản\s+xạ|nghe\s+hiểu\s+nhưng\s+không\s+nói|học\s+tiếng\s+trung\s+khó\s+quá|nản\s+quá|không\s+hiệu\s+quả|học\s+hsk\s+nhưng)/i.test(lower);
  if (isStruggling) {
    return {
      tier: 'A',
      situation: 'SITUATION_1_STRUGGLING',
      shouldComment: true,
      priorityScore: 96 + bonus,
      reason: 'Type A (Ưu tiên cao nhất): Học lâu năm nhưng không nói được'
    };
  }

  // 6. Nhận diện Tình huống 2: Đang tìm phương pháp / luyện phản xạ (Type B)
  const isSeekingMethod = /(?:phương\s+pháp|cách\s+tự\s+học|luyện\s+phản\s+xạ|lộ\s+trình|tự\s+học\s+tại\s+nhà|kinh\s+nghiệm|như\s+thế\s+nào|bắt\s+đầu\s+từ\s+đâu|học\s+thế\s+nào)/i.test(lower);
  if (isSeekingMethod) {
    return {
      tier: 'B',
      situation: 'SITUATION_2_REFLEX_PRACTICE',
      shouldComment: true,
      priorityScore: 86 + bonus,
      reason: 'Type B (Đang tìm giải pháp): Tìm kiếm phương pháp học và luyện phản xạ'
    };
  }

  // 7. Nhận diện khó khăn phát âm / Pinyin / thanh điệu (Type B)
  const isPronunciation = /(?:phát\s+âm|pinyin|thanh\s+điệu|thanh\s+1|thanh\s+2|thanh\s+3|thanh\s+4|sửa\s+ngọng|sóng\s+âm|khẩu\s+hình)/i.test(lower);
  if (isPronunciation) {
    return {
      tier: 'B',
      situation: 'SITUATION_PRONUNCIATION',
      shouldComment: true,
      priorityScore: 84 + bonus,
      reason: 'Type B (Đang tìm giải pháp): Khó khăn về phát âm và thanh điệu Pinyin'
    };
  }

  // 8. Nhận diện chia sẻ kiến thức (Type C)
  const isKnowledgeShare = /(?:mẫu\s+câu|từ\s+vựng\s+chủ\s+đề|ngữ\s+pháp|cách\s+dùng|phân\s+biệt|đồng\s+nghĩa|chữ\s+hán)/i.test(lower);
  if (isKnowledgeShare) {
    return {
      tier: 'C',
      situation: 'SITUATION_KNOWLEDGE_EXPAND',
      shouldComment: true,
      priorityScore: 50,
      reason: 'Type C: Bài chia sẻ kiến thức, bình luận bổ sung giá trị'
    };
  }

  // 9. Mặc định: Type D (Giải trí, meme)
  return {
    tier: 'D',
    situation: 'SITUATION_CASUAL_MEME',
    shouldComment: true,
    priorityScore: 35,
    reason: 'Type D: Bài viết giải trí / thảo luận tự do'
  };
}

/**
 * Chọn từ khóa thông minh cho thiết bị:
 * Ưu tiên 70% ngân sách cho Nhóm 1 và Nhóm 2 + Top 15 từ khóa hàng ngày,
 * Chống trùng lặp giữa các máy trong farm và chống lặp lại trên cùng thiết bị.
 * @param {string} serial - Serial thiết bị
 * @param {object} options - Tùy chọn { category, customKeywords }
 * @returns {{ keyword: string, category: string, categoryLabel: string }}
 */
export function getSmartKeyword(serial, options = {}) {
  // 1. Nếu người dùng nhập danh sách từ khóa tùy chỉnh
  if (options.customKeywords) {
    let list = [];
    if (Array.isArray(options.customKeywords)) {
      list = options.customKeywords;
    } else if (typeof options.customKeywords === 'string') {
      list = options.customKeywords.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    }
    if (list.length > 0) {
      const freshList = list.filter(k => !globalUsedKeywords.includes(k));
      const pickList = freshList.length > 0 ? freshList : list;
      const chosen = pickList[Math.floor(Math.random() * pickList.length)];
      globalUsedKeywords.push(chosen);
      if (globalUsedKeywords.length > 30) globalUsedKeywords.shift();
      return {
        keyword: chosen,
        category: 'custom',
        categoryLabel: 'Từ khóa tùy chỉnh'
      };
    }
  }

  // 2. Xác định danh mục mục tiêu
  let targetCatKeys = [];
  if (options.category && KEYWORD_CATEGORIES[options.category]) {
    targetCatKeys = [options.category];
  } else if (PERSONA_KEYWORD_PREFERENCES[serial]) {
    targetCatKeys = PERSONA_KEYWORD_PREFERENCES[serial];
  } else {
    // 70% trường hợp bốc từ Nhóm 1 & 2
    if (Math.random() < 0.70) {
      targetCatKeys = ['group1_struggling_speaking', 'group2_learning_methods'];
    } else {
      targetCatKeys = Object.keys(KEYWORD_CATEGORIES);
    }
  }

  // 3. Thu thập danh sách từ khóa hợp lệ
  const candidatePool = [];
  targetCatKeys.forEach(catKey => {
    const cat = KEYWORD_CATEGORIES[catKey];
    if (cat && cat.keywords) {
      cat.keywords.forEach(kw => {
        candidatePool.push({
          keyword: kw,
          category: cat.id,
          categoryLabel: cat.label
        });
      });
    }
  });

  // Nếu rỗng, fallback về Top 15 từ khóa hàng ngày
  if (candidatePool.length === 0) {
    const fallbackKw = TOP_15_DAILY_KEYWORDS[Math.floor(Math.random() * TOP_15_DAILY_KEYWORDS.length)];
    return {
      keyword: fallbackKw,
      category: 'group1_struggling_speaking',
      categoryLabel: KEYWORD_CATEGORIES.group1_struggling_speaking.label
    };
  }

  // 4. Xoay tua thông minh 2 tầng: chống trùng toàn farm & chống lặp trên từng máy
  if (!deviceHistoryMap.has(serial)) {
    deviceHistoryMap.set(serial, []);
  }
  const deviceHistory = deviceHistoryMap.get(serial);

  let poolToPick = candidatePool.filter(c => !globalUsedKeywords.includes(c.keyword) && !deviceHistory.includes(c.keyword));
  if (poolToPick.length === 0) {
    poolToPick = candidatePool.filter(c => !globalUsedKeywords.slice(-10).includes(c.keyword));
  }
  if (poolToPick.length === 0) {
    poolToPick = candidatePool;
  }

  const selected = poolToPick[Math.floor(Math.random() * poolToPick.length)];

  // Cập nhật lịch sử
  globalUsedKeywords.push(selected.keyword);
  if (globalUsedKeywords.length > 35) {
    globalUsedKeywords.shift();
  }

  deviceHistory.push(selected.keyword);
  if (deviceHistory.length > 10) {
    deviceHistory.shift();
  }

  return selected;
}
