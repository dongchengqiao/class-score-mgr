// ============================================================
// 语音加分 - 逻辑
// ============================================================

const Voice = {
  students: [],
  recognition: null,
  isListening: false,
  pendingData: null,    // { name, reason, points, student }

  // 操作历史
  history: [],

  // ==================== 初始化 ====================

  async init() {
    // 检测浏览器支持
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      Voice.showError('您的浏览器不支持语音识别，请使用 Chrome/Edge 浏览器');
      document.getElementById('micBtn').disabled = true;
      return;
    }

    // 检查登录状态 - admin / user 可用；无 token 访客禁用
    const token = API.getToken();
    const authOverlay = document.getElementById('authOverlay');
    const isStandalonePage = !!authOverlay;

    if (!token && isStandalonePage) {
      authOverlay.style.display = 'flex';
      document.getElementById('micBtn').disabled = true;
      return;
    }
    // 检查 token 角色（guest 已废弃，兼容旧 token）
    if (token && isStandalonePage) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.role !== 'admin' && payload.role !== 'user') {
          authOverlay.style.display = 'flex';
          document.getElementById('micBtn').disabled = true;
          return;
        }
      } catch {
        authOverlay.style.display = 'flex';
        document.getElementById('micBtn').disabled = true;
        return;
      }
    }

    // 加载学生列表
    try {
      const data = await API.getStudents();
      Voice.students = data;
      await Voice.buildPinyinMap(); // 根据学生列表自动构建拼音映射
    } catch (e) {
      if (e.message !== '请先登录' && e.message !== '登录已过期，请重新登录') {
        console.error('加载学生列表失败:', e);
        Voice.showError('加载学生列表失败，请刷新重试');
      }
    }

    // 初始化语音识别
    Voice.recognition = new SpeechRecognition();
    Voice.recognition.lang = 'zh-CN';
    Voice.recognition.continuous = false;
    Voice.recognition.interimResults = true;
    Voice.recognition.maxAlternatives = 3;

    Voice.recognition.onresult = (event) => Voice.handleResult(event);
    Voice.recognition.onerror = (event) => Voice.handleError(event);
    Voice.recognition.onend = () => Voice.handleEnd();

    // 绑定事件
    document.getElementById('micBtn').addEventListener('click', () => Voice.toggleMic());
    document.getElementById('confirmBtn').addEventListener('click', () => Voice.confirm());
    document.getElementById('cancelBtn').addEventListener('click', () => Voice.cancel());

    // 键盘快捷键：空格切换麦克风（仅在语音模态框打开时有效）
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const voiceModal = document.getElementById('voiceModal');
      if (voiceModal && voiceModal.style.display !== 'block') return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        Voice.toggleMic();
      }
    });
  },

  // ==================== 麦克风控制 ====================

  toggleMic() {
    if (Voice.isListening) {
      Voice.stop();
    } else {
      Voice.start();
    }
  },

  start() {
    Voice.isListening = true;
    document.getElementById('micBtn').classList.add('listening');
    document.getElementById('micBtn').innerHTML = '<i class="fas fa-stop"></i>';
    document.getElementById('micStatus').textContent = '🎤 正在聆听...';
    document.getElementById('micStatus').classList.add('active');
    document.getElementById('errorMsg').classList.remove('visible');
    Voice.hideParseCard();
    Voice.setTranscript('等待语音输入...', true);
    Voice.pendingData = null;

    try {
      Voice.recognition.start();
    } catch (e) {
      // 如果已经启动则忽略
    }
  },

  stop() {
    Voice.isListening = false;
    document.getElementById('micBtn').classList.remove('listening');
    document.getElementById('micBtn').innerHTML = '<i class="fas fa-microphone"></i>';
    document.getElementById('micStatus').textContent = '点击麦克风开始';
    document.getElementById('micStatus').classList.remove('active');
    try { Voice.recognition.stop(); } catch (e) { /* ignore */ }
  },

  // ==================== 语音回调 ====================

  handleResult(event) {
    let finalTexts = [];
    let interimText = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        // 收集所有候选结果
        for (let j = 0; j < result.length; j++) {
          finalTexts.push(result[j].transcript.trim());
        }
      } else {
        interimText += result[0].transcript;
      }
    }

    // 用 interim 文本做实时显示
    const displayText = finalTexts[0] || interimText;
    if (!displayText) return;

    Voice.setTranscript(displayText, !finalTexts.length);
    Voice.hideParseCard();

    if (finalTexts.length) {
      // 用所有候选文本去重依次尝试解析
      const seen = new Set();
      for (const text of finalTexts) {
        if (seen.has(text)) continue;
        seen.add(text);
        Voice.parseAndShow(text);
        if (Voice.pendingData) return; // 解析成功立即停下
      }
    }
  },

  handleError(event) {
    console.error('语音识别错误:', event.error);
    if (event.error === 'no-speech') {
      Voice.showError('未检测到语音，请重试');
    } else if (event.error === 'aborted') {
      // 用户主动停止，不显示错误
    } else if (event.error === 'audio-capture') {
      Voice.showError('无法访问麦克风，请检查权限设置');
    } else if (event.error === 'not-allowed') {
      Voice.showError('麦克风权限被拒绝，请在浏览器设置中允许');
    } else {
      Voice.showError('语音识别出错: ' + event.error);
    }
    Voice.stop();
  },

  handleEnd() {
    Voice.stop();
  },

  // ==================== 文本显示 ====================

  setTranscript(text, isInterim) {
    const el = document.getElementById('transcript');
    if (text === '等待语音输入...' || !text) {
      el.innerHTML = '<span class="transcript-empty">等待语音输入...</span>';
      return;
    }
    el.textContent = text;
    if (isInterim) {
      el.style.opacity = '0.6';
    } else {
      el.style.opacity = '1';
    }
  },

  // ==================== 命令解析 ====================

  /**
   * 解析语音文本，格式: <name> <reason> 加/减 <score>
   * 也兼容: <name><reason>加<score> 等无空格的情况
   */
  parseCommand(text) {
    if (!text) return null;

    // 找到学生
    const matched = Voice.findStudent(text);
    if (!matched) return { error: '未识别出学生姓名' };

    const { student, nameInText, remaining } = matched;

    // 在剩余文本中找 加/减
    const actionRegex = /([加减][上下]?|[＋－\+-])/;
    const actionMatch = remaining.match(actionRegex);
    if (!actionMatch) return { error: '未找到"加"或"减"操作', student };

    const actionIdx = actionMatch.index;
    const actionChar = remaining[actionIdx];
    const afterAction = remaining.slice(actionIdx + 1).trim();

    // 提取分数 — 找数字（含"分"字可选）
    const scoreMatch = afterAction.match(/(\d+)\s*分?/);
    if (!scoreMatch) return { error: '未识别出分数', student };

    const score = parseInt(scoreMatch[1]);
    const points = (actionChar === '减' || actionChar === '-') ? -score : score;

    // 原因 = 姓名之后 ~ 加减之前的文本
    const reasonRaw = remaining.slice(0, actionIdx).trim();
    // 清理原因中的杂音词
    let reason = reasonRaw
      .replace(/^(因为|由于|的原因|是|就是|额|呃)/, '')
      .replace(/[，。！？、；：""''（）\s]+/g, ' ')
      .trim();

    if (!reason) reason = '语音加分';

    return { student, name: student.name, reason, points, score };
  },

  // ==================== 拼音映射 ====================

  /** 班级学生姓名中所有汉字的拼音映射（用于语音模糊匹配） */
  // ==================== 拼音工具 ====================

  /** 综合拼音映射（学生姓名 + 常用场景字 + 常见同音替代字）
   *  从 backend/data/pinyinmap.json 加载 */
  EXTENDED_PINYIN: {},

  /** 构建拼音映射（从外部 JSON + 学生列表自动合并） */
  async buildPinyinMap() {
    try {
      const resp = await fetch('/data/pinyinmap.json');
      Voice.EXTENDED_PINYIN = await resp.json();
    } catch (e) {
      console.error('加载 pinyinmap.json 失败:', e);
    }
    const map = {};
    // 1. 复制扩展基础映射
    Object.assign(map, Voice.EXTENDED_PINYIN);
    // 2. 确保学生姓名的每个字都在映射中（覆盖优先级）
    for (const student of Voice.students) {
      for (const char of student.name) {
        if (!map[char]) {
          map[char] = char; // fallback：用汉字本身
        }
      }
    }
    Voice.PINYIN_MAP = map;
  },

  /** 获取汉字拼音，找不到返回原文 */
  getPinyin(char) {
    return Voice.PINYIN_MAP[char] || char;
  },

  /** 将文本转为拼音串 */
  nameToPinyin(text) {
    return text.split('').map(c => Voice.getPinyin(c)).join('');
  },

  /** 归一化拼音：平舌→翘舌、前鼻音→后鼻音 */
  normalizePinyin(py) {
    let s = py.toLowerCase();
    // 平舌音 → 翘舌音
    if (/^[zcs]/.test(s) && !/^zh|ch|sh/.test(s)) {
      const initMap = { 'z':'zh', 'c':'ch', 's':'sh' };
      s = (initMap[s[0]] || s[0]) + s.slice(1);
    }
    // 前鼻音 → 后鼻音
    s = s.replace(/ian$/, 'iang').replace(/uan$/, 'uang');
    s = s.replace(/in$/, 'ing').replace(/en$/, 'eng').replace(/an$/, 'ang');
    // ün（j/q/x/y 后写为 un）→ 对应后鼻音
    s = s.replace(/jun$/, 'jiong').replace(/qun$/, 'qiong').replace(/xun$/, 'xiong').replace(/yun$/, 'yong');
    // 其他 un → ong（尊/春/孙/论/屯 等）
    s = s.replace(/un$/, 'ong');
    // vn（ü+n 输入法写法）→ iong
    s = s.replace(/vn$/, 'iong');
    return s;
  },

  /** 获取某学生的给定名（去姓后的名字部分）
   *  3字名 → 后2字；4字名 → 后3字 + 后2字；2字名 → 单字（仅短文本场景使用）
   */
  getGivenNameCandidates(student) {
    const name = student.name;
    const len = name.length;
    const candidates = [];
    if (len === 4) candidates.push(name.slice(-3));
    if (len >= 3) candidates.push(name.slice(-2));
    if (len === 2) candidates.push(name.slice(-1));
    return candidates;
  },

  /** 获取归一化拼音 */
  getNormalizedPinyin(char) {
    return Voice.normalizePinyin(Voice.getPinyin(char));
  },

  /** 将文本转为归一化拼音 */
  nameToNormalizedPinyin(text) {
    return text.split('').map(c => Voice.getNormalizedPinyin(c)).join('');
  },

  /** 将拼音位置映射回原始文本字符位置 */
  pinyinPosToCharPos(text, pinyinPos, normalized) {
    let charPos = 0, pos = 0;
    const textChars = [...text];
    while (pos < pinyinPos && charPos < textChars.length) {
      const py = normalized ? Voice.getNormalizedPinyin(textChars[charPos]) : Voice.getPinyin(textChars[charPos]);
      pos += py.length;
      charPos++;
    }
    return charPos;
  },

  /**
   * 计算编辑距离（Levenshtein）
   */
  levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) dp[i][0] = i;
    for (let j = 1; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i-1] === b[j-1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i-1][j] + 1,
          dp[i][j-1] + 1,
          dp[i-1][j-1] + cost
        );
      }
    }
    return dp[m][n];
  },

  /**
   * 在学生列表中匹配姓名（多策略，按优先级降序）
   * 策略1: 精确子串匹配
   * 策略2: 按序包含
   * 策略3: 编辑距离（字符）
   * 策略4: 拼音子串匹配（含归一化处理平翘舌/前后鼻音）
   * 策略5: 拼音编辑距离（处理多字同音情况）
   * 策略6: 给定名匹配
   */
  findStudent(text) {
    if (!text || !Voice.students.length) return null;

    // 按姓名长度降序排序（长名优先匹配，如"金叶瑞轩"）
    const sorted = [...Voice.students].sort((a, b) => b.name.length - a.name.length);

    // ---- 策略1: 精确子串匹配 ----
    for (const student of sorted) {
      const idx = text.indexOf(student.name);
      if (idx !== -1) {
        const remaining = text.slice(idx + student.name.length).trim();
        return { student, nameInText: student.name, remaining };
      }
    }

    // ---- 策略2: 按序包含（字符顺序匹配） ----
    for (const student of sorted) {
      const nameChars = student.name.split('');
      let searchFrom = 0;
      let matchEnd = 0;
      let allMatched = true;
      for (const ch of nameChars) {
        const pos = text.indexOf(ch, searchFrom);
        if (pos === -1) { allMatched = false; break; }
        matchEnd = pos + 1;
        searchFrom = pos + 1;
      }
      if (allMatched) {
        const remaining = text.slice(matchEnd).trim();
        return { student, nameInText: student.name, remaining };
      }
    }

    // ---- 策略3: 编辑距离（字符级，3字名允许1字差异） ----
    for (const student of sorted) {
      const nameLen = student.name.length;
      const maxDist = nameLen <= 2 ? 0 : 1;
      for (let i = 0; i <= text.length - nameLen; i++) {
        const window = text.slice(i, i + nameLen);
        const dist = Voice.levenshtein(window, student.name);
        if (dist <= maxDist) {
          const remaining = text.slice(i + nameLen).trim();
          return { student, nameInText: student.name, remaining };
        }
      }
    }

    // ---- 策略4: 拼音子串匹配（含归一化） ----
    const textPinyin = Voice.nameToPinyin(text);
    const textPinyinN = Voice.nameToNormalizedPinyin(text);
    const studentsPinyin = sorted.map(s => ({
      student: s,
      pinyin: Voice.nameToPinyin(s.name),
      pinyinN: Voice.nameToNormalizedPinyin(s.name) // 归一化拼音
    }));

    // 4a: 标准拼音匹配
    for (const { student, pinyin } of studentsPinyin) {
      const idx = textPinyin.indexOf(pinyin);
      if (idx !== -1) {
        // 精确映射拼音位置 → 文本字符位置
        let charPos = 0, pinyinPos = 0;
        const textChars = [...text];
        while (pinyinPos < idx && charPos < textChars.length) {
          pinyinPos += Voice.getPinyin(textChars[charPos]).length;
          charPos++;
        }
        const remaining = text.slice(charPos + student.name.length).trim();
        return { student, nameInText: student.name, remaining };
      }
    }

    // 4b: 归一化拼音匹配（处理平翘舌/前后鼻音）
    for (const { student, pinyinN } of studentsPinyin) {
      const idx = textPinyinN.indexOf(pinyinN);
      if (idx !== -1) {
        // 精确映射归一化拼音位置 → 文本字符位置
        let charPos = 0, pinyinPos = 0;
        const textChars = [...text];
        while (pinyinPos < idx && charPos < textChars.length) {
          pinyinPos += Voice.getNormalizedPinyin(textChars[charPos]).length;
          charPos++;
        }
        const remaining = text.slice(charPos + student.name.length).trim();
        return { student, nameInText: student.name, remaining };
      }
    }

    // ---- 策略6: 给定名匹配（三字名匹配后两字、四字名匹配后两/三字、两字名单字） ----
    // 放在拼音模糊匹配之前，因为给定名匹配更可靠
    for (const student of sorted) {
      const candidates = Voice.getGivenNameCandidates(student);
      for (const given of candidates) {
        const idx = text.indexOf(given);
        if (idx === -1) continue;
        // 单字给定名（2字名学生）需在文本开头，且剩余部分以命令词开头（如"言加1分"）
        if (given.length === 1) {
          if (idx !== 0) continue;
          const rest = text.slice(idx + given.length).trim();
          if (!/^[加减上下]|^\d|^[＋－\+-]/.test(rest)) continue;
        }
        const remaining = text.slice(idx + given.length).trim();
        return { student, nameInText: student.name, remaining };
      }
    }

    // ---- 策略4c: 给定名拼音匹配（归一化，处理省略姓+同音字，如"玉成"→姜昱丞） ----
    // 只尝试 2 字以上给定名；用编辑距离评分避免误匹配
    let bestGiven = null;
    for (const student of sorted) {
      const candidates = Voice.getGivenNameCandidates(student);
      for (const given of candidates) {
        if (given.length < 2) continue; // 单字给定名太泛，跳过
        const givenPinyinN = Voice.nameToNormalizedPinyin(given);
        // 在文本归一化拼音中查找给定名拼音（只匹配文本开头区域，避免匹配到原因/命令部分）
        const limit = Math.min(givenPinyinN.length + 2, textPinyinN.length);
        for (let i = 0; i <= limit - givenPinyinN.length; i++) {
          if (textPinyinN.slice(i, i + givenPinyinN.length) !== givenPinyinN) continue;
          // 将拼音位置映射回字符位置，检查实际字符相似度
          const charPos = Voice.pinyinPosToCharPos(text, i, true);
          const matchedText = text.slice(charPos, charPos + given.length);
          const charDist = Voice.levenshtein(matchedText, given);
          if (charDist > 2) continue; // 允许2个字符差异（同音字）
          if (!bestGiven || charDist < bestGiven.charDist) {
            bestGiven = { student, given, charDist, idx: i, charPos };
          }
        }
      }
    }
    if (bestGiven) {
      const { student, given, charPos } = bestGiven;
      const remaining = text.slice(charPos + given.length).trim();
      return { student, nameInText: student.name, remaining };
    }

    // ---- 策略4d: 首尾字简称匹配（如"扬哲"→杨盛哲：取学生名首字+尾字拼音） ----
    // 只针对3字以上姓名，文本开头2字拼音 = 学生名首字拼音 + 尾字拼音（归一化）
    {
      const textChars = [...text];
      if (textChars.length >= 2) {
        const headText = textChars.slice(0, 2).join('');
        if (!/\d/.test(headText)) { // 排除文本开头是数字的情况（如"加1分"）
          const headPinyinN = Voice.nameToNormalizedPinyin(headText);
          for (const student of sorted) {
            if (student.name.length < 3) continue;
            const nameChars = [...student.name];
            const firstLast = nameChars[0] + nameChars[nameChars.length - 1];
            if (Voice.nameToNormalizedPinyin(firstLast) === headPinyinN) {
              // 首尾字拼音匹配成功
              const remaining = text.slice(2).trim();
              return { student, nameInText: student.name, remaining };
            }
          }
        }
      }
    }

    // ---- 策略5: 拼音编辑距离（处理多字同音情况） ----
    let bestScore = 0;
    let bestMatch = null;
    for (const { student, pinyinN } of studentsPinyin) {
      // 在归一化拼音中滑动窗口
      const nameLen = student.name.length;
      const pinyinLen = pinyinN.length;
      for (let i = 0; i <= textPinyinN.length - pinyinLen; i++) {
        const window = textPinyinN.slice(i, i + pinyinLen);
        const dist = Voice.levenshtein(window, pinyinN);
        // 拼音编辑距离分数：0.0 = 完全不同, 1.0 = 完全一致
        const score = 1 - dist / Math.max(pinyinLen, 1);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = { student, score, idx: i };
        }
      }
    }
    if (bestMatch && bestMatch.score >= 0.75) {
      const { student, idx } = bestMatch;
      // 将拼音位置 idx 映射回原始文本的字符位置
      let charPos = 0, pinyinPos = 0;
      const textChars = [...text];
      while (pinyinPos < idx && charPos < textChars.length) {
        const chPinyin = Voice.getNormalizedPinyin(textChars[charPos]);
        pinyinPos += chPinyin.length;
        charPos++;
      }
      // 加上学生姓名长度（拼音窗口已匹配，对应字符数 = 姓名长度）
      const rawEnd = charPos + student.name.length;
      const remaining = text.slice(Math.min(rawEnd, text.length)).trim();
      return { student, nameInText: student.name, remaining };
    }

    return null;
  },

  // ==================== 展示解析结果 ====================

  parseAndShow(text) {
    const result = Voice.parseCommand(text);

    if (!result || result.error) {
      // 显示友好的错误提示
      const errMsg = result ? result.error : '无法解析指令';
      Voice.showError(errMsg + '。请说：姓名 原因 加/减 分数');
      Voice.hideParseCard();
      return;
    }

    Voice.hideError();

    const parseCard = document.getElementById('parseCard');
    document.getElementById('parseName').textContent = result.name;
    document.getElementById('parseReason').textContent = result.reason;
    const scoreEl = document.getElementById('parseScore');
    scoreEl.textContent = `${result.points > 0 ? '+' : ''}${result.points} 分`;
    scoreEl.className = `parse-value ${result.points >= 0 ? 'positive' : 'negative'}`;
    parseCard.classList.add('visible');

    // 高亮显示识别文本
    Voice.highlightTranscript(text, result);

    Voice.pendingData = result;
  },

  highlightTranscript(text, result) {
    const el = document.getElementById('transcript');
    let html = text;

    // 高亮姓名
    if (result.name && text.includes(result.name)) {
      html = html.replace(result.name, `<span class="hl-name">${result.name}</span>`);
    }
    // 高亮加减
    const actionMatch = text.match(/[加减][上下]?|[＋－\+-]/);
    if (actionMatch) {
      html = html.replace(actionMatch[0], `<span class="hl-action">${actionMatch[0]}</span>`);
    }
    // 高亮分数
    const scoreMatch = text.match(/(\d+)\s*分?/);
    if (scoreMatch) {
      html = html.replace(scoreMatch[1] + (scoreMatch[0].includes('分') ? '分' : ''), `<span class="hl-score">${scoreMatch[0]}</span>`);
    }

    el.innerHTML = html;
    el.style.opacity = '1';
  },

  hideParseCard() {
    document.getElementById('parseCard').classList.remove('visible');
    Voice.pendingData = null;
  },

  // ==================== 确认/取消 ====================

  async confirm() {
    const data = Voice.pendingData;
    if (!data) return;

    // 访客/只读模式下阻止提交
    if (typeof Auth !== 'undefined' && Auth.isGuest) {
      Voice.hideParseCard();
      Voice.setTranscript('🔒 访客模式无法操作，请登录后再使用语音加分', false);
      Voice.showError('请先登录后再进行加减分操作');
      setTimeout(() => {
        if (!Voice.isListening) Voice.setTranscript('等待语音输入...', true);
      }, 4000);
      return;
    }

    try {
      await API.addPoints(data.student.id, data.points, data.reason);
      Voice.addHistory(data.name, data.reason, data.points, 'success');
      Voice.hideParseCard();
      Voice.setTranscript(`✅ 已为 ${data.name} ${data.points > 0 ? '加' : '减'} ${Math.abs(data.points)} 分（${data.reason}）`, false);

      // 自动清除显示
      setTimeout(() => {
        if (!Voice.isListening) {
          Voice.setTranscript('等待语音输入...', true);
        }
      }, 3000);
    } catch (err) {
      Voice.showError('操作失败: ' + (err.message || err));
      Voice.addHistory(data.name, data.reason, data.points, 'error');
    }
  },

  cancel() {
    const data = Voice.pendingData;
    if (data) {
      Voice.addHistory(data.name, data.reason, data.points, 'cancelled');
    }
    Voice.hideParseCard();
    Voice.setTranscript('已取消', false);
    setTimeout(() => {
      if (!Voice.isListening) {
        Voice.setTranscript('等待语音输入...', true);
      }
    }, 1500);
  },

  // ==================== 历史记录 ====================

  addHistory(name, reason, points, status) {
    Voice.history.unshift({
      name, reason, points, status,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
    Voice.renderHistory();
  },

  renderHistory() {
    const el = document.getElementById('historyList');
    if (!Voice.history.length) {
      el.innerHTML = '<div class="history-empty">暂无操作记录</div>';
      return;
    }

    el.innerHTML = Voice.history.map(h => {
      const icons = { success: '✅', error: '❌', cancelled: '⏭️' };
      const labels = { success: '已完成', error: '失败', cancelled: '已取消' };
      return `<div class="history-item ${h.status}">
        <span class="history-icon">${icons[h.status] || '📝'}</span>
        <span class="history-text">
          <strong>${h.name}</strong>
          ${h.points > 0 ? '加' : '减'} ${Math.abs(h.points)} 分
          （${h.reason}）
          <span class="history-label">${labels[h.status]}</span>
        </span>
        <span class="history-time">${h.time}</span>
      </div>`;
    }).join('');
  },

  // ==================== 错误提示 ====================

  showError(msg) {
    const el = document.getElementById('errorMsg');
    el.textContent = msg;
    el.style.display = '';
  },

  hideError() {
    document.getElementById('errorMsg').style.display = 'none';
  }
};

// 启动
document.addEventListener('DOMContentLoaded', () => Voice.init());
