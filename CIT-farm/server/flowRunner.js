import { adbManager } from './adb.js';
import { generateThreadsComment, generateThreadsPost, DEVICE_PERSONAS } from './aiCommentService.js';
import { prepareAndPushMeme } from './imageService.js';
import { getSmartKeyword, classifyPost } from './keywordRegistry.js';
import { generateTOTP } from './totp.js';
import { dataStore } from './dataStore.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Dedicated calibrated screen coordinates & profiles for all 5 farm devices
export const DEVICE_PROFILES = {
  // 1. Vsmart Aris (1080 x 2340, English UI)
  'BDE00051677': {
    name: 'Vsmart Aris',
    width: 1080,
    height: 2340,
    lang: 'en',
    search: { x: 996, y: 170 },
    searchBar: { x: 529, y: 171 },
    feedTab: { x: 146, y: 2099 },
    like: { x: 105, y: 1650 },
    reply: { x: 300, y: 1650 },
    post: { x: 940, y: 2128 },
    postKeyboardUp: { x: 940, y: 1380 }
  },
  // 2. Realme CPH2321 (720 x 1600, Vietnamese UI)
  'GAGAA68HPVCEJFJV': {
    name: 'Realme CPH2321',
    width: 720,
    height: 1600,
    lang: 'vi',
    search: { x: 664, y: 120 },
    searchBar: { x: 344, y: 232 },
    feedTab: { x: 98, y: 1440 },
    like: { x: 62, y: 473 },
    reply: { x: 183, y: 475 },
    post: { x: 628, y: 938 },
    postKeyboardUp: { x: 628, y: 938 }
  },
  // 3. Samsung Galaxy A14 (1080 x 2408, Vietnamese UI)
  'R58W41KSL2Y': {
    name: 'Samsung Galaxy A14',
    width: 1080,
    height: 2408,
    lang: 'vi',
    search: { x: 1002, y: 145 },
    searchBar: { x: 518, y: 155 },
    feedTab: { x: 144, y: 2194 },
    like: { x: 101, y: 1915 },
    reply: { x: 288, y: 1918 },
    post: { x: 950, y: 2128 },
    postKeyboardUp: { x: 950, y: 1400 }
  },
  // 4. Oppo A53 (720 x 1600, Vietnamese UI)
  'c216669c': {
    name: 'Oppo A53',
    width: 720,
    height: 1600,
    lang: 'vi',
    search: { x: 664, y: 128 },
    searchBar: { x: 344, y: 232 },
    feedTab: { x: 98, y: 1440 },
    like: { x: 70, y: 1078 },
    reply: { x: 209, y: 1078 },
    post: { x: 628, y: 938 },
    postKeyboardUp: { x: 628, y: 938 }
  },
  // 5. Realme 5s (1080 x 2340, Vietnamese UI)
  'fcec5b9c': {
    name: 'Realme 5s',
    width: 1080,
    height: 2340,
    lang: 'vi',
    search: { x: 996, y: 180 },
    searchBar: { x: 544, y: 336 },
    feedTab: { x: 146, y: 2099 },
    like: { x: 81, y: 1880 },
    reply: { x: 250, y: 1883 },
    post: { x: 942, y: 1347 },
    postKeyboardUp: { x: 942, y: 1347 }
  }
};

export function getDeviceProfile(serial, screenWidth = 720, screenHeight = 1600) {
  if (DEVICE_PROFILES[serial]) {
    return DEVICE_PROFILES[serial];
  }
  const sx = screenWidth / 720;
  const sy = screenHeight / 1600;
  return {
    name: `Device-${serial}`,
    width: screenWidth,
    height: screenHeight,
    lang: 'vi',
    search: { x: Math.round(664 * sx), y: Math.round(125 * sy) },
    searchBar: { x: Math.round(344 * sx), y: Math.round(232 * sy) },
    feedTab: { x: Math.round(98 * sx), y: Math.round(1440 * sy) },
    like: { x: Math.round(70 * sx), y: Math.round(1078 * sy) },
    reply: { x: Math.round(209 * sx), y: Math.round(1078 * sy) },
    post: { x: Math.round(628 * sx), y: Math.round(938 * sy) },
    postKeyboardUp: { x: Math.round(628 * sx), y: Math.round(938 * sy) }
  };
}

export class FlowRunner {
  constructor(adb = adbManager) {
    this.adb = adb;
    this.activeRuns = new Map();
  }

  stopRun(runId) {
    if (this.activeRuns.has(runId)) {
      const run = this.activeRuns.get(runId);
      run.aborted = true;
      run.log('WARN', 'Run aborted by user.');
      this.activeRuns.delete(runId);
      return true;
    }
    return false;
  }

  stopAll() {
    let count = 0;
    this.activeRuns.forEach((run) => {
      run.aborted = true;
      run.log('WARN', 'Run aborted by user (Batch stop).');
      count++;
    });
    this.activeRuns.clear();
    return count;
  }

  isRunActive(runId) {
    return this.activeRuns.has(runId);
  }

  async executeFlow(flow, serial, context = {}, onLog = () => {}, onStep = () => {}) {
    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const runState = {
      runId,
      aborted: false,
      log: (level, msg, data = null) => {
        const entry = { time: new Date().toISOString(), level, msg, data, serial };
        onLog(entry);
      }
    };
    this.activeRuns.set(runId, runState);

    runState.log('INFO', `Starting flow on device [${serial}]...`);

    const nodes = flow.nodes || flow.flow?.nodes || [];
    const edges = flow.edges || flow.flow?.edges || [];

    // Map nodes by id for quick lookup
    const nodeMap = new Map();
    nodes.forEach(n => nodeMap.set(n.id, n));

    // Find start node
    let startNode = nodes.find(n => n.type === 'input' || n.data?.action === 'Start' || n.id.startsWith('start'));
    if (!startNode && nodes.length > 0) {
      startNode = nodes[0];
    }

    if (!startNode) {
      runState.log('ERROR', 'No starting node found in flow.');
      this.activeRuns.delete(runId);
      return { success: false, error: 'No start node' };
    }

    // Context variables for string template interpolation like ${var} or {{var}}
    const variables = {
      ...context,
      serial,
      startTime: new Date().toLocaleTimeString()
    };

    if (context.account) {
      const acc = context.account;
      const otp = acc.twoFactorSecret ? generateTOTP(acc.twoFactorSecret) : '';
      variables['account.uid'] = acc.uid || '';
      variables['account.password'] = acc.password || '';
      variables['account.2fa'] = acc.twoFactorSecret || '';
      variables['account.otp'] = otp;
      variables['account.otp_2fa'] = otp;
      variables['account.name'] = acc.name || acc.uid || '';
      variables['account.email'] = acc.email || '';
      // GenFarmer compatibility mapping
      variables['field.uid'] = acc.uid || '';
      variables['field.password'] = acc.password || '';
      variables['field.2fa'] = acc.twoFactorSecret || '';
      variables['field.account name'] = acc.name || acc.uid || '';
      variables['field.token'] = acc.token || '';
      variables['field.email'] = acc.email || '';
      variables['tenpage'] = acc.name || acc.uid || '';
    }

    const interpolate = (str) => {
      if (typeof str !== 'string') return str;
      
      // 1. Thay thế cú pháp ${var} hoặc {{var}}
      let res = str
        .replace(/(\$\{([^}]+)\}|\{\{([^}]+)\}\})/g, (match, p1, k1, p2, k2) => {
          const rawKey = (k1 || k2 || '').trim();
          if (variables[rawKey] !== undefined) return variables[rawKey];
          // Không phân biệt hoa thường hoặc lỗi chính tả biến AiPostText
          if (/^ai[\s_-]*pos+t*[\s_-]*t?ext$/i.test(rawKey) && variables['AiPostText']) {
            return variables['AiPostText'];
          }
          const foundKey = Object.keys(variables).find(k => k.toLowerCase() === rawKey.toLowerCase());
          if (foundKey && variables[foundKey] !== undefined) return variables[foundKey];
          return match;
        });

      // 2. Hỗ trợ cú pháp $var (như $AiPostText, $AiComment, $AIPosstTExt)
      res = res.replace(/\$([a-zA-Z0-9_.]+)/g, (match, rawKey) => {
        if (variables[rawKey] !== undefined) return variables[rawKey];
        if (/^ai[\s_-]*pos+t*[\s_-]*t?ext$/i.test(rawKey) && variables['AiPostText']) {
          return variables['AiPostText'];
        }
        if (/^ai[\s_-]*com+en*t$/i.test(rawKey) && variables['AiComment']) {
          return variables['AiComment'];
        }
        const foundKey = Object.keys(variables).find(k => k.toLowerCase() === rawKey.toLowerCase());
        if (foundKey && variables[foundKey] !== undefined) return variables[foundKey];
        return match;
      });

      return res;
    };

    variables['__flow_failed'] = false;
    variables['__flow_fail_reason'] = '';
    let currentNode = startNode;
    let stepCount = 0;
    const maxSteps = 2500; // Safeguard against infinite loops
    let reachedStopNode = false;

    try {
      while (currentNode && !runState.aborted && stepCount < maxSteps) {
        stepCount++;
        const node = currentNode;
        const action = node.data?.action || node.type;
        const label = node.label || node.data?.label || action;
        const options = node.data?.options || {};

        onStep({ nodeId: node.id, label, action, step: stepCount });
        runState.log('INFO', `[Step ${stepCount}] Executing: ${label} (${action})`, { nodeId: node.id });

        if (options.disabled) {
          runState.log('DEBUG', `Node ${node.id} is disabled, skipping.`);
          currentNode = this.findNextNode(node, 'successNode', edges, nodeMap);
          continue;
        }

        let isSuccess = true;
        let failReason = '';

        try {
          switch (action) {
            case 'Start':
              // Entry point, no action needed
              break;

            case 'Wake':
            case 'WakeUp':
              runState.log('INFO', `Waking screen and unlocking [${serial}]`);
              await this.adb.wake(serial);
              break;

            case 'StartApp': {
              const pkg = interpolate(options.packageName || options.package || '');
              if (pkg) {
                runState.log('INFO', `Launching package: ${pkg}`);
                variables['currentAppPackage'] = pkg;
                await this.adb.startApp(serial, pkg);
              }
              break;
            }

            case 'StopApp': {
              const pkg = interpolate(options.packageName || options.package || '');
              if (pkg) {
                // Nếu là Threads và không yêu cầu instant, đợi 1.5s để tiến trình kịp hoàn tất dữ liệu mạng
                if (pkg === 'com.instagram.barcelona' && !options.instant) {
                  runState.log('INFO', `[StopApp] Đợi 1.5s để tiến trình Threads đồng bộ dữ liệu mạng trước khi đóng...`);
                  await new Promise(r => setTimeout(r, 1500));
                }
                runState.log('INFO', `Stopping package: ${pkg}`);
                await this.adb.stopApp(serial, pkg);
              }
              break;
            }

            case 'Touch': {
              const selector = interpolate(options.xpath || options.selector || '');
              const rawX = options.touchX !== undefined ? options.touchX : options.x;
              const rawY = options.touchY !== undefined ? options.touchY : options.y;
              const touchX = rawX !== undefined ? parseFloat(interpolate(String(rawX))) : undefined;
              const touchY = rawY !== undefined ? parseFloat(interpolate(String(rawY))) : undefined;

              const selLower = (selector || '').toLowerCase();
              const labelLower = (label || '').toLowerCase();

              const isPostButton = selLower.includes('post_button') || selLower.includes('đăng') || labelLower.includes('đăng') || labelLower.includes('post');
              const isSearchButton = selLower.includes('search_button') || selLower.includes('tìm kiếm') || labelLower.includes('tìm kiếm') || labelLower.includes('search');
              const isSearchBar = selLower.includes('searchbar') || selLower.includes('search_bar') || labelLower.includes('focus ô search');
              const isReplyButton = selLower.includes('reply') || selLower.includes('trả lời') || labelLower.includes('trả lời');
              const isLikeButton = selLower.includes('like') || selLower.includes('thích') || labelLower.includes('thích') || labelLower.includes('like');
              const isPostDetailOpen = labelLower.includes('mở chi tiết') || (options.touchX && String(options.touchX).includes('PostX'));

              const profile = getDeviceProfile(serial);
              let tapped = false;

              // 1. Tìm element động trên UI Hierarchy dump
              let dump = null;
              try {
                dump = await this.adb.dumpHierarchy(serial);
              } catch (dErr) {
                runState.log('DEBUG', `Dump hierarchy failed: ${dErr.message}`);
              }

              if (dump && dump.elements) {
                // A. Xử lý nút Đăng (Post): Tìm chính xác nút Đăng, TUYỆT ĐỐI KHÔNG bấm Back hạ bàn phím vì làm hủy trình soạn thảo
                if (isPostButton) {
                  const postEl = dump.elements.find(e => 
                    (e.resourceId || '').includes('new_thread_screen_post_button') ||
                    (e.resourceId || '').includes('permalink_inline_composer_post_button') ||
                    ((e.text === 'Đăng' || e.contentDesc === 'Đăng' || e.text === 'Post' || e.contentDesc === 'Post') && !e.contentDesc?.includes('lại') && !e.contentDesc?.includes('Repost'))
                  );
                  if (postEl && postEl.bounds && (postEl.bounds.width > 0 || postEl.bounds.height > 0)) {
                    runState.log('INFO', `[Dynamic Touch] Tìm thấy nút Đăng tại (${postEl.bounds.centerX}, ${postEl.bounds.centerY}) [${profile.name}], đang bấm...`);
                    await this.adb.tap(serial, postEl.bounds.centerX, postEl.bounds.centerY);
                    tapped = true;
                  }
                }

                // B. Xử lý nút Like: Nếu đã like rồi thì bỏ qua để tránh bấm nhầm thành Unlike
                else if (isLikeButton) {
                  const alreadyLiked = dump.elements.some(e => 
                    (e.resourceId || '').includes('unlike') || 
                    (e.contentDesc || '').toLowerCase().startsWith('bỏ thích') || 
                    (e.contentDesc || '').toLowerCase().startsWith('unlike')
                  );
                  if (alreadyLiked) {
                    runState.log('INFO', `[Dynamic Touch] Bài viết đã được thả tim từ trước, bỏ qua bấm Like.`);
                    tapped = true;
                  } else {
                    const likeEl = dump.elements.find(e => 
                      (e.resourceId || '').includes('feed_post_ufi_like_button') || 
                      (e.contentDesc || '').startsWith('Thích') || 
                      (e.contentDesc || '').startsWith('Like')
                    );
                    if (likeEl && likeEl.bounds) {
                      runState.log('INFO', `[Dynamic Touch] Thả tim bài viết tại (${likeEl.bounds.centerX}, ${likeEl.bounds.centerY})...`);
                      await this.adb.tap(serial, likeEl.bounds.centerX, likeEl.bounds.centerY);
                      tapped = true;
                    }
                  }
                }

                // C. Xử lý ô Trả lời (Reply / Inline Composer)
                else if (isReplyButton) {
                  const replyEl = dump.elements.find(e => 
                    (e.resourceId || '').includes('feed_post_ufi_reply_button') ||
                    (e.resourceId || '').includes('permalink_inline_composer') ||
                    (e.resourceId || '').includes('new_thread_screen_composer') ||
                    (e.contentDesc || '').startsWith('Trả lời') ||
                    (e.contentDesc || '').startsWith('Reply')
                  );
                  if (replyEl && replyEl.bounds && (replyEl.bounds.width > 0 || replyEl.bounds.height > 0)) {
                    runState.log('INFO', `[Dynamic Touch] Bấm ô trả lời tại (${replyEl.bounds.centerX}, ${replyEl.bounds.centerY}) [${profile.name}]...`);
                    await this.adb.tap(serial, replyEl.bounds.centerX, replyEl.bounds.centerY);
                    tapped = true;
                  }
                }

                // D. Xử lý nút Tìm kiếm (Search Icon trên Main Feed)
                else if (isSearchButton) {
                  const searchEl = dump.elements.find(e => 
                    (e.resourceId || '').includes('main_feed_search_button') ||
                    (e.contentDesc === 'Search' || e.contentDesc === 'Tìm kiếm')
                  );
                  if (searchEl && searchEl.bounds && (searchEl.bounds.width > 0 || searchEl.bounds.height > 0)) {
                    runState.log('INFO', `[Dynamic Touch] Bấm icon Tìm kiếm tại (${searchEl.bounds.centerX}, ${searchEl.bounds.centerY}) [${profile.name}]...`);
                    await this.adb.tap(serial, searchEl.bounds.centerX, searchEl.bounds.centerY);
                    tapped = true;
                  }
                }

                // E. Xử lý thanh gõ tìm kiếm (Search Bar Input)
                else if (isSearchBar) {
                  const inputEl = dump.elements.find(e => 
                    (e.resourceId || '').includes('BdsSearchBarInput') ||
                    (e.resourceId || '').includes('search_bar_edit_text') ||
                    (e.resourceId || '').includes('BdsSearchBar')
                  );
                  if (inputEl && inputEl.bounds && (inputEl.bounds.width > 0 || inputEl.bounds.height > 0)) {
                    runState.log('INFO', `[Dynamic Touch] Focus thanh tìm kiếm tại (${inputEl.bounds.centerX}, ${inputEl.bounds.centerY}) [${profile.name}]...`);
                    await this.adb.tap(serial, inputEl.bounds.centerX, inputEl.bounds.centerY);
                    tapped = true;
                  }
                }

                // F. Các selector khác
                if (!tapped && selector) {
                  const el = this.findElement(dump.elements, selector);
                  if (el && el.bounds && (el.bounds.width > 0 || el.bounds.height > 0)) {
                    runState.log('INFO', `[Dynamic Touch] Tìm thấy "${selector}" tại (${el.bounds.centerX}, ${el.bounds.centerY}), đang bấm...`);
                    await this.adb.tap(serial, el.bounds.centerX, el.bounds.centerY);
                    tapped = true;
                  }
                }
              }

              // 2. Dự phòng theo cấu hình DEVICE_PROFILES từng thiết bị nếu không tìm thấy bằng Hierarchy
              if (!tapped) {
                let actualX = touchX;
                let actualY = touchY;

                if (isPostButton) {
                  try {
                    const keyboardUp = await this.adb.isKeyboardShown(serial);
                    const postCoord = keyboardUp ? profile.postKeyboardUp : profile.post;
                    actualX = postCoord.x;
                    actualY = postCoord.y;
                    runState.log('INFO', `[Device Profile: ${profile.name}] Tọa độ nút Đăng (${keyboardUp ? 'bàn phím mở' : 'bàn phím đóng'}): (${actualX}, ${actualY})`);
                  } catch {
                    actualX = profile.post.x;
                    actualY = profile.post.y;
                  }
                } else if (isSearchButton) {
                  actualX = profile.search.x;
                  actualY = profile.search.y;
                  runState.log('INFO', `[Device Profile: ${profile.name}] Tọa độ icon Tìm kiếm: (${actualX}, ${actualY})`);
                } else if (isSearchBar) {
                  actualX = profile.searchBar.x;
                  actualY = profile.searchBar.y;
                  runState.log('INFO', `[Device Profile: ${profile.name}] Tọa độ thanh Tìm kiếm: (${actualX}, ${actualY})`);
                } else if (isReplyButton) {
                  actualX = profile.reply.x;
                  actualY = profile.reply.y;
                  runState.log('INFO', `[Device Profile: ${profile.name}] Tọa độ ô Trả lời: (${actualX}, ${actualY})`);
                } else if (isLikeButton) {
                  actualX = profile.like.x;
                  actualY = profile.like.y;
                  runState.log('INFO', `[Device Profile: ${profile.name}] Tọa độ nút Thích: (${actualX}, ${actualY})`);
                } else if (touchX !== undefined && touchY !== undefined && !isNaN(touchX) && !isNaN(touchY)) {
                  // Auto-scale relative to 720p if screen is 1080p
                  if (profile.width !== 720 && touchX <= 720 && touchY <= 1600 && !options.touchX?.includes?.('PostX')) {
                    actualX = Math.round(touchX * (profile.width / 720));
                    actualY = Math.round(touchY * (profile.height / 1600));
                    runState.log('INFO', `[Device Scaling: ${profile.name}] Auto-scale tọa độ (${touchX}, ${touchY}) -> (${actualX}, ${actualY})`);
                  }
                } else if (isPostDetailOpen) {
                  actualX = Math.round(profile.width / 2);
                  actualY = Math.round(profile.height * 0.42);
                }

                if (actualX !== undefined && actualY !== undefined && !isNaN(actualX) && !isNaN(actualY)) {
                  runState.log('INFO', `Tapping coordinates (${actualX}, ${actualY}) on [${serial}]`);
                  await this.adb.tap(serial, actualX, actualY);
                  tapped = true;
                }
              }

              // 3. Bảo vệ tự phục hồi khi mở chi tiết bài: nếu bấm nhầm vào Profile của tác giả, tự Back và bấm lại
              if (isPostDetailOpen && tapped) {
                await new Promise(r => setTimeout(r, 2200));
                try {
                  const chkDump = await this.adb.dumpHierarchy(serial);
                  const isProfile = chkDump.elements.some(e => 
                    (e.text || '').includes('Chỉnh sửa trang cá nhân') ||
                    (e.text || '').includes('Chia sẻ trang cá nhân') ||
                    (e.text || '').includes('Trang cá nhân liên quan') ||
                    ((e.contentDesc || '').includes('Trang cá nhân') && (e.resourceId || '').includes('header'))
                  );
                  if (isProfile) {
                    runState.log('WARN', `[Self-Healing Guard] Phát hiện bấm nhầm vào Trang cá nhân! Bấm Back quay lại danh sách tìm kiếm...`);
                    await this.adb.keyevent(serial, 4);
                    await new Promise(r => setTimeout(r, 1500));
                    // Cuộn nhẹ và bấm lại vào giữa màn hình
                    await this.adb.swipe(serial, Math.round(profile.width / 2), Math.round(profile.height * 0.6), Math.round(profile.width / 2), Math.round(profile.height * 0.4), 500);
                    await new Promise(r => setTimeout(r, 1500));
                    const safeY = Math.round(profile.height * 0.45);
                    runState.log('INFO', `[Self-Healing Guard] Bấm lại vào giữa thân bài viết tại (${Math.round(profile.width / 2)}, ${safeY})...`);
                    await this.adb.tap(serial, Math.round(profile.width / 2), safeY);
                  }
                } catch (gErr) {
                  runState.log('DEBUG', `Post detail guard error: ${gErr.message}`);
                }
              }

              // 4. Nếu là nút Đăng, xác nhận gửi thành công (trình soạn thảo đóng lại)
              if (isPostButton && tapped) {
                runState.log('INFO', `[Post Action] Đang theo dõi gửi bình luận lên Threads [${serial}]...`);
                let composerClosed = false;
                for (let w = 0; w < 5; w++) {
                  await new Promise(r => setTimeout(r, 1200));
                  try {
                    const chkDump = await this.adb.dumpHierarchy(serial);
                    const inComposer = chkDump.elements.some(e => 
                      (e.resourceId || '').includes('new_thread_screen_composer') ||
                      (e.resourceId || '').includes('new_thread_screen_post_button') ||
                      (e.resourceId || '').includes('permalink_inline_composer_post_button')
                    );
                    if (!inComposer) {
                      composerClosed = true;
                      runState.log('INFO', `[Post Action] Bình luận đã được gửi thành công lên Threads (trình soạn thảo đã đóng).`);
                      break;
                    }
                  } catch {}
                }
                if (!composerClosed) {
                  runState.log('WARN', `[Post Action] Trình soạn thảo vẫn còn mở, bấm lại nút Đăng lần 2 để đảm bảo gửi...`);
                  try {
                    const dumpRetry = await this.adb.dumpHierarchy(serial);
                    const retryBtn = dumpRetry.elements.find(e => 
                      (e.resourceId || '').includes('new_thread_screen_post_button') ||
                      (e.resourceId || '').includes('permalink_inline_composer_post_button') ||
                      ((e.text === 'Đăng' || e.contentDesc === 'Đăng') && !e.contentDesc?.includes('lại'))
                    );
                    if (retryBtn && retryBtn.bounds) {
                      await this.adb.tap(serial, retryBtn.bounds.centerX, retryBtn.bounds.centerY);
                    } else {
                      await this.adb.tap(serial, profile.post.x, profile.post.y);
                    }
                  } catch {}
                }
              }

              if (!tapped) {
                isSuccess = false;
                failReason = `Không tìm thấy phần tử (${selector || 'N/A'}) và không có tọa độ hợp lệ.`;
                runState.log('WARN', failReason);
              }
              break;
            }

            case 'Swipe': {
              const profile = getDeviceProfile(serial);
              const dir = options.swipeDirection || 'up';
              // Tối ưu tốc độ vuốt: Vuốt video cần dứt khoát (350ms - 450ms) để thuật toán gesture TikTok/Reels nhận diện là chuyển clip thay vì kéo dở
              let rawDuration = parseInt(options.swipeTime || '400', 10);
              const duration = rawDuration > 550 ? 420 : (rawDuration < 200 ? 350 : rawDuration);
              
              const jitter = (base, range = 15) => base + Math.floor(Math.random() * (range * 2 + 1)) - range;
              const midX = Math.round(profile.width / 2);

              // Tọa độ tính toán động theo độ phân giải màn hình từng máy (đặc biệt các dòng màn dài Full HD+ như Samsung A14 1080x2408)
              // Quãng đường vuốt đạt ~58% chiều cao màn hình (từ 78% lên 20%) đảm bảo 100% qua clip
              let x1 = jitter(midX, Math.round(profile.width * 0.03));
              let y1 = jitter(Math.round(profile.height * 0.78), 25);
              let x2 = jitter(midX, Math.round(profile.width * 0.03));
              let y2 = jitter(Math.round(profile.height * 0.20), 25);

              if (dir === 'down') {
                y1 = jitter(Math.round(profile.height * 0.22), 25);
                y2 = jitter(Math.round(profile.height * 0.78), 25);
              } else if (dir === 'left') {
                x1 = jitter(Math.round(profile.width * 0.85), 20);
                x2 = jitter(Math.round(profile.width * 0.15), 20);
                y1 = y2 = jitter(Math.round(profile.height * 0.50), 30);
              } else if (dir === 'right') {
                x1 = jitter(Math.round(profile.width * 0.15), 20);
                x2 = jitter(Math.round(profile.width * 0.85), 20);
                y1 = y2 = jitter(Math.round(profile.height * 0.50), 30);
              }

              runState.log('INFO', `Swiping ${dir} trên [${profile.name || serial}] (${x1},${y1} -> ${x2},${y2}, ${duration}ms, Quãng đường: ${Math.abs(y1 - y2)}px)`);
              await this.adb.swipe(serial, x1, y1, x2, y2, duration);
              break;
            }

            case 'EnsureFeed':
            case 'AutoRecovery': {
              const targetPkg = interpolate(options.targetPackage || options.packageName || variables['currentAppPackage'] || '');
              runState.log('INFO', `[AutoRecovery] Kiểm tra trạng thái màn hình [${serial}] (App: ${targetPkg || 'Tự động'})...`);
              try {
                // 0. Tự động quét dọn các popup/hộp thoại chặn
                await this.dismissPopups(serial, runState);

                // 1. Kiểm tra nhanh cửa sổ đang focus (< 30ms)
                const focus = await this.adb.getCurrentFocus(serial);
                
                // 2. Kiểm tra bàn phím ảo (IME)
                const keyboardUp = await this.adb.isKeyboardShown(serial);
                if (keyboardUp) {
                  runState.log('WARN', `[AutoRecovery] Bàn phím ảo đang mở (do bấm nhầm vào comment/nhập liệu), bấm Back hạ bàn phím...`);
                  await this.adb.keyevent(serial, 4); // Back to close keyboard
                  await new Promise(r => setTimeout(r, 600));
                }

                // 3. Kiểm tra In-App Browser / Web ngoài / Quảng cáo / Google Play / Permission dialog
                const isInAppBrowser = focus.includes('BrowserLiteActivity') || 
                                       focus.includes('com.android.chrome') || 
                                       focus.includes('CustomTabActivity') ||
                                       focus.includes('com.android.vending');

                const isPermissionDialog = focus.includes('com.android.permissioncontroller') ||
                                          focus.includes('GrantPermissionsActivity');

                if (isPermissionDialog) {
                  runState.log('WARN', `[AutoRecovery] Phát hiện hộp thoại cấp quyền hệ thống, đóng hộp thoại...`);
                  await this.adb.keyevent(serial, 4);
                  await new Promise(r => setTimeout(r, 600));
                }

                if (isInAppBrowser) {
                  runState.log('WARN', `[AutoRecovery] Phát hiện đang ở link quảng cáo/trình duyệt ngoài, bấm Back để thoát...`);
                  await this.adb.keyevent(serial, 4);
                  await new Promise(r => setTimeout(r, 800));
                  const focus2 = await this.adb.getCurrentFocus(serial);
                  if (focus2.includes('BrowserLiteActivity') || focus2.includes('com.android.chrome') || focus2.includes('com.android.vending')) {
                    await this.adb.keyevent(serial, 4);
                    await new Promise(r => setTimeout(r, 600));
                  }
                }

                // 4. Nếu mục tiêu là Facebook katana: kiểm tra modal ảnh hoặc nếu bị văng khỏi Facebook
                if (targetPkg === 'com.facebook.katana') {
                  const isModalOrDetail = focus.includes('PhotoGalleryActivity') || 
                                          focus.includes('MediaGalleryActivity') ||
                                          focus.includes('BottomSheet') ||
                                          focus.includes('FlyoutViewGroup');
                  if (isModalOrDetail) {
                    runState.log('WARN', `[AutoRecovery] Phát hiện đang mở xem ảnh chi tiết FB, bấm Back quay lại Feed...`);
                    await this.adb.keyevent(serial, 4);
                    await new Promise(r => setTimeout(r, 600));
                  }
                  if (focus && focus.trim() && !focus.includes('com.facebook.katana') && !focus.includes('mCurrentFocus=null')) {
                    runState.log('WARN', `[AutoRecovery] Đang ở ngoài app Facebook, mở lại Facebook katana...`);
                    await this.adb.startApp(serial, 'com.facebook.katana');
                    await new Promise(r => setTimeout(r, 3000));
                  }
                } else if (targetPkg === 'com.instagram.barcelona' || (focus && focus.includes('barcelona'))) {
                  // Với Threads: kiểm tra nếu đang kẹt ở hộp thoại lưu nháp hoặc màn hình soạn Thread mới
                  try {
                    const dump = await this.adb.dumpHierarchy(serial);
                    // Nếu đang ở màn hình Profile (Trang cá nhân): bấm tab Bảng feed góc trái đáy để về Feed chính
                    const onProfile = dump.elements.some(e => 
                      (e.resourceId || '').includes('profile_screen') || 
                      (e.text || '').includes('Chỉnh sửa trang cá nhân') || 
                      (e.text || '').includes('Edit profile') ||
                      (e.contentDesc || '').toLowerCase() === 'trang cá nhân'
                    );
                    if (onProfile) {
                      const feedTab = dump.elements.find(e => (e.contentDesc || '').toLowerCase().includes('feed') || (e.contentDesc || '').toLowerCase().includes('bảng feed'));
                      if (feedTab && feedTab.bounds) {
                        runState.log('WARN', `[AutoRecovery] Đang ở Trang cá nhân, bấm tab Bảng feed tại (${feedTab.bounds.centerX}, ${feedTab.bounds.centerY}) để chuyển về Feed chính...`);
                        await this.adb.tap(serial, feedTab.bounds.centerX, feedTab.bounds.centerY);
                        await new Promise(r => setTimeout(r, 1500));
                      }
                    }

                    const isDiscardDialog = dump.elements.find(e => e.text === 'Không lưu' || (e.resourceId && e.resourceId.includes('igds_alert_dialog_secondary_button')));
                    if (isDiscardDialog && isDiscardDialog.bounds) {
                      runState.log('WARN', `[AutoRecovery] Phát hiện hộp thoại lưu bản nháp Threads, bấm "Không lưu" để xóa bản nháp...`);
                      await this.adb.tap(serial, isDiscardDialog.bounds.centerX, isDiscardDialog.bounds.centerY);
                      await new Promise(r => setTimeout(r, 800));
                    } else {
                      const isNewThread = dump.elements.some(e => e.text === 'Thread mới' || (e.contentDesc === 'Có gì mới?' && (e.resourceId || '').includes('new_thread_screen_composer')));
                      if (isNewThread) {
                        runState.log('WARN', `[AutoRecovery] Phát hiện đang ở màn hình soạn Thread mới ngoài ý muốn, bấm Back và hủy nháp để về Feed chính...`);
                        await this.adb.keyevent(serial, 4);
                        await new Promise(r => setTimeout(r, 800));
                        const dump2 = await this.adb.dumpHierarchy(serial);
                        const discardBtn = dump2.elements.find(e => e.text === 'Không lưu' || (e.resourceId && e.resourceId.includes('igds_alert_dialog_secondary_button')));
                        if (discardBtn && discardBtn.bounds) {
                          await this.adb.tap(serial, discardBtn.bounds.centerX, discardBtn.bounds.centerY);
                          await new Promise(r => setTimeout(r, 800));
                        }
                      }
                    }
                  } catch (tErr) {}

                  // Mở lại nếu văng khỏi app
                  if (focus && focus.trim() && !focus.includes('com.instagram.barcelona') && !focus.includes('mCurrentFocus=null')) {
                    runState.log('WARN', `[AutoRecovery] Đang ở ngoài app Threads, mở lại...`);
                    await this.adb.startApp(serial, 'com.instagram.barcelona');
                    await new Promise(r => setTimeout(r, 3000));
                  }
                } else if (targetPkg === 'com.ss.android.ugc.trill' || (focus && focus.includes('trill'))) {
                  // Với TikTok: Xử lý toàn diện Live, Sản phẩm, Voucher, Quyền danh bạ và Quảng cáo
                  await this.handleTikTokEdgeCases(serial, runState);

                  // Kiểm tra nếu đang bị kẹt ở màn hình Profile của ai đó (do bấm nhầm vào avatar)
                  try {
                    const dump = await this.adb.dumpHierarchy(serial);
                    const onOtherProfile = dump.elements.some(e => 
                      ((e.text || '').includes('Tin nhắn') && (e.text || '').includes('Đang theo dõi')) ||
                      (e.contentDesc || '').includes('Trang cá nhân của')
                    );
                    if (onOtherProfile) {
                      runState.log('WARN', `[AutoRecovery] Đang ở trang cá nhân người khác (do bấm nhầm Avatar), bấm Back quay lại Newfeed TikTok...`);
                      await this.adb.keyevent(serial, 4);
                      await new Promise(r => setTimeout(r, 800));
                    }
                  } catch {}

                  // Mở lại nếu văng khỏi app TikTok
                  if (focus && focus.trim() && !focus.includes('com.ss.android.ugc.trill') && !focus.includes('mCurrentFocus=null')) {
                    runState.log('WARN', `[AutoRecovery] Đang ở ngoài app TikTok, mở lại...`);
                    await this.adb.startApp(serial, 'com.ss.android.ugc.trill');
                    await new Promise(r => setTimeout(r, 3000));
                  }
                } else if (targetPkg) {
                  // Với các app khác: chỉ mở lại nếu văng hoàn toàn khỏi app đó
                  if (focus && focus.trim() && !focus.includes(targetPkg) && !focus.includes('mCurrentFocus=null')) {
                    runState.log('WARN', `[AutoRecovery] Đang ở ngoài app ${targetPkg}, mở lại...`);
                    await this.adb.startApp(serial, targetPkg);
                    await new Promise(r => setTimeout(r, 3000));
                  }
                }
              } catch (recErr) {
                runState.log('WARN', `[AutoRecovery] Kiểm tra cảnh báo: ${recErr.message}`);
              }
              break;
            }

            case 'Loop':
            case 'LoopV2': {
              const loopId = options.loopId || node.id;
              const maxCount = parseInt(interpolate(String(options.forTo || options.count || '15')), 10);
              const counterKey = `__loop_${loopId}_counter`;
              const currentCount = (variables[counterKey] || 0) + 1;
              variables[counterKey] = currentCount;

              if (currentCount <= maxCount) {
                runState.log('INFO', `[Loop] Chu kỳ ${currentCount}/${maxCount} đang thực thi...`);
                isSuccess = true;
              } else {
                runState.log('INFO', `[Loop] Đã hoàn thành toàn bộ ${maxCount} chu kỳ. Kết thúc vòng lặp!`);
                variables[counterKey] = 0; // reset for next run
                isSuccess = false;
              }
              break;
            }

            case 'ExtractPostContent':
            case 'ExtractThreadsPost': {
              runState.log('INFO', `[AI Extractor] Đang quét nội dung bài viết trên màn hình [${serial}]...`);
              try {
                const profile = getDeviceProfile(serial);
                const isHD = profile.height < 1800;
                const minY = isHD ? 300 : 460;
                const maxY = profile.height - (isHD ? 120 : 180);

                const ignoredSubstrings = [
                  'bảng feed', 'tin nhắn', 'tạo', 'hoạt động', 'trang cá nhân', 'quay lại', 'thread',
                  'lượt xem', 'trả lời', 'bật thông báo', 'bộ lọc', 'hàng đầu', 'thịnh hành', 'trending',
                  'theo dõi', 'gợi ý theo dõi', 'gợi ý', 'đăng', 'thư viện', 'ảnh gif', 'thêm file',
                  'mới đây', 'chỉnh sửa', 'tìm kiếm', 'search', 'ghim lên', 'lựa chọn khác',
                  'xem trước video', 'bỏ qua', 'liên quan', 'có gì mới?', 'thread mới',
                  'bài viết tự hủy', 'thêm vào thread', 'nhấp để xem', 'đăng lại', 'chia sẻ'
                ];

                const filterPosts = (elements) => {
                  return elements.filter(el => {
                    // 1. Phải có bounds hợp lệ trên màn hình (không phải 0x0)
                    if (!el.bounds || el.bounds.width < 50 || el.bounds.height < 20) return false;
                    // 2. Không được nằm trong dải tabs/chips tìm kiếm trên cùng hoặc bottom nav
                    if (el.bounds.centerY < minY || el.bounds.centerY > maxY) return false;

                    // 3. Không được là header tác giả, nút chức năng hoặc thanh tab
                    const resId = (el.resourceId || '').toLowerCase();
                    if (resId.includes('header') || resId.includes('action_menu') || 
                        resId.includes('button') || resId.includes('tab') || resId.includes('avatar') ||
                        resId.includes('link_preview') || resId.includes('attachment') || resId.includes('browser')) {
                      return false;
                    }

                    // 4. Độ dài text tối thiểu 20 ký tự
                    const txt = (el.text || '').trim();
                    if (txt.length < 20) return false;
                    const lower = txt.toLowerCase();

                    // 5. CHỐNG BẤM LINK NGOÀI / BROWSER HIJACK:
                    // Tuyệt đối loại bỏ bài viết có chứa URL, link web, hoặc kêu gọi click bio/link
                    const hasUrlOrLink = /https?:\/\/|www\.|\.com\b|\.vn\b|\.co\b|\.io\b|\.net\b|bit\.ly|t\.co|t\.me|link\s*(?:ở|trong|tại|dưới)?\s*bio|nhấp\s*vào\s*link|click\s*link|link\s*bài|web\s*site/i.test(txt);
                    if (hasUrlOrLink) return false;

                    // 6. CHỐNG BÀI VIẾT BỊ KHÓA BÌNH LUẬN:
                    if (lower.includes('tính năng bình luận đã bị giới hạn') || 
                        lower.includes('không thể bình luận') || 
                        lower.includes('comments are limited') ||
                        lower.includes('bình luận đã bị tắt')) {
                      return false;
                    }

                    // 7. Không chứa các cụm từ UI bị cấm
                    if (ignoredSubstrings.some(ign => lower.includes(ign))) return false;

                    // 8. Loại bỏ username header định dạng "username • topic date"
                    if (/\s[\uFFFD•·]\s*.*\d+\s*(ngày|giờ|phút|tháng|tuần|\d{2}\/\d{2})/i.test(txt)) return false;
                    if (/^\w+[\w\.]*\s+.*\d+\s*(ngày|giờ|phút|tháng|tuần|\d{2}\/\d{2})/i.test(txt)) return false;

                    // 9. BỘ LỌC TIÊU CỰC (NEGATIVE FILTER) & PHÂN LOẠI 4 NHÓM
                    const postClass = classifyPost(txt);
                    if (!postClass.shouldComment || postClass.tier === 'ADS') {
                      return false;
                    }
                    el._postClass = postClass;

                    return true;
                  });
                };

                let dump = await this.adb.dumpHierarchy(serial);
                let candidates = filterPosts(dump.elements);

                // Nếu chưa thấy bài, vuốt nhẹ lên 1 lần để vượt qua các tab & gợi ý phía trên
                if (candidates.length === 0) {
                  runState.log('INFO', `[AI Extractor] Chưa thấy bài viết ở đầu trang, cuộn nhẹ xuống...`);
                  await this.adb.swipe(serial, Math.round(profile.width / 2), Math.round(profile.height * 0.65), Math.round(profile.width / 2), Math.round(profile.height * 0.35), 650);
                  await new Promise(r => setTimeout(r, 2000));
                  dump = await this.adb.dumpHierarchy(serial);
                  candidates = filterPosts(dump.elements);
                }

                // Lọc loại bỏ những bài viết mà bất kỳ thiết bị nào trong farm đã từng tương tác/comment trước đây
                let freshCandidates = candidates.filter(el => !dataStore.isPostInteracted(el.text));

                // Nếu tất cả bài trên màn hình đều đã tương tác: tự động cuộn xuống để tìm bài viết mới
                if (candidates.length > 0 && freshCandidates.length === 0) {
                  runState.log('WARN', `[AI Extractor] Toàn bộ ${candidates.length} bài trên màn hình đều đã được tương tác trước đó. Đang cuộn xuống tìm bài mới...`);
                  await this.adb.swipe(serial, Math.round(profile.width / 2), Math.round(profile.height * 0.7), Math.round(profile.width / 2), Math.round(profile.height * 0.3), 650);
                  await new Promise(r => setTimeout(r, 2000));
                  dump = await this.adb.dumpHierarchy(serial);
                  candidates = filterPosts(dump.elements);
                  freshCandidates = candidates.filter(el => !dataStore.isPostInteracted(el.text));
                }

                const pickPool = freshCandidates.length > 0 ? freshCandidates : candidates;

                if (pickPool.length > 0) {
                  // Sắp xếp bài ưu tiên: Type A/B trước (priorityScore cao nhất), sau đó đến độ dài text
                  pickPool.sort((a, b) => {
                    const scoreDiff = (b._postClass?.priorityScore || 0) - (a._postClass?.priorityScore || 0);
                    if (scoreDiff !== 0) return scoreDiff;
                    return (b.text?.length || 0) - (a.text?.length || 0);
                  });
                  // CHỐNG TRÙNG LẶP: Lấy ngẫu nhiên trong top 3 bài phù hợp nhất (thay vì luôn cố định bài 0)
                  const topCount = Math.min(3, pickPool.length);
                  const chosenPost = pickPool[Math.floor(Math.random() * topCount)];
                  const cleanText = chosenPost.text.replace(/&#10;/g, ' ').replace(/\n+/g, ' ').trim();

                  variables['PostContent'] = cleanText;
                  variables['PostTier'] = chosenPost._postClass?.tier || 'A';
                  variables['PostSituation'] = chosenPost._postClass?.situation || 'SITUATION_1_STRUGGLING';
                  variables['PostPriorityScore'] = chosenPost._postClass?.priorityScore || 80;
                  variables['PostClassReason'] = chosenPost._postClass?.reason || '';

                  // Chọn tọa độ an toàn giữa thân bài (tránh avatar bên trái và hàng icon like/reply bên dưới)
                  variables['PostX'] = Math.round(profile.width / 2);
                  variables['PostY'] = (chosenPost.bounds && chosenPost.bounds.height > 0) 
                    ? Math.min(Math.max(chosenPost.bounds.centerY, minY + 50), maxY - 100) 
                    : Math.round(profile.height * 0.45);

                  // Ghi nhận ngay vào danh sách đã tương tác để các máy khác hoặc lần chạy sau không chọn lại
                  dataStore.recordInteractedPost(cleanText, serial, variables['SearchKeyword'] || '');

                  const isFresh = freshCandidates.includes(chosenPost);
                  const tierTag = chosenPost._postClass ? `[Tier ${chosenPost._postClass.tier} | ${chosenPost._postClass.situation}]` : '';
                  runState.log('INFO', `[AI Extractor] Đã chọn bài viết ${isFresh ? 'MỚI' : 'dự phòng'} ${tierTag} (${cleanText.length} ký tự) tại (${variables['PostX']}, ${variables['PostY']}): "${cleanText.substring(0, 80)}..."`);
                } else {
                  runState.log('WARN', '[AI Extractor] Không có bài viết phù hợp trên kết quả tìm kiếm, bấm Back để quét bài trên Main Feed...');
                  try {
                    await this.adb.keyevent(serial, 4);
                    await new Promise(r => setTimeout(r, 1500));
                    const feedDump = await this.adb.dumpHierarchy(serial);
                    const feedCandidates = filterPosts(feedDump.elements);
                    if (feedCandidates.length > 0) {
                      feedCandidates.sort((a, b) => {
                        const scoreDiff = (b._postClass?.priorityScore || 0) - (a._postClass?.priorityScore || 0);
                        if (scoreDiff !== 0) return scoreDiff;
                        return (b.text?.length || 0) - (a.text?.length || 0);
                      });
                      const topCount = Math.min(3, feedCandidates.length);
                      const chosenPost = feedCandidates[Math.floor(Math.random() * topCount)];
                      const cleanText = chosenPost.text.replace(/&#10;/g, ' ').replace(/\n+/g, ' ').trim();
                      variables['PostContent'] = cleanText;
                      variables['PostTier'] = chosenPost._postClass?.tier || 'A';
                      variables['PostSituation'] = chosenPost._postClass?.situation || 'SITUATION_1_STRUGGLING';
                      variables['PostPriorityScore'] = chosenPost._postClass?.priorityScore || 80;
                      variables['PostX'] = Math.round(profile.width / 2);
                      variables['PostY'] = (chosenPost.bounds && chosenPost.bounds.height > 0) 
                        ? Math.min(Math.max(chosenPost.bounds.centerY, minY + 50), maxY - 100) 
                        : Math.round(profile.height * 0.45);
                      dataStore.recordInteractedPost(cleanText, serial, variables['SearchKeyword'] || '');
                      const tierTag = chosenPost._postClass ? `[Tier ${chosenPost._postClass.tier} | ${chosenPost._postClass.situation}]` : '';
                      runState.log('INFO', `[AI Extractor] Đã chọn bài viết từ Main Feed ${tierTag} (${cleanText.length} ký tự) tại (${variables['PostX']}, ${variables['PostY']}): "${cleanText.substring(0, 80)}..."`);
                    } else {
                      variables['PostContent'] = 'Kinh nghiệm học nói tiếng Trung giao tiếp cho người đi làm và người tự học từ đầu';
                      variables['PostTier'] = 'A';
                      variables['PostSituation'] = 'SITUATION_1_STRUGGLING';
                      variables['PostX'] = Math.round(profile.width / 2);
                      variables['PostY'] = Math.round(profile.height * 0.42);
                    }
                  } catch {
                    variables['PostContent'] = 'Kinh nghiệm học nói tiếng Trung giao tiếp cho người đi làm và người tự học từ đầu';
                    variables['PostTier'] = 'A';
                    variables['PostSituation'] = 'SITUATION_1_STRUGGLING';
                    variables['PostX'] = Math.round(profile.width / 2);
                    variables['PostY'] = Math.round(profile.height * 0.42);
                  }
                }
              } catch (exErr) {
                runState.log('WARN', `[AI Extractor] Lỗi quét bài: ${exErr.message}`);
                variables['PostContent'] = 'Kinh nghiệm luyện phản xạ nói tiếng Trung và chỉnh phát âm';
                variables['PostTier'] = 'A';
                variables['PostSituation'] = 'SITUATION_1_STRUGGLING';
              }
              isSuccess = true;
              break;
            }

            case 'DismissPopups': {
              runState.log('INFO', `[Popup Guard] Đang quét và tự động đóng các hộp thoại/thông báo chặn trên [${serial}]...`);
              await this.dismissPopups(serial, runState);
              isSuccess = true;
              break;
            }

            case 'EnsurePostDetail': {
              runState.log('INFO', `[Post Detail Guard] Đang kiểm tra chi tiết bài viết [${serial}]...`);
              const profile = getDeviceProfile(serial);
              let ok = false;

              for (let attempt = 1; attempt <= 3; attempt++) {
                // 1. Kiểm tra focus: có bị nhảy sang trình duyệt web / In-App browser không?
                const focus = await this.adb.getCurrentFocus(serial);
                const isInAppBrowser = focus.includes('BrowserLiteActivity') || 
                                       focus.includes('com.android.chrome') || 
                                       focus.includes('CustomTabActivity') ||
                                       focus.includes('com.android.vending');

                if (isInAppBrowser) {
                  runState.log('WARN', `[Link Hijack Guard] ⚠️ Bị mở nhầm vào trình duyệt web/link ngoài! Bấm Back thoát browser và chuyển bài khác... (Lần ${attempt})`);
                  await this.adb.keyevent(serial, 4); // Back
                  await new Promise(r => setTimeout(r, 1200));
                  // Cuộn xuống bài tiếp theo
                  await this.adb.swipe(serial, Math.round(profile.width / 2), Math.round(profile.height * 0.7), Math.round(profile.width / 2), Math.round(profile.height * 0.35), 600);
                  await new Promise(r => setTimeout(r, 2000));
                  // Bấm bài mới tại vùng an toàn giữa thân bài
                  const safeY = Math.round(profile.height * 0.45);
                  runState.log('INFO', `[Link Hijack Guard] Bấm mở bài viết mới tại (${Math.round(profile.width / 2)}, ${safeY})...`);
                  await this.adb.tap(serial, Math.round(profile.width / 2), safeY);
                  await new Promise(r => setTimeout(r, 2500));
                  continue;
                }

                // 2. Dump hierarchy để kiểm tra các trường hợp kẹt khác
                const dump = await this.adb.dumpHierarchy(serial);
                const elements = dump.elements || [];

                // 2a. Kiểm tra nếu bấm nhầm vào Profile của tác giả
                const onProfile = elements.some(e => 
                  (e.text || '').includes('Chỉnh sửa trang cá nhân') || 
                  (e.text || '').includes('Chia sẻ trang cá nhân') || 
                  (e.text || '').includes('Edit profile') ||
                  ((e.contentDesc || '').includes('Trang cá nhân') && (e.resourceId || '').includes('header'))
                );
                if (onProfile) {
                  runState.log('WARN', `[Post Detail Guard] ⚠️ Bị mở nhầm vào Profile tác giả! Bấm Back quay lại...`);
                  await this.adb.keyevent(serial, 4);
                  await new Promise(r => setTimeout(r, 1500));
                  // Cuộn nhẹ và bấm lại vào thân bài
                  await this.adb.swipe(serial, Math.round(profile.width / 2), Math.round(profile.height * 0.6), Math.round(profile.width / 2), Math.round(profile.height * 0.45), 500);
                  await new Promise(r => setTimeout(r, 1500));
                  const safeY = Math.round(profile.height * 0.45);
                  await this.adb.tap(serial, Math.round(profile.width / 2), safeY);
                  await new Promise(r => setTimeout(r, 2500));
                  continue;
                }

                // 2b. Kiểm tra nếu bị mở Media Viewer (fullscreen video/ảnh)
                if (focus.includes('MediaViewerActivity') || focus.includes('VideoPlayerActivity')) {
                  runState.log('WARN', `[Post Detail Guard] ⚠️ Bị mở nhầm trình xem ảnh/video toàn màn hình! Bấm Back...`);
                  await this.adb.keyevent(serial, 4);
                  await new Promise(r => setTimeout(r, 1500));
                  continue;
                }

                // 2c. KIỂM TRA BÀI VIẾT BỊ KHÓA BÌNH LUẬN ("Tính năng bình luận đã bị giới hạn")
                const isCommentRestricted = elements.some(e => {
                  const t = (e.text || '').toLowerCase();
                  const c = (e.contentDesc || '').toLowerCase();
                  return t.includes('tính năng bình luận đã bị giới hạn') ||
                         t.includes('bình luận đã bị tắt') ||
                         t.includes('không thể trả lời bài viết này') ||
                         t.includes('chỉ người theo dõi') ||
                         t.includes('comments are limited') ||
                         t.includes('replies are limited') ||
                         c.includes('tính năng bình luận đã bị giới hạn') ||
                         c.includes('comments are limited');
                });

                if (isCommentRestricted) {
                  runState.log('WARN', `[Comment Restriction Guard] ⚠️ Bài viết này đã BỊ KHÓA BÌNH LUẬN! Bấm Back và chọn bài khác...`);
                  await this.adb.keyevent(serial, 4);
                  await new Promise(r => setTimeout(r, 1500));
                  // Cuộn xuống qua bài bị khóa này
                  await this.adb.swipe(serial, Math.round(profile.width / 2), Math.round(profile.height * 0.75), Math.round(profile.width / 2), Math.round(profile.height * 0.3), 600);
                  await new Promise(r => setTimeout(r, 2000));
                  const safeY = Math.round(profile.height * 0.45);
                  runState.log('INFO', `[Comment Restriction Guard] Bấm mở bài viết thay thế tại (${Math.round(profile.width / 2)}, ${safeY})...`);
                  await this.adb.tap(serial, Math.round(profile.width / 2), safeY);
                  await new Promise(r => setTimeout(r, 2500));
                  continue;
                }

                // 2d. Kiểm tra xem trên màn hình hiện tại có nút trả lời / composer không
                const hasReplyBar = elements.some(e => 
                  (e.resourceId || '').includes('feed_post_ufi_reply_button') ||
                  (e.resourceId || '').includes('permalink_inline_composer') ||
                  (e.resourceId || '').includes('PermalinkScreen') ||
                  (e.resourceId || '').includes('permalink') ||
                  (e.contentDesc || '').toLowerCase().includes('trả lời') ||
                  (e.contentDesc || '').toLowerCase().includes('reply') ||
                  (e.text || '').toLowerCase().includes('trả lời') ||
                  (e.text || '').toLowerCase().includes('reply') ||
                  (e.text || '') === 'Thread' || (e.text || '') === 'Bài viết'
                );

                if (hasReplyBar) {
                  runState.log('INFO', `[Post Detail Guard] ✅ Đã ở trang chi tiết bài viết hợp lệ, có ô trả lời bình luận!`);
                  ok = true;
                  break;
                } else {
                  runState.log('INFO', `[Post Detail Guard] Chưa thấy ô trả lời, cuộn nhẹ 150px...`);
                  await this.adb.swipe(serial, Math.round(profile.width / 2), Math.round(profile.height * 0.55), Math.round(profile.width / 2), Math.round(profile.height * 0.45), 400);
                  await new Promise(r => setTimeout(r, 1500));
                }
              }

              if (!ok) {
                runState.log('WARN', `[Post Detail Guard] Không thể vào chi tiết bài viết hợp lệ sau các lần thử!`);
                variables['__flow_failed'] = true;
                variables['__flow_fail_reason'] = 'Không mở được chi tiết bài viết hợp lệ để bình luận';
                variables['CommentSuccess'] = false;
                isSuccess = false;
              } else {
                isSuccess = true;
              }
              break;
            }

            case 'EnsureComposerOpen': {
              runState.log('INFO', `[Composer Guard] Đang kiểm tra khung soạn thảo bình luận [${serial}]...`);
              const profile = getDeviceProfile(serial);
              let open = false;

              for (let cAttempt = 1; cAttempt <= 3; cAttempt++) {
                const dump = await this.adb.dumpHierarchy(serial);
                const inComposer = dump.elements.some(e => 
                  (e.resourceId || '').includes('new_thread_screen_composer') ||
                  (e.resourceId || '').includes('permalink_inline_composer') ||
                  e.className === 'android.widget.EditText'
                );
                const keyboardUp = await this.adb.isKeyboardShown(serial);

                if (inComposer || keyboardUp) {
                  runState.log('INFO', `[Composer Guard] ✅ Khung soạn thảo bình luận đã mở sẵn sàng.`);
                  open = true;
                  break;
                }

                runState.log('WARN', `[Composer Guard] Chưa mở được khung soạn thảo (Lần ${cAttempt}), đang bấm lại ô Trả lời...`);
                const replyEl = dump.elements.find(e => 
                  (e.resourceId || '').includes('feed_post_ufi_reply_button') ||
                  (e.resourceId || '').includes('permalink_inline_composer') ||
                  (e.contentDesc || '').startsWith('Trả lời') ||
                  (e.contentDesc || '').startsWith('Reply')
                );
                if (replyEl && replyEl.bounds) {
                  await this.adb.tap(serial, replyEl.bounds.centerX, replyEl.bounds.centerY);
                } else {
                  await this.adb.tap(serial, profile.reply.x, profile.reply.y);
                }
                await new Promise(r => setTimeout(r, 2000));
              }

              if (!open) {
                runState.log('ERROR', `[Composer Guard] ❌ Không thể mở khung soạn thảo bình luận!`);
                variables['__flow_failed'] = true;
                variables['__flow_fail_reason'] = 'Không mở được khung soạn thảo bình luận';
                variables['CommentSuccess'] = false;
                isSuccess = false;
              } else {
                isSuccess = true;
              }
              break;
            }

            case 'VerifyCommentPosted': {
              runState.log('INFO', `[Post Verification] Đang xác thực kết quả đăng bình luận lên Threads [${serial}]...`);
              const profile = getDeviceProfile(serial);
              let posted = false;
              let blocked = false;
              let blockReason = '';

              for (let v = 1; v <= 6; v++) {
                await new Promise(r => setTimeout(r, 1500));
                const dump = await this.adb.dumpHierarchy(serial);
                const elements = dump.elements || [];

                // 1. Kiểm tra thông báo Meta Block hoặc lỗi gửi
                const errorDialog = elements.find(e => {
                  const t = (e.text || '').toLowerCase();
                  const c = (e.contentDesc || '').toLowerCase();
                  return t.includes('hành động bị chặn') ||
                         t.includes('bạn tạm thời bị chặn') ||
                         t.includes('thử lại sau') ||
                         t.includes('action blocked') ||
                         t.includes('try again later') ||
                         t.includes('có lỗi xảy ra') ||
                         t.includes('không thể chia sẻ') ||
                         t.includes('couldn\'t post') ||
                         c.includes('hành động bị chặn') ||
                         c.includes('action blocked');
                });

                if (errorDialog) {
                  blocked = true;
                  blockReason = errorDialog.text || errorDialog.contentDesc || 'Meta Action Blocked';
                  runState.log('ERROR', `[Post Verification] 🚫 PHÁT HIỆN THÔNG BÁO LỖI/CHẶN CỦA META: "${blockReason}"`);
                  break;
                }

                // 2. Kiểm tra xem composer đã đóng chưa
                const stillInComposer = elements.some(e => 
                  (e.resourceId || '').includes('new_thread_screen_composer') ||
                  (e.resourceId || '').includes('new_thread_screen_post_button') ||
                  (e.resourceId || '').includes('permalink_inline_composer_post_button')
                );

                if (!stillInComposer) {
                  posted = true;
                  runState.log('INFO', `[Post Verification] 🎉 Khung soạn thảo đã đóng thành công! Bình luận đã được gửi.`);
                  break;
                } else if (v === 3) {
                  // Thử bấm lại nút Đăng lần 2 nếu sau 4.5s vẫn chưa gửi
                  runState.log('WARN', `[Post Verification] Trình soạn thảo vẫn còn mở sau 4.5s, bấm lại nút Đăng lần 2...`);
                  const postBtn = elements.find(e => 
                    (e.resourceId || '').includes('new_thread_screen_post_button') ||
                    (e.resourceId || '').includes('permalink_inline_composer_post_button') ||
                    ((e.text === 'Đăng' || e.contentDesc === 'Đăng' || e.text === 'Post' || e.contentDesc === 'Post') && !e.contentDesc?.includes('lại'))
                  );
                  if (postBtn && postBtn.bounds) {
                    await this.adb.tap(serial, postBtn.bounds.centerX, postBtn.bounds.centerY);
                  } else {
                    await this.adb.tap(serial, profile.post.x, profile.post.y);
                  }
                }
              }

              if (blocked) {
                // Đóng hộp thoại thông báo lỗi
                await this.adb.keyevent(serial, 4);
                await new Promise(r => setTimeout(r, 800));
                // Hủy bản nháp bị kẹt
                await this.adb.keyevent(serial, 4);
                await new Promise(r => setTimeout(r, 800));
                await this.dismissPopups(serial, runState);

                variables['CommentSuccess'] = false;
                variables['__flow_failed'] = true;
                variables['__flow_fail_reason'] = `Tài khoản bị giới hạn hoặc Meta chặn: ${blockReason}`;
                isSuccess = false;
              } else if (!posted) {
                runState.log('ERROR', `[Post Verification] ❌ Hết thời gian chờ: Trình soạn thảo không đóng lại được (nút Đăng bị mờ hoặc rớt mạng)!`);
                // Hủy bản nháp bị kẹt để không ảnh hưởng phiên sau
                await this.adb.keyevent(serial, 4);
                await new Promise(r => setTimeout(r, 800));
                await this.dismissPopups(serial, runState);

                variables['CommentSuccess'] = false;
                variables['__flow_failed'] = true;
                variables['__flow_fail_reason'] = 'Trình soạn thảo không gửi được bình luận (bị mờ hoặc mạng treo)';
                isSuccess = false;
              } else {
                variables['CommentSuccess'] = true;
                variables['__flow_failed'] = false;
                variables['__flow_fail_reason'] = '';
                isSuccess = true;
              }
              break;
            }

            case 'VerifyPostPosted':
            case 'VerifyPostPublished': {
              runState.log('INFO', `[Post Verification] Đang xác thực kết quả đăng bài viết lên Threads [${serial}]...`);
              const profile = getDeviceProfile(serial);
              let posted = false;
              let blocked = false;
              let blockReason = '';

              for (let v = 1; v <= 6; v++) {
                await new Promise(r => setTimeout(r, 1500));
                const dump = await this.adb.dumpHierarchy(serial);
                const elements = dump.elements || [];

                // 1. Kiểm tra thông báo Meta Block hoặc lỗi gửi
                const errorDialog = elements.find(e => {
                  const t = (e.text || '').toLowerCase();
                  const c = (e.contentDesc || '').toLowerCase();
                  return t.includes('hành động bị chặn') ||
                         t.includes('bạn tạm thời bị chặn') ||
                         t.includes('thử lại sau') ||
                         t.includes('action blocked') ||
                         t.includes('try again later') ||
                         t.includes('có lỗi xảy ra') ||
                         t.includes('không thể chia sẻ') ||
                         t.includes('couldn\'t post') ||
                         c.includes('hành động bị chặn') ||
                         c.includes('action blocked');
                });

                if (errorDialog) {
                  blocked = true;
                  blockReason = errorDialog.text || errorDialog.contentDesc || 'Meta Action Blocked';
                  runState.log('ERROR', `[Post Verification] 🚫 PHÁT HIỆN THÔNG BÁO LỖI/CHẶN CỦA META: "${blockReason}"`);
                  break;
                }

                // 2. Kiểm tra thông báo "Đã đăng" / "Posted"
                const postToast = elements.find(e => {
                  const t = (e.text || '').toLowerCase();
                  return t.includes('đã đăng') || t.includes('posted') || t.includes('đang đăng') || t.includes('posting');
                });
                if (postToast) {
                  posted = true;
                  runState.log('INFO', `[Post Verification] 🎉 Phát hiện thông báo: "${postToast.text}"! Bài viết đã được gửi.`);
                  break;
                }

                // 3. Kiểm tra xem composer đã đóng chưa
                const stillInComposer = elements.some(e => 
                  e.text === 'Thread mới' || 
                  e.text === 'New thread' || 
                  (e.resourceId || '').includes('new_thread_screen_composer') ||
                  (e.resourceId || '').includes('new_thread_screen_post_button')
                );

                if (!stillInComposer) {
                  posted = true;
                  runState.log('INFO', `[Post Verification] 🎉 Khung soạn thảo bài viết đã đóng! Bài viết đã được đăng thành công.`);
                  break;
                } else if (v === 3) {
                  // Thử bấm lại nút Đăng lần 2 nếu sau 4.5s vẫn chưa gửi
                  runState.log('WARN', `[Post Verification] Trình soạn thảo bài viết vẫn còn mở sau 4.5s, bấm lại nút Đăng lần 2...`);
                  const postBtn = elements.find(e => 
                    (e.resourceId || '').includes('new_thread_screen_post_button') ||
                    ((e.text === 'Đăng' || e.contentDesc === 'Đăng' || e.text === 'Post' || e.contentDesc === 'Post') && !e.contentDesc?.includes('lại'))
                  );
                  if (postBtn && postBtn.bounds) {
                    await this.adb.tap(serial, postBtn.bounds.centerX, postBtn.bounds.centerY);
                  } else {
                    await this.adb.tap(serial, profile.post.x, profile.post.y);
                  }
                }
              }

              if (blocked) {
                await this.adb.keyevent(serial, 4);
                await new Promise(r => setTimeout(r, 800));
                await this.dismissPopups(serial, runState);

                variables['PostSuccess'] = false;
                variables['__flow_failed'] = true;
                variables['__flow_fail_reason'] = `Tài khoản bị Meta chặn tính năng đăng bài: ${blockReason}`;
                isSuccess = false;
              } else if (!posted) {
                variables['PostSuccess'] = false;
                variables['__flow_failed'] = true;
                variables['__flow_fail_reason'] = 'Không thể bấm đăng bài viết hoặc bị kẹt giao diện';
                isSuccess = false;
              } else {
                variables['PostSuccess'] = true;
                variables['__flow_failed'] = false;
                variables['__flow_fail_reason'] = '';
                isSuccess = true;
              }
              break;
            }

            case 'SelectKeyword':
            case 'SelectSearchKeyword': {
              const chosen = getSmartKeyword(serial, options);
              variables['SearchKeyword'] = chosen.keyword;
              variables['KeywordCategory'] = chosen.category;
              variables['KeywordCategoryLabel'] = chosen.categoryLabel;
              runState.log('INFO', `[Keyword Selector] Thiết bị [${serial}] đã chọn từ khóa: "${chosen.keyword}" [Chủ đề: ${chosen.categoryLabel}]`);
              isSuccess = true;
              break;
            }

            case 'AiGenerateComment': {
              variables['CommentSuccess'] = false;
              const postContent = variables['PostContent'] || interpolate(options.postContent || '');
              const targetSituation = variables['PostSituation'] || null;
              const persona = DEVICE_PERSONAS[serial] || { name: 'Người học trải nghiệm' };
              const sitTag = targetSituation ? `[Tình huống: ${targetSituation}] ` : '';
              runState.log('INFO', `[AI Generator] Đang biên soạn bình luận Value-First ${sitTag}theo góc nhìn persona [${persona.name}] cho [${serial}]...`);

              try {
                const comment = await generateThreadsComment(postContent, serial, targetSituation);
                variables['AiComment'] = comment;
                variables['CommentText'] = comment;
                runState.log('INFO', `[AI Generator] Bình luận biên soạn thành công:\n"${comment}"`);
                isSuccess = true;
              } catch (aiErr) {
                runState.log('ERROR', `[AI Generator] Lỗi tạo bình luận: ${aiErr.message}`);
                isSuccess = false;
              }
              break;
            }

            case 'AiGeneratePost':
            case 'AiGenerateThreadsPost': {
              variables['PostSuccess'] = false;
              const customTopic = interpolate(options.topic || options.customTopic || '');
              const persona = DEVICE_PERSONAS[serial] || { name: 'Người học trải nghiệm' };
              runState.log('INFO', `[AI Post Generator] Đang biên soạn bài viết Threads cho thiết bị [${serial}] (${persona.name})...`);

              try {
                const post = await generateThreadsPost(serial, customTopic);
                variables['AiPostText'] = post;
                variables['PostText'] = post;
                variables['CommentText'] = post;
                runState.log('INFO', `[AI Post Generator] Bài viết được biên soạn thành công (${post.length} ký tự):\n"""\n${post}\n"""`);
                isSuccess = true;
              } catch (postErr) {
                runState.log('ERROR', `[AI Post Generator] Lỗi soạn bài viết: ${postErr.message}`);
                isSuccess = false;
              }
              break;
            }

            case 'PrepareMemeImage':
            case 'PreparePostImage': {
              const customTopic = interpolate(options.topic || options.customTopic || variables['CustomTopic'] || '');
              const persona = DEVICE_PERSONAS[serial] || { name: 'Người học trải nghiệm' };
              runState.log('INFO', `[Meme Generator] Đang chọn ảnh Meme Gen Z phù hợp (${persona.name}) và đồng bộ vào thư viện điện thoại [${serial}]...`);

              try {
                const result = await prepareAndPushMeme(serial, customTopic);
                variables['AttachedImageLocal'] = result.localPath;
                variables['AttachedImageRemote'] = result.remotePath;
                variables['HasAttachedImage'] = true;
                variables['MemeTemplate'] = result.template;
                runState.log('INFO', `[Meme Generator] 🎉 Đã nạp ảnh Meme "${result.template}" (${(result.bytes / 1024).toFixed(1)} KB, chuẩn nét không text) vào thư viện máy [${serial}] thành công!`);
                isSuccess = true;
              } catch (memeErr) {
                runState.log('WARN', `[Meme Generator] Không thể nạp ảnh meme: ${memeErr.message}. Tiếp tục đăng dạng văn bản.`);
                variables['HasAttachedImage'] = false;
                isSuccess = true; // Non-fatal
              }
              break;
            }

            case 'AttachMemeImage':
            case 'AttachImageToPost': {
              if (variables['HasAttachedImage'] === false) {
                runState.log('INFO', `[Attach Image] Bỏ qua đính kèm ảnh vì không có ảnh khả dụng.`);
                isSuccess = true;
                break;
              }

              runState.log('INFO', `[Attach Image] Đang tiến hành chọn và đính kèm ảnh Meme vào bài viết...`);

              try {
                const prof = DEVICE_PROFILES[serial] || { width: 720, height: 1600 };
                
                // Step 1: Kiểm tra xem đã ở trong Gallery chưa, nếu chưa thì bấm nút Thư viện
                let composerDump = await adbManager.dumpHierarchy(serial);
                let inGallery = (composerDump.elements || []).some(e => 
                  e.text === 'Gallery' || e.text === 'Thư viện' || e.text === 'Recents' || e.text === 'Mới đây'
                );

                if (!inGallery) {
                  let galleryTapped = false;
                  const galleryBtn = (composerDump.elements || []).find(el => 
                    el.resourceId?.includes('new_thread_screen_gallery_button') ||
                    el.contentDesc?.toLowerCase().includes('thư viện') ||
                    el.contentDesc?.toLowerCase().includes('ảnh') ||
                    el.contentDesc?.toLowerCase().includes('gallery') ||
                    el.contentDesc?.toLowerCase().includes('camera roll') ||
                    el.contentDesc?.toLowerCase().includes('media') ||
                    el.contentDesc?.toLowerCase().includes('photo')
                  );
                  if (galleryBtn && galleryBtn.bounds) {
                    runState.log('INFO', `[Attach Image] Tìm thấy nút Thư viện tại (${galleryBtn.bounds.centerX}, ${galleryBtn.bounds.centerY})`);
                    await adbManager.tap(serial, galleryBtn.bounds.centerX, galleryBtn.bounds.centerY);
                    galleryTapped = true;
                  }

                  if (!galleryTapped) {
                    const fallbackX = Math.round(prof.width * (130 / 720));
                    const fallbackY = Math.round(prof.height * (342 / 1600));
                    runState.log('INFO', `[Attach Image] Bấm nút Thư viện theo tọa độ tỷ lệ: (${fallbackX}, ${fallbackY})`);
                    await adbManager.tap(serial, fallbackX, fallbackY);
                  }
                  await sleep(2500);
                }

                // Step 2: Xử lý cấp quyền hệ thống nếu có popup (Allow / Cho phép)
                for (let pTry = 0; pTry < 2; pTry++) {
                  let permDump = await adbManager.dumpHierarchy(serial);
                  const allowBtn = (permDump.elements || []).find(el => 
                    el.resourceId?.includes('permission_allow_button') ||
                    el.text === 'Cho phép' || el.text === 'Allow' ||
                    el.text === 'Cho phép tất cả' || el.text === 'Allow all'
                  );
                  if (allowBtn && allowBtn.bounds) {
                    runState.log('INFO', `[Attach Image] Phát hiện yêu cầu quyền thư viện, bấm Cho phép tại (${allowBtn.bounds.centerX}, ${allowBtn.bounds.centerY})`);
                    await adbManager.tap(serial, allowBtn.bounds.centerX, allowBtn.bounds.centerY);
                    await sleep(2500);
                    // Sau khi cấp quyền, kiểm tra nếu Threads quay lại composer thì bấm lại nút thư viện
                    const postPermDump = await adbManager.dumpHierarchy(serial);
                    const nowInGallery = (postPermDump.elements || []).some(e => 
                      e.text === 'Gallery' || e.text === 'Thư viện' || e.text === 'Recents' || e.text === 'Mới đây'
                    );
                    if (!nowInGallery) {
                      const gBtn = (postPermDump.elements || []).find(e => e.resourceId?.includes('new_thread_screen_gallery_button'));
                      if (gBtn && gBtn.bounds) {
                        await adbManager.tap(serial, gBtn.bounds.centerX, gBtn.bounds.centerY);
                        await sleep(2500);
                      }
                    }
                  } else {
                    break;
                  }
                }

                // Step 3: Chọn ô ảnh mới nhất trong Thư viện
                let galleryDump = await adbManager.dumpHierarchy(serial);
                const imageCells = (galleryDump.elements || []).filter(el => 
                  el.resourceId?.includes('gallery_picker_grid_item_container') &&
                  el.bounds && el.bounds.width > 50 && el.bounds.height > 50
                );

                let targetCell = null;
                // Ô 0 là nút Camera. Nếu có >= 2 ô, ô 1 chắc chắn là ảnh mới nhất!
                if (imageCells.length >= 2) {
                  targetCell = imageCells[1];
                } else if (imageCells.length === 1) {
                  targetCell = imageCells[0];
                }

                if (targetCell && targetCell.bounds) {
                  runState.log('INFO', `[Attach Image] Chọn ảnh mới nhất tại (${targetCell.bounds.centerX}, ${targetCell.bounds.centerY}) [${targetCell.contentDesc || 'Ô 1'}]`);
                  await adbManager.tap(serial, targetCell.bounds.centerX, targetCell.bounds.centerY);
                } else {
                  // Tọa độ tỷ lệ chuẩn ô 1 (hàng 1 cột 2): 50% width, 23% height
                  const cellX = Math.round(prof.width * 0.5);
                  const cellY = Math.round(prof.height * 0.23);
                  runState.log('INFO', `[Attach Image] Bấm chọn ô ảnh mới nhất theo tọa độ (${cellX}, ${cellY})`);
                  await adbManager.tap(serial, cellX, cellY);
                }

                await sleep(1500);

                // Step 4: Bấm nút Xong / Done với vòng lặp thử lại nếu chưa thoát Thư viện
                let galleryClosed = false;
                for (let doneTry = 0; doneTry < 3; doneTry++) {
                  let curDump = await adbManager.dumpHierarchy(serial);
                  
                  // Nếu vô tình mở popup camera thì từ chối để đóng popup
                  const camDeny = (curDump.elements || []).find(el => el.resourceId?.includes('igds_alert_dialog_secondary_button') || el.text === 'Không cho phép' || el.text === 'Deny');
                  if (camDeny && camDeny.bounds) {
                    await adbManager.tap(serial, camDeny.bounds.centerX, camDeny.bounds.centerY);
                    await sleep(1000);
                    curDump = await adbManager.dumpHierarchy(serial);
                  }

                  const doneBtn = (curDump.elements || []).find(el => 
                    el.text === 'Xong' || el.text === 'Done' || el.contentDesc === 'Xong' || el.contentDesc === 'Done'
                  );
                  if (doneBtn && doneBtn.bounds) {
                    runState.log('INFO', `[Attach Image] Bấm nút "${doneBtn.text || doneBtn.contentDesc}" tại (${doneBtn.bounds.centerX}, ${doneBtn.bounds.centerY}) [Lần ${doneTry + 1}]`);
                    await adbManager.tap(serial, doneBtn.bounds.centerX, doneBtn.bounds.centerY);
                  } else {
                    const doneX = Math.round(prof.width * 0.89);
                    const doneY = Math.round(prof.height * 0.068);
                    runState.log('INFO', `[Attach Image] Bấm nút Xong/Done theo tọa độ (${doneX}, ${doneY}) [Lần ${doneTry + 1}]`);
                    await adbManager.tap(serial, doneX, doneY);
                  }

                  await sleep(2500);

                  // Kiểm tra xem đã thoát màn hình Thư viện chưa
                  let checkDump = await adbManager.dumpHierarchy(serial);
                  const stillInGallery = (checkDump.elements || []).some(e => 
                    e.text === 'Gallery' || e.text === 'Thư viện' || e.text === 'Recents' || e.text === 'Mới đây'
                  );
                  if (!stillInGallery) {
                    galleryClosed = true;
                    break;
                  }
                }

                // Step 5: Xử lý màn hình tìm kiếm "Nhạc" nếu Threads hiển thị giao diện chọn bài hát
                let postDoneDump = await adbManager.dumpHierarchy(serial);
                const isMusicSearchScreen = (postDoneDump.elements || []).some(el => 
                  (el.resourceId || '').includes('music_search') ||
                  el.text === 'Tìm kiếm nhạc' || el.text === 'Search music' ||
                  el.contentDesc === 'Tìm kiếm nhạc' || el.contentDesc === 'Search music'
                );
                if (isMusicSearchScreen) {
                  runState.log('INFO', `[Attach Image] Phát hiện màn hình tìm kiếm nhạc, bỏ qua...`);
                  const backBtn = (postDoneDump.elements || []).find(el => el.resourceId?.includes('navigation_bar_back_button') || el.contentDesc === 'Hủy' || el.contentDesc === 'Cancel');
                  if (backBtn && backBtn.bounds) {
                    await adbManager.tap(serial, backBtn.bounds.centerX, backBtn.bounds.centerY);
                  } else {
                    await adbManager.keyevent(serial, 4);
                  }
                  await sleep(1500);
                }

                // Step 6: Xác thực ảnh đã gắn và đảm bảo thoát khỏi Thư viện về Khung soạn thảo
                let verifyDump = await adbManager.dumpHierarchy(serial);
                const hasAttachment = (verifyDump.elements || []).some(el => 
                  el.contentDesc?.includes('Gỡ file đính kèm') || 
                  el.contentDesc?.includes('Remove attachment') ||
                  el.contentDesc?.includes('Turn on audio') ||
                  el.resourceId?.includes('media_container') ||
                  el.resourceId?.includes('composer_media')
                );

                const stillInGallery = (verifyDump.elements || []).some(e => 
                  e.text === 'Gallery' || e.text === 'Thư viện' || e.text === 'Recents' || e.text === 'Mới đây'
                );

                if (stillInGallery) {
                  runState.log('WARN', `[Attach Image] Vẫn còn kẹt ở Thư viện ảnh sau khi bấm Xong, đang bấm Back để về khung soạn thảo...`);
                  await adbManager.keyevent(serial, 4);
                  await sleep(1500);
                }

                if (hasAttachment) {
                  runState.log('INFO', `[Attach Image] 🎉 Xác thực thành công: Ảnh Meme đã được đính kèm vào bài viết!`);
                  variables['ImageAttachedSuccess'] = true;
                } else {
                  runState.log('WARN', `[Attach Image] Không phát hiện thẻ gỡ đính kèm. Tiến trình tiếp tục với văn bản.`);
                }

                isSuccess = true;
              } catch (attachErr) {
                runState.log('WARN', `[Attach Image] Lỗi khi đính kèm ảnh: ${attachErr.message}. Tiếp tục tiến trình.`);
                isSuccess = true;
              }
              break;
            }

            case 'ThreadsFeedInteract':
            case 'RandomInteractFeed': {
              const likeRate = parseFloat(options.likeRate !== undefined ? options.likeRate : '0.35');
              const detailRate = parseFloat(options.detailRate !== undefined ? options.detailRate : '0.15');
              const rand = Math.random();

              runState.log('INFO', `[Human Interaction] Quyết định hành vi (Xác suất ngẫu nhiên: ${(rand * 100).toFixed(0)}% | Like <= ${(likeRate * 100).toFixed(0)}%, Cmt <= ${((likeRate + detailRate) * 100).toFixed(0)}%)...`);

              if (rand < likeRate) {
                // Thả tim bài viết ngẫu nhiên
                try {
                  const dump = await this.adb.dumpHierarchy(serial);
                  const likeBtns = dump.elements.filter(el => {
                    const isLikeId = el.resourceId && el.resourceId.includes('feed_post_ufi_like_button');
                    const desc = (el.contentDesc || '').toLowerCase();
                    const isLikeDesc = desc.startsWith('thích') || desc.startsWith('like');
                    const isAlreadyLiked = (el.resourceId && el.resourceId.includes('unlike')) || 
                                           desc.includes('bỏ thích') || desc.includes('đã thích') || desc.includes('unlike');
                    const isVisible = el.bounds && el.bounds.centerY >= 280 && el.bounds.centerY <= 1350;
                    return (isLikeId || isLikeDesc) && !isAlreadyLiked && isVisible;
                  });

                  if (likeBtns.length > 0) {
                    const targetBtn = likeBtns[Math.floor(Math.random() * likeBtns.length)];
                    runState.log('INFO', `[Human Interaction] ❤️ Thả tim bài viết tại (${targetBtn.bounds.centerX}, ${targetBtn.bounds.centerY}) [${targetBtn.contentDesc || 'Like'}]`);
                    await this.adb.tap(serial, targetBtn.bounds.centerX, targetBtn.bounds.centerY);
                    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
                  } else {
                    runState.log('INFO', `[Human Interaction] Không thấy nút Like chưa thả tim trên màn hình hiện tại.`);
                  }
                } catch (likeErr) {
                  runState.log('WARN', `[Human Interaction] Lỗi thả tim: ${likeErr.message}`);
                }
              } else if (rand < likeRate + detailRate) {
                // Bấm vào xem chi tiết bài viết và bình luận
                runState.log('INFO', `[Human Interaction] 📖 Mở xem chi tiết bài viết và bình luận cộng đồng...`);
                try {
                  const dump = await this.adb.dumpHierarchy(serial);
                  const postTexts = dump.elements.filter(el => {
                    const isText = (el.text && el.text.length > 20) || (el.resourceId && el.resourceId.includes('feed_post_text'));
                    const isVisible = el.bounds && el.bounds.centerY >= 300 && el.bounds.centerY <= 950;
                    return isText && isVisible;
                  });

                  if (postTexts.length > 0) {
                    const targetPost = postTexts[0];
                    const tapX = targetPost.bounds ? targetPost.bounds.centerX : 360;
                    const tapY = targetPost.bounds ? targetPost.bounds.centerY : 550;

                    await this.adb.tap(serial, tapX, tapY);

                    // Đọc trong chi tiết 3 - 6 giây
                    const readTime = Math.floor(3000 + Math.random() * 3000);
                    runState.log('INFO', `[Human Interaction] Đang đọc chi tiết bài viết & bình luận (${(readTime / 1000).toFixed(1)}s)...`);
                    await new Promise(r => setTimeout(r, readTime));

                    // 50% xác suất cuộn nhẹ đọc thêm bình luận
                    if (Math.random() > 0.5) {
                      runState.log('INFO', `[Human Interaction] Cuộn nhẹ xem thêm các bình luận bên dưới...`);
                      await this.adb.swipe(serial, 420, 950, 420, 600, 600);
                      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));
                    }

                    // Bấm Back quay lại Newfeed
                    runState.log('INFO', `[Human Interaction] Bấm Back quay lại Newfeed.`);
                    await this.adb.keyevent(serial, 4);
                    await new Promise(r => setTimeout(r, 1200));
                  } else {
                    runState.log('INFO', `[Human Interaction] Không thấy bài viết để mở chi tiết, tiếp tục lướt.`);
                  }
                } catch (detailErr) {
                  runState.log('WARN', `[Human Interaction] Lỗi xem chi tiết bài: ${detailErr.message}`);
                }
              } else {
                runState.log('INFO', `[Human Interaction] ☕ Lướt đọc nội dung tự nhiên (Dwell time), bỏ qua tương tác.`);
              }
              isSuccess = true;
              break;
            }

            case 'FbReelsInteract':
            case 'FacebookReelsInteract': {
              const likeRate = parseFloat(options.likeRate !== undefined ? options.likeRate : '0.30');
              const rand = Math.random();

              if (rand < likeRate) {
                runState.log('INFO', `[Facebook Reels] ❤️ Thả tim video ngắn Reels (Xác suất ${(rand * 100).toFixed(0)}% <= ${(likeRate * 100).toFixed(0)}%)...`);
                let liked = false;
                const selector = options.selector || '//*[@content-desc="Thích" or @content-desc="Like"]';
                try {
                  const dump = await this.adb.dumpHierarchy(serial);
                  const el = this.findElement(dump.elements, selector);
                  if (el && el.bounds && (el.bounds.width > 0 || el.bounds.height > 0)) {
                    await this.adb.tap(serial, el.bounds.centerX, el.bounds.centerY);
                    liked = true;
                  }
                } catch (elErr) {}

                if (!liked) {
                  const touchX = options.touchX !== undefined ? parseFloat(options.touchX) : 660;
                  const touchY = options.touchY !== undefined ? parseFloat(options.touchY) : 920;
                  await this.adb.tap(serial, touchX, touchY);
                }
                await new Promise(r => setTimeout(r, 1000 + Math.random() * 800));
              } else {
                runState.log('INFO', `[Facebook Reels] ☕ Xem video tự nhiên, không thả tim clip này (${(rand * 100).toFixed(0)}% > ${(likeRate * 100).toFixed(0)}%).`);
              }
              isSuccess = true;
              break;
            }

            case 'FbFeedInteract':
            case 'FacebookFeedInteract': {
              const likeRate = parseFloat(options.likeRate !== undefined ? options.likeRate : '0.25');
              const rand = Math.random();

              if (rand < likeRate) {
                runState.log('INFO', `[Facebook Feed] 👍 Thả cảm xúc bài viết News Feed (Xác suất ${(rand * 100).toFixed(0)}% <= ${(likeRate * 100).toFixed(0)}%)...`);
                let liked = false;
                const selector = options.selector || '//*[contains(@content-desc,"bày tỏ cảm xúc") or contains(@content-desc,"Thích")]';
                try {
                  const dump = await this.adb.dumpHierarchy(serial);
                  const el = this.findElement(dump.elements, selector);
                  if (el && el.bounds && el.bounds.centerY >= 200 && el.bounds.centerY <= 1200) {
                    await this.adb.tap(serial, el.bounds.centerX, el.bounds.centerY);
                    liked = true;
                  }
                } catch (elErr) {}

                if (!liked) {
                  const touchX = options.touchX !== undefined ? parseFloat(options.touchX) : 135;
                  const touchY = options.touchY !== undefined ? parseFloat(options.touchY) : 650;
                  await this.adb.tap(serial, touchX, touchY);
                }
                await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
              } else {
                runState.log('INFO', `[Facebook Feed] 📖 Lướt đọc bài viết tự nhiên, không like (${(rand * 100).toFixed(0)}% > ${(likeRate * 100).toFixed(0)}%).`);
              }
              isSuccess = true;
              break;
            }

            case 'TikTokFeedInteract': {
              const profile = getDeviceProfile(serial);
              const likeRate = parseFloat(options.likeRate !== undefined ? options.likeRate : '0.40');
              const commentRate = parseFloat(options.commentRate !== undefined ? options.commentRate : '0.20');
              const rand = Math.random();

              const defaultComments = [
                'Video cuốn quá ạ 🥰',
                'Quá đỉnh luôn bác ơi =)))',
                'Hay quá, lưu lại liền nè',
                'Xem đi xem lại vẫn thấy đúng 👍',
                '10 điểm không có nhưng 👏',
                'U là trời đúng tâm trạng ghê 😂',
                'Chia sẻ thêm nhiều video hữu ích nữa nha shop!',
                'Chuẩn bài luôn rồi bác ơii'
              ];

              // 1. KIỂM TRA MÀN HÌNH: LIVE, POPUP YÊU CẦU LÀM KHÁCH, QUẢNG CÁO, SẢN PHẨM, VOUCHER
              runState.log('INFO', `[TikTok Guard] Quét giao diện trên [${serial}] để phát hiện Live, Sản phẩm, Voucher hoặc Quảng cáo...`);
              const screenStatus = await this.handleTikTokEdgeCases(serial, runState);

              // 1.1. BẢO VỆ TUYỆT ĐỐI KHÔNG BẤM NÚT KHÁCH TRÊN LIVE / THOÁT PHÒNG LIVE:
              if (screenStatus.isLive) {
                runState.log('WARN', `[Anti-Live Guard] 🛡️ PHÁT HIỆN ĐANG Ở PHÒNG LIVESTREAM (LIVE)! Bỏ qua like/comment và khu vực nút Khách để bảo vệ nick. Đang vuốt lướt qua video tiếp theo...`);
                // Nghỉ nhẹ 2-3s giả lập người dùng lướt qua
                await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
                // Tự động vuốt chuyển sang video tiếp theo
                await this.adb.swipe(serial, Math.round(profile.width / 2), Math.round(profile.height * 0.78), Math.round(profile.width / 2), Math.round(profile.height * 0.20), 400);
                await new Promise(r => setTimeout(r, 1500));
                isSuccess = true;
                break;
              }

              // 1.2. BẢO VỆ TRƯỚC SẢN PHẨM TIKTOK SHOP (GIỎ HÀNG VÀNG):
              if (screenStatus.isProduct) {
                runState.log('WARN', `[Anti-Product Guard] 🛒 PHÁT HIỆN VÀ VỪA ĐÓNG BẢNG CHI TIẾT SẢN PHẨM! Bỏ qua tương tác clip này, lướt tiếp...`);
                await new Promise(r => setTimeout(r, 1500));
                await this.adb.swipe(serial, Math.round(profile.width / 2), Math.round(profile.height * 0.78), Math.round(profile.width / 2), Math.round(profile.height * 0.20), 400);
                await new Promise(r => setTimeout(r, 1500));
                isSuccess = true;
                break;
              }

              // 1.3. BẢO VỆ TRƯỚC QUẢNG CÁO:
              if (screenStatus.isAd) {
                runState.log('INFO', `[TikTok Ad Guard] 📢 Phát hiện video Quảng cáo (Sponsored), bỏ qua tương tác.`);
                await new Promise(r => setTimeout(r, 2500 + Math.random() * 1000));
                isSuccess = true;
                break;
              }

              // 2. VIDEO THƯỜNG: TÍNH TOÁN HÀNH VI TƯƠNG TÁC
              runState.log('INFO', `[TikTok Interaction] Quyết định hành vi (Xác suất ngẫu nhiên: ${(rand * 100).toFixed(0)}% | Like <= ${(likeRate * 100).toFixed(0)}%, Cmt <= ${((likeRate + commentRate) * 100).toFixed(0)}%)...`);

              // Tọa độ Double-Tap Like an toàn: 38% chiều cao màn hình (NẰM CAO HƠN HẲN VÙNG GIỎ HÀNG VÀNG SẢN PHẨM Ở ĐÁY)
              const centerX = Math.round(profile.width / 2);
              const centerY = Math.round(profile.height * 0.38);

              if (rand < likeRate) {
                // Thả tim video: Double-tap vào giữa màn hình an toàn (chuẩn thuật toán và vị trí hiển thị của TikTok)
                runState.log('INFO', `[TikTok Interaction] ❤️ Double-tap thả tim video tại vùng an toàn (${centerX}, ${centerY}) [Tránh giỏ hàng]...`);
                await this.adb.tap(serial, centerX, centerY);
                await new Promise(r => setTimeout(r, 120));
                await this.adb.tap(serial, centerX, centerY);
                await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
              } else if (rand < likeRate + commentRate) {
                // Bình luận video
                runState.log('INFO', `[TikTok Interaction] 💬 Mở khung bình luận TikTok...`);
                try {
                  // Bấm icon Comment (thanh bên phải: x: 91%, y: 62% chiều cao màn hình - cách xa hoàn toàn giỏ hàng vàng ở bên trái)
                  const cmtIconX = Math.round(profile.width * 0.91);
                  const cmtIconY = Math.round(profile.height * 0.62);
                  await this.adb.tap(serial, cmtIconX, cmtIconY);
                  await new Promise(r => setTimeout(r, 2000));

                  // Focus vào ô nhập (Add comment bar ở đáy: x: 42%, y: 94%)
                  const inputX = Math.round(profile.width * 0.42);
                  const inputY = Math.round(profile.height * 0.94);
                  runState.log('INFO', `[TikTok Interaction] Focus ô nhập bình luận tại (${inputX}, ${inputY})...`);
                  await this.adb.tap(serial, inputX, inputY);
                  await new Promise(r => setTimeout(r, 1200));

                  // Chọn nội dung bình luận
                  let commentText = options.commentText || variables['AiComment'] || variables['CommentText'];
                  if (!commentText) {
                    const commentsPool = options.commentsPool ? options.commentsPool.split('|') : defaultComments;
                    commentText = commentsPool[Math.floor(Math.random() * commentsPool.length)].trim();
                  }

                  runState.log('INFO', `[TikTok Interaction] Gõ bình luận: "${commentText}"`);
                  await this.adb.typeText(serial, commentText);
                  await new Promise(r => setTimeout(r, 1200));

                  // Bấm nút gửi bình luận (Post icon ở góc dưới phải: x: 92%, y: 94%)
                  const sendX = Math.round(profile.width * 0.92);
                  const sendY = Math.round(profile.height * 0.94);
                  runState.log('INFO', `[TikTok Interaction] Bấm nút gửi bình luận tại (${sendX}, ${sendY})...`);
                  await this.adb.tap(serial, sendX, sendY);
                  await new Promise(r => setTimeout(r, 1500));

                  // Đóng khung bình luận (Bấm Back)
                  runState.log('INFO', `[TikTok Interaction] Bấm Back đóng khung bình luận.`);
                  await this.adb.keyevent(serial, 4);
                  await new Promise(r => setTimeout(r, 800));

                  // Hạ bàn phím nếu còn kẹt
                  const keyboardUp = await this.adb.isKeyboardShown(serial);
                  if (keyboardUp) {
                    await this.adb.keyevent(serial, 4);
                    await new Promise(r => setTimeout(r, 600));
                  }

                  // Quét dọn ngay nếu có popup voucher mua hàng bung lên sau khi comment
                  await this.handleTikTokEdgeCases(serial, runState);
                } catch (cmtErr) {
                  runState.log('WARN', `[TikTok Interaction] Lỗi tương tác bình luận: ${cmtErr.message}`);
                  await this.adb.keyevent(serial, 4);
                }
              } else {
                runState.log('INFO', `[TikTok Interaction] ☕ Xem video tự nhiên (Dwell time), không tương tác clip này.`);
              }
              isSuccess = true;
              break;
            }

            case 'TypeText': {
              const rawText = options.text || '';
              let text = interpolate(rawText);
              
              // Tự động nhận diện nếu người dùng gõ bất kỳ biến thể nào của AiPostText, hoặc chỉ gõ ký tự $, ${}, hoặc node có nhãn bài viết/đăng bài
              const isSymbolOnly = /^[\s\$\{\}]*$/.test(rawText) || /^[\s\$\{\}]*$/.test(text);
              const isPostContext = /bài\s*viết|đăng\s*bài|soạn\s*bài|post/i.test(label || '');
              const isAiPostVar = isSymbolOnly || 
                                  isPostContext ||
                                  /^[\s\$\{\}]*ai[\s_-]*pos+t*[\s_-]*t?ext[\s\$\{\}]*$/i.test(rawText) || 
                                  /^[\s\$\{\}]*ai[\s_-]*pos+t*[\s_-]*t?ext[\s\$\{\}]*$/i.test(text);

              if (isAiPostVar) {
                if (!variables['AiPostText']) {
                  runState.log('WARN', `[TypeText Auto-Generate] Chưa có AiPostText, đang tự động gọi AI tạo bài viết tức thì cho thiết bị [${serial}]...`);
                  try {
                    variables['AiPostText'] = await generateThreadsPost(serial);
                    variables['PostText'] = variables['AiPostText'];
                  } catch (genErr) {
                    runState.log('ERROR', `[TypeText Auto-Generate] Lỗi tạo bài viết: ${genErr.message}`);
                  }
                }
                if (variables['AiPostText']) {
                  text = variables['AiPostText'];
                  runState.log('INFO', `[TypeText Smart-Replace] Đã gán nội dung bài viết AI (${text.length} ký tự)`);
                }
              }

              // Tương tự cho AiComment
              const isAiCommentVar = /^[\s\$\{\}]*ai[\s_-]*com+en*t[\s\$\{\}]*$/i.test(rawText) || 
                                     /^[\s\$\{\}]*ai[\s_-]*com+en*t[\s\$\{\}]*$/i.test(text);
              if (isAiCommentVar) {
                if (!variables['AiComment']) {
                  runState.log('WARN', `[TypeText Auto-Generate] Chưa có AiComment, tự động tạo bình luận cho [${serial}]...`);
                  try {
                    variables['AiComment'] = await generateThreadsComment(variables['PostContent'] || '', serial, variables['PostSituation'] || null);
                  } catch {}
                }
                if (variables['AiComment']) {
                  text = variables['AiComment'];
                  runState.log('INFO', `[TypeText Smart-Replace] Đã gán nội dung bình luận AI (${text.length} ký tự)`);
                }
              }

              // Tự động nhận diện nếu người dùng muốn gõ từ khóa tìm kiếm
              const isSearchContext = /từ\s*khóa|search|keyword|tìm\s*kiếm/i.test(label || '') ||
                                      rawText.includes('${SearchKeyword}') ||
                                      options.useSmartKeyword;
              if (isSearchContext && (!text || text.trim() === '' || /^[\s\$\{\}]*$/.test(text) || text === '${SearchKeyword}')) {
                if (!variables['SearchKeyword']) {
                  const chosen = getSmartKeyword(serial, options);
                  variables['SearchKeyword'] = chosen.keyword;
                  variables['KeywordCategory'] = chosen.category;
                  variables['KeywordCategoryLabel'] = chosen.categoryLabel;
                }
                text = variables['SearchKeyword'];
                runState.log('INFO', `[TypeText Smart-Replace] Đã gán từ khóa tìm kiếm: "${text}"`);
              }

              // Fallback tuyệt đối nếu text rỗng hoặc chỉ còn ký tự biểu tượng $
              if (!text || /^[\s\$\{\}]*$/.test(text)) {
                if (isSearchContext) {
                  const chosen = getSmartKeyword(serial, options);
                  text = chosen.keyword;
                  variables['SearchKeyword'] = text;
                  runState.log('INFO', `[TypeText Auto-Fill] Đã chọn từ khóa tìm kiếm: "${text}"`);
                } else if (variables['AiPostText']) {
                  text = variables['AiPostText'];
                  runState.log('INFO', `[TypeText Auto-Fill] Tự động lấy bài viết AI (${text.length} ký tự)`);
                } else if (variables['AiComment']) {
                  text = variables['AiComment'];
                  runState.log('INFO', `[TypeText Auto-Fill] Tự động lấy bình luận AI (${text.length} ký tự)`);
                } else {
                  text = await generateThreadsPost(serial);
                  variables['AiPostText'] = text;
                  runState.log('INFO', `[TypeText Emergency Fallback] Đã tạo khẩn cấp bài viết AI (${text.length} ký tự)`);
                }
              }

              // Tự động gán từ khóa tìm kiếm thông minh nếu sử dụng biến ${SearchKeyword} mà chưa có
              if ((rawText.includes('${SearchKeyword}') || options.useSmartKeyword) && (!variables['SearchKeyword'] || text === '${SearchKeyword}')) {
                const chosen = getSmartKeyword(serial, options);
                variables['SearchKeyword'] = chosen.keyword;
                variables['KeywordCategory'] = chosen.category;
                variables['KeywordCategoryLabel'] = chosen.categoryLabel;
                text = interpolate(rawText.replace('${SearchKeyword}', chosen.keyword));
                runState.log('INFO', `[Keyword Selector] Tự động chọn từ khóa cho [${serial}]: "${chosen.keyword}" [${chosen.categoryLabel}]`);
              }

              // BẢO VỆ TUYỆT ĐỐI KHI TÌM KIẾM: Không bao giờ gõ từ khóa tìm kiếm vào ô soạn bài Thread mới
              if (isSearchContext) {
                try {
                  const dumpCheck = await this.adb.dumpHierarchy(serial);
                  const isNewThreadComposer = dumpCheck.elements.some(e => 
                    e.text === 'Thread mới' || 
                    (e.contentDesc === 'Có gì mới?' && (e.resourceId || '').includes('new_thread_screen_composer'))
                  );
                  if (isNewThreadComposer) {
                    runState.log('WARN', `[TypeText Search Guard] Phát hiện đang ở màn hình soạn Thread mới thay vì ô Search! Đang hủy bản nháp và chuyển sang ô Search...`);
                    // Discard thread draft
                    await this.adb.keyevent(serial, 4);
                    await new Promise(r => setTimeout(r, 600));
                    const dumpAfterBack = await this.adb.dumpHierarchy(serial);
                    const discardBtn = dumpAfterBack.elements.find(e => 
                      e.text === 'Không lưu' || 
                      (e.resourceId && e.resourceId.includes('igds_alert_dialog_secondary_button'))
                    );
                    if (discardBtn && discardBtn.bounds) {
                      await this.adb.tap(serial, discardBtn.bounds.centerX, discardBtn.bounds.centerY);
                      await new Promise(r => setTimeout(r, 800));
                    }
                    
                    // Mở màn hình Search từ Feed chính
                    const dumpFeed = await this.adb.dumpHierarchy(serial);
                    const searchBtn = dumpFeed.elements.find(e => (e.resourceId || '').includes('main_feed_search_button'));
                    if (searchBtn && searchBtn.bounds) {
                      await this.adb.tap(serial, searchBtn.bounds.centerX, searchBtn.bounds.centerY);
                    } else {
                      await this.adb.tap(serial, 664, 125);
                    }
                    await new Promise(r => setTimeout(r, 1800));

                    // Focus ô nhập search
                    const dumpSearch = await this.adb.dumpHierarchy(serial);
                    const searchInput = dumpSearch.elements.find(e => (e.resourceId || '').includes('BdsSearchBarInput') || (e.resourceId || '').includes('BdsSearchBar'));
                    if (searchInput && searchInput.bounds) {
                      await this.adb.tap(serial, searchInput.bounds.centerX, searchInput.bounds.centerY);
                    } else {
                      await this.adb.tap(serial, 344, 232);
                    }
                    await new Promise(r => setTimeout(r, 800));
                  }
                } catch (guardErr) {
                  runState.log('DEBUG', `Search guard check: ${guardErr.message}`);
                }
              }

              const xpath = options.xpath;

              if (xpath) {
                // Focus element first
                try {
                  const dump = await this.adb.dumpHierarchy(serial);
                  const el = this.findElement(dump.elements, xpath);
                  if (el && el.bounds) {
                    await this.adb.tap(serial, el.bounds.centerX, el.bounds.centerY);
                    await new Promise(r => setTimeout(r, 400));
                  }
                } catch {}
              }

              runState.log('INFO', `Typing text: "${text}"`);
              await this.adb.typeText(serial, text);
              break;
            }

            case 'ElementExists': {
              const xpath = interpolate(options.xpath || options.selector || '');
              const dump = await this.adb.dumpHierarchy(serial);
              const el = this.findElement(dump.elements, xpath);
              if (el) {
                isSuccess = true;
                runState.log('INFO', `Element exists: TRUE (${xpath})`);
              } else {
                isSuccess = false;
                failReason = `Element exists: FALSE (${xpath})`;
                runState.log('INFO', failReason);
              }
              break;
            }

            case 'Adb': {
              const cmd = interpolate(options.command || '');
              if (cmd) {
                runState.log('INFO', `Running ADB shell: ${cmd}`);
                const out = await this.adb.shell(serial, cmd);
                runState.log('DEBUG', `ADB output: ${out}`);
              }
              break;
            }

            case 'PressHome':
              await this.adb.keyevent(serial, 3);
              break;

            case 'PressBack':
              await this.adb.keyevent(serial, 4);
              break;

            case 'Random': {
              const min = parseInt(options.minNumber || '1', 10);
              const max = parseInt(options.maxNumber || '10', 10);
              const val = Math.floor(Math.random() * (max - min + 1)) + min;
              const outVar = options.outputVariable || 'RandomValue';
              variables[outVar] = val;
              runState.log('INFO', `Random generated: ${outVar} = ${val}`);
              break;
            }

            case 'SetVariable':
            case 'UpdateField': {
              const varName = options.variableName || options.fieldName;
              const varVal = interpolate(options.value || '');
              if (varName) {
                variables[varName] = varVal;
                runState.log('INFO', `Set variable: ${varName} = ${varVal}`);
              }
              break;
            }

            case 'Pause': {
              let pauseSec;
              if (options.minTime || options.timePauseMin) {
                const min = parseFloat(options.minTime || options.timePauseMin || '3');
                const max = parseFloat(options.maxTime || options.timePauseMax || '8');
                pauseSec = (Math.random() * (max - min) + min).toFixed(1);
              } else {
                pauseSec = parseFloat(options.timePause || options.sleep || '1');
              }
              runState.log('INFO', `Dừng đọc bài / chờ: ${pauseSec}s...`);
              await new Promise(r => setTimeout(r, parseFloat(pauseSec) * 1000));
              break;
            }

            case 'Stop':
              runState.log('INFO', 'Reached Stop node. Finishing flow.');
              reachedStopNode = true;
              currentNode = null;
              continue;

            default:
              runState.log('DEBUG', `Generic node pass-through: ${action}`);
              break;
          }
        } catch (execErr) {
          isSuccess = false;
          failReason = execErr.message;
          runState.log('ERROR', `Node execution failed: ${failReason}`);
        }

        // Sleep after node if requested
        const sleepSec = parseFloat(options.nodeSleep || '0.5');
        if (sleepSec > 0) {
          await new Promise(r => setTimeout(r, sleepSec * 1000));
        }

        // Branching to next node
        const branchKey = isSuccess ? 'successNode' : 'failNode';
        currentNode = this.findNextNode(node, branchKey, edges, nodeMap);

        if (!currentNode && !isSuccess && options.timeoutNextNode) {
          currentNode = this.findNextNode(node, options.timeoutNextNode, edges, nodeMap);
        }
      }

      const hasFatalFlag = variables['__flow_failed'] === true;
      const isCommentFlow = (nodes || []).some(n => (n.data?.action || n.type) === 'AiGenerateComment');
      const commentFailed = isCommentFlow && variables['CommentSuccess'] === false;
      const isPostFlow = (nodes || []).some(n => (n.data?.action || n.type) === 'AiGeneratePost');
      const postFailed = isPostFlow && variables['PostSuccess'] === false;

      const completed = !runState.aborted && 
                        stepCount < maxSteps && 
                        reachedStopNode && 
                        !hasFatalFlag && 
                        !commentFailed &&
                        !postFailed;

      if (completed) {
        runState.log('INFO', '🎉 Flow execution completed successfully! Tác vụ đã được thực hiện thành công.');
      } else {
        let reason = 'Flow terminated: ';
        if (runState.aborted) reason += 'Người dùng dừng tiến trình.';
        else if (!reachedStopNode) reason += 'Bị dừng giữa chừng do lỗi hoặc không tìm thấy bước tiếp theo.';
        else if (hasFatalFlag) reason += `Lỗi: ${variables['__flow_fail_reason'] || 'Thao tác bị chặn hoặc lỗi ứng dụng'}.`;
        else if (commentFailed) reason += 'Bình luận KHÔNG được đăng lên Threads (bị chặn, dính link ngoài hoặc lỗi giao diện).';
        else if (postFailed) reason += 'Bài viết KHÔNG được đăng lên Threads (bị kẹt màn hình chọn ảnh, bị chặn hoặc lỗi giao diện).';
        runState.log('WARN', reason);
      }
      this.activeRuns.delete(runId);
      return { success: completed, stepCount, variables };
    } catch (fatalErr) {
      runState.log('ERROR', `Fatal flow execution error: ${fatalErr.message}`);
      this.activeRuns.delete(runId);
      return { success: false, error: fatalErr.message };
    }
  }

  // Find next node based on GenFarmer data options or graph edges
  findNextNode(node, branchKey, edges, nodeMap) {
    // 1. Direct pointer in node data (e.g. data.successNode / data.failNode)
    const directTargetId = node.data?.[branchKey];
    if (directTargetId && nodeMap.has(directTargetId)) {
      return nodeMap.get(directTargetId);
    }

    // 2. Look up edge connections
    const outgoing = edges.filter(e => e.source === node.id);
    if (outgoing.length === 1) {
      return nodeMap.get(outgoing[0].target);
    }

    // If multiple edges, try matching handle ID
    const handleMatch = outgoing.find(e => e.sourceHandle === branchKey);
    if (handleMatch) {
      return nodeMap.get(handleMatch.target);
    }

    return outgoing.length > 0 ? nodeMap.get(outgoing[0].target) : null;
  }

  // Precise find element by xpath, resource-id, content-desc, or text (supports pipe '|' for multi-variant fallback)
  findElement(elements = [], selector = '') {
    if (!selector) return null;
    const patterns = selector.split('|').map(s => s.toLowerCase().trim()).filter(Boolean);

    return elements.find(el => {
      const xLite = (el.xpathLite || '').toLowerCase();
      const rId = (el.resourceId || '').toLowerCase();
      const txt = (el.text || '').toLowerCase().trim();
      const desc = (el.contentDesc || '').toLowerCase().trim();

      return patterns.some(pattern => {
        // 1. Resource ID check
        if (rId && rId.includes(pattern)) {
          // If searching for post_button, NEVER match repost_button!
          if (pattern.includes('post_button') && !pattern.includes('repost') && rId.includes('repost_button')) {
            return false;
          }
          return true;
        }

        if (xLite && xLite.includes(pattern)) return true;

        // 2. Strict / semantic match for 'đăng' and 'post'
        if (pattern === 'đăng' || pattern === 'post') {
          // MUST NOT match "đăng lại", "repost", "bài đăng", "đã đăng"
          if (desc.includes('lại') || desc.includes('repost') || txt.includes('lại') || txt.includes('repost')) return false;
          return (txt === 'đăng' || txt === 'post' || desc === 'đăng' || desc === 'post');
        }

        // 3. Like button: don't match 'bỏ thích' / 'unlike'
        if (pattern === 'thích' || pattern === 'like') {
          if (desc.includes('bỏ thích') || desc.includes('unlike') || rId.includes('unlike')) return false;
          return (txt === 'thích' || txt === 'like' || desc.startsWith('thích') || desc.startsWith('like'));
        }

        // 4. Reply button: match 'trả lời' / 'reply'
        if (pattern === 'trả lời' || pattern === 'reply') {
          return (txt === 'trả lời' || txt === 'reply' || desc.startsWith('trả lời') || desc.startsWith('reply') || desc.includes('trả lời') || desc.includes('reply'));
        }

        // 5. Search button
        if (pattern === 'search' || pattern === 'tìm kiếm') {
          return (txt === 'tìm kiếm' || txt === 'search' || desc === 'tìm kiếm' || desc === 'search');
        }

        return (txt && txt.includes(pattern)) || (desc && desc.includes(pattern));
      });
    });
  }

  // Dismiss common popups, draft save prompts, and system dialogs
  async dismissPopups(serial, runState) {
    try {
      const dismissKeywords = [
        'để sau', 'không phải bây giờ', 'lúc khác', 'not now', 'later', 'remind me later',
        'không lưu', 'bỏ bản nháp', 'bỏ', 'discard', 'don\'t save',
        'hủy', 'cancel', 'bỏ qua', 'dismiss',
        'đóng', 'close', 'ok', 'xác nhận', 'got it', 'không cho phép', 'don\'t allow'
      ];

      for (let i = 0; i < 2; i++) {
        const dump = await this.adb.dumpHierarchy(serial);
        const elements = dump.elements || [];
        const btn = elements.find(e => {
          const t = (e.text || '').toLowerCase().trim();
          const c = (e.contentDesc || '').toLowerCase().trim();
          const r = (e.resourceId || '').toLowerCase();
          return dismissKeywords.some(kw => t === kw || c === kw || (kw === 'không lưu' && (t.includes('không lưu') || r.includes('secondary_button'))));
        });

        if (btn && btn.bounds && (btn.bounds.width > 0 || btn.bounds.height > 0)) {
          runState?.log?.('INFO', `[Popup Guard] Đóng popup: "${btn.text || btn.contentDesc || 'Dismiss'}" tại (${btn.bounds.centerX}, ${btn.bounds.centerY})`);
          await this.adb.tap(serial, btn.bounds.centerX, btn.bounds.centerY);
          await new Promise(r => setTimeout(r, 800));
        } else {
          break;
        }
      }
    } catch (err) {
      runState?.log?.('DEBUG', `dismissPopups error: ${err.message}`);
    }
  }

  // Quét và xử lý toàn diện các Edge Cases trên TikTok:
  // 1. Thoát phòng LIVE / Bỏ qua Live preview / Dập popup yêu cầu làm khách
  // 2. Đóng chi tiết sản phẩm TikTok Shop / Giỏ hàng
  // 3. Dập popup Voucher / Phiếu giảm giá / Hộp quà may mắn
  // 4. Dập popup Đồng bộ danh bạ / Xin quyền / Đánh giá
  // 5. Thoát trình duyệt web ngoài (Browser) nếu bấm nhầm quảng cáo
  async handleTikTokEdgeCases(serial, runState) {
    try {
      const profile = getDeviceProfile(serial);

      // 1. KIỂM TRA NHANH QUA DUMPSYS WINDOW FOCUS (< 40ms)
      const focus = await this.adb.getCurrentFocus(serial);

      // 1.1. Phát hiện kẹt trong phòng LIVE (LiveRoomActivity / LivePlayActivity)
      const isInsideLive = focus.includes('LiveRoomActivity') || 
                           focus.includes('LivePlayActivity') || 
                           focus.includes('com.bytedance.android.live') ||
                           focus.includes('com.ss.android.ugc.aweme.live');

      if (isInsideLive) {
        runState?.log?.('WARN', `[Live Guard] 🚨 PHÁT HIỆN ĐANG KẸT TRONG PHÒNG LIVE! Thực hiện thoát phòng Live khẩn cấp...`);
        // Bấm nút X đóng Live (ở góc trên phải)
        await this.adb.tap(serial, Math.round(profile.width * 0.93), Math.round(profile.height * 0.06));
        await new Promise(r => setTimeout(r, 600));
        // Gửi phím Back dự phòng nếu chưa đóng
        await this.adb.keyevent(serial, 4);
        await new Promise(r => setTimeout(r, 800));

        // Kiểm tra popup xác nhận rời khỏi live ("Rời khỏi", "Leave", "Thoát")
        const dumpLeave = await this.adb.dumpHierarchy(serial);
        const leaveBtn = (dumpLeave.elements || []).find(e => {
          const t = (e.text || '').toLowerCase().trim();
          return t === 'rời khỏi' || t === 'leave' || t === 'thoát' || t === 'xác nhận';
        });
        if (leaveBtn && leaveBtn.bounds) {
          await this.adb.tap(serial, leaveBtn.bounds.centerX, leaveBtn.bounds.centerY);
          await new Promise(r => setTimeout(r, 600));
        }

        // Tự động vuốt chuyển video tiếp theo sau khi thoát
        await this.adb.swipe(serial, Math.round(profile.width / 2), Math.round(profile.height * 0.78), Math.round(profile.width / 2), Math.round(profile.height * 0.20), 400);
        await new Promise(r => setTimeout(r, 1200));
        return { isLive: true, escapedLive: true };
      }

      // 1.2. Phát hiện kẹt trong In-App Browser (do click quảng cáo)
      const isInBrowser = focus.includes('BrowserLiteActivity') || 
                          focus.includes('CrossPlatformActivity') ||
                          focus.includes('com.android.chrome') || 
                          focus.includes('CustomTabActivity') ||
                          focus.includes('com.android.vending');

      if (isInBrowser) {
        runState?.log?.('WARN', `[Ad Guard] 🚨 Phát hiện bị nhảy sang link ngoài/quảng cáo! Bấm Back quay lại TikTok...`);
        await this.adb.keyevent(serial, 4);
        await new Promise(r => setTimeout(r, 800));
        return { isAd: true, closedBrowser: true };
      }

      // 2. QUÉT GIAO DIỆN UI HIERARCHY ĐỂ XỬ LÝ SẢN PHẨM, VOUCHER, LIVE PREVIEW, POPUP KHÁCH
      const dump = await this.adb.dumpHierarchy(serial);
      const elements = dump.elements || [];

      // 2.1. ANTI-GUEST REQUEST: Bắt và hủy ngay lập tức nếu xuất hiện popup/nút xin lên Khách trên LIVE
      const guestKeywords = [
        'yêu cầu làm khách', 'yêu cầu tham gia với tư cách khách', 'yêu cầu tham gia',
        'request to be a guest', 'multi-guest', 'bạn có muốn gửi yêu cầu làm khách',
        'tham gia làm khách', 'mời làm khách', 'làm khách', 'guest request'
      ];

      const hasGuestPrompt = elements.some(e => {
        const t = (e.text || '').toLowerCase();
        const c = (e.contentDesc || '').toLowerCase();
        return guestKeywords.some(kw => t.includes(kw) || c.includes(kw));
      });

      if (hasGuestPrompt) {
        runState?.log?.('WARN', `[Anti-Guest Guard] 🚨 PHÁT HIỆN POPUP YÊU CẦU LÀM KHÁCH TRÊN LIVE! Đang bấm "Hủy" hoặc Back ngay lập tức...`);
        const cancelBtn = elements.find(e => {
          const t = (e.text || '').toLowerCase().trim();
          const c = (e.contentDesc || '').toLowerCase().trim();
          return ['hủy', 'cancel', 'đóng', 'close', 'không', 'từ chối'].includes(t) ||
                 ['hủy', 'cancel', 'đóng', 'close', 'không', 'từ chối'].includes(c);
        });

        if (cancelBtn && cancelBtn.bounds && cancelBtn.bounds.width > 0) {
          await this.adb.tap(serial, cancelBtn.bounds.centerX, cancelBtn.bounds.centerY);
        } else {
          await this.adb.keyevent(serial, 4); // Back
        }
        await new Promise(r => setTimeout(r, 800));
        return { isLive: true, handledGuestPopup: true };
      }

      // 2.2. ANTI-PRODUCT DETAIL GUARD: Phát hiện bị mở trang chi tiết sản phẩm / TikTok Shop
      const productKeywords = [
        'chi tiết sản phẩm', 'thêm vào giỏ hàng', 'mua ngay', 'mua với voucher',
        'chọn phân loại', 'phí vận chuyển', 'cửa hàng', 'pdp', 'ecommerce',
        'product_detail', 'buy now', 'add to cart', 'đang xem sản phẩm'
      ];
      const isProductDetail = elements.some(e => {
        const t = (e.text || '').toLowerCase();
        const c = (e.contentDesc || '').toLowerCase();
        const r = (e.resourceId || '').toLowerCase();
        if (r.includes('pdp_') || r.includes('product_detail') || r.includes('sku_bottom_sheet')) return true;
        return productKeywords.some(kw => t.includes(kw) || c.includes(kw));
      });

      if (isProductDetail) {
        runState?.log?.('WARN', `[Anti-Product Guard] 🛒 PHÁT HIỆN BỊ MỞ TRANG SẢN PHẨM / TIKTOK SHOP! Bấm nút Đóng (X) hoặc Back để thoát...`);
        // Tìm nút đóng (icon X) của BottomSheet sản phẩm
        const closeProductBtn = elements.find(e => {
          const r = (e.resourceId || '').toLowerCase();
          const c = (e.contentDesc || '').toLowerCase();
          return r.includes('close') || r.includes('dismiss') || c === 'đóng' || c === 'close';
        });
        if (closeProductBtn && closeProductBtn.bounds && closeProductBtn.bounds.centerY < Math.round(profile.height * 0.5)) {
          await this.adb.tap(serial, closeProductBtn.bounds.centerX, closeProductBtn.bounds.centerY);
        } else {
          await this.adb.keyevent(serial, 4); // Back
        }
        await new Promise(r => setTimeout(r, 800));
        return { isProduct: true, closedProduct: true };
      }

      // 2.3. VOUCHER & LUCKY DRAW GUARD: Phát hiện popup voucher giảm giá, lì xì, hộp quà
      const voucherKeywords = [
        'voucher', 'phiếu giảm giá', 'mã giảm giá', 'thu thập voucher', 'nhận ngay',
        'ưu đãi người mới', 'quà tặng người mới', 'coupon', 'claim voucher',
        'giảm giá độc quyền', 'đã nhận voucher', 'nhận phiếu', 'rút thăm may mắn',
        'vòng quay may mắn', 'hộp quà may mắn'
      ];
      const hasVoucherPopup = elements.some(e => {
        const t = (e.text || '').toLowerCase();
        const c = (e.contentDesc || '').toLowerCase();
        return voucherKeywords.some(kw => t.includes(kw) || c.includes(kw));
      });

      if (hasVoucherPopup) {
        runState?.log?.('WARN', `[Voucher Guard] 🎟️ PHÁT HIỆN POPUP VOUCHER / PHIẾU GIẢM GIÁ! Bấm nút đóng hoặc Back để dập popup...`);
        const closeVoucherBtn = elements.find(e => {
          const t = (e.text || '').toLowerCase().trim();
          const c = (e.contentDesc || '').toLowerCase().trim();
          const r = (e.resourceId || '').toLowerCase();
          return r.includes('close') || r.includes('dismiss') || ['để sau', 'đóng', 'close', 'lúc khác', 'hủy', 'bỏ qua'].includes(t) ||
                 ['để sau', 'đóng', 'close', 'lúc khác', 'hủy', 'bỏ qua'].includes(c);
        });
        if (closeVoucherBtn && closeVoucherBtn.bounds) {
          await this.adb.tap(serial, closeVoucherBtn.bounds.centerX, closeVoucherBtn.bounds.centerY);
        } else {
          await this.adb.keyevent(serial, 4); // Back
        }
        await new Promise(r => setTimeout(r, 800));
        return { hasVoucher: true, closedVoucher: true };
      }

      // 2.4. LIVE PREVIEW: Nhận diện phòng Livestream trên TikTok
      const liveIndicators = [
        'xem live', 'watch live', 'khám phá live', 'explore live',
        'chủ phòng', 'xếp hạng hàng ngày', 'gửi quà', 'hộp quà', 'rose',
        'quà tặng', 'gửi hoa hồng', 'yêu cầu', 'kết nối khách', 'đa khách'
      ];

      const isLive = elements.some(e => {
        const t = (e.text || '').toLowerCase().trim();
        const c = (e.contentDesc || '').toLowerCase().trim();
        const r = (e.resourceId || '').toLowerCase();
        if (t === 'live' || c === 'live' || t.startsWith('live •') || c.startsWith('live •') || t.startsWith('live|') || c.startsWith('live|')) return true;
        if (r.includes('live_room') || r.includes('broadcast') || r.includes('audience') || r.includes('live_header')) return true;
        return liveIndicators.some(ind => t.includes(ind) || c.includes(ind));
      });

      if (isLive) {
        return { isLive: true };
      }

      // 2.5. AD / SPONSORED DETECTION: Nhận diện quảng cáo
      const adIndicators = [
        'được tài trợ', 'sponsored', 'cài đặt ngay', 'tải ngay', 'mua ngay',
        'install now', 'shop now', 'tìm hiểu thêm', 'xem thêm', 'quảng cáo'
      ];
      const isAd = elements.some(e => {
        const t = (e.text || '').toLowerCase().trim();
        const c = (e.contentDesc || '').toLowerCase().trim();
        return adIndicators.some(ind => t === ind || c === ind || (ind === 'được tài trợ' && (t.includes('được tài trợ') || c.includes('được tài trợ'))));
      });

      if (isAd) {
        return { isAd: true };
      }

      // 2.6. POPUP CHẶN KHÁC: Đồng bộ danh bạ, tìm bạn bè, khảo sát, voucher
      const popupKeywords = [
        'đồng bộ danh bạ', 'tìm bạn bè', 'sync contacts', 'find friends',
        'bạn có thích tiktok', 'đánh giá', 'khảo sát', 'nhận voucher',
        'phiếu giảm giá', 'ưu đãi người mới', 'vuốt lên để xem thêm'
      ];

      const hasPopup = elements.some(e => {
        const t = (e.text || '').toLowerCase();
        const c = (e.contentDesc || '').toLowerCase();
        return popupKeywords.some(kw => t.includes(kw) || c.includes(kw));
      });

      if (hasPopup) {
        runState?.log?.('INFO', `[TikTok Popup Guard] Phát hiện thông báo/khảo sát TikTok, đang tìm nút "Để sau" hoặc Back...`);
        const dismissBtn = elements.find(e => {
          const t = (e.text || '').toLowerCase().trim();
          const c = (e.contentDesc || '').toLowerCase().trim();
          return ['để sau', 'không phải bây giờ', 'lúc khác', 'not now', 'từ chối', 'đóng', 'close'].includes(t) ||
                 ['để sau', 'không phải bây giờ', 'lúc khác', 'not now', 'từ chối', 'đóng', 'close'].includes(c);
        });

        if (dismissBtn && dismissBtn.bounds) {
          await this.adb.tap(serial, dismissBtn.bounds.centerX, dismissBtn.bounds.centerY);
        } else {
          await this.adb.keyevent(serial, 4); // Back
        }
        await new Promise(r => setTimeout(r, 800));
      }

      return { isLive: false, isAd: false, isProduct: false, hasVoucher: false };
    } catch (err) {
      runState?.log?.('DEBUG', `handleTikTokEdgeCases error: ${err.message}`);
      return { isLive: false, isAd: false, isProduct: false, hasVoucher: false };
    }
  }

  // Bí danh tương thích ngược
  async checkTikTokLiveAndPopups(serial, runState) {
    return this.handleTikTokEdgeCases(serial, runState);
  }
}

export const flowRunner = new FlowRunner();
