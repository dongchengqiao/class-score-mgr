// ============================================================
// 功能模块: 计时器 / 随机点名 / 密码 / 导出
// ============================================================

// ==================== 计时器 ====================
const Timer = {
  interval: null,
  state: { running: false },
  stopwatch: { running: false, startTime: 0, elapsedTime: 0 },
  countdown: { running: false, initialDuration: 0, endTime: 0, paused: false, pauseTime: 0 },
  activeType: 'stopwatch',
  isMinimized: false,

  showModal() {
    const modal = document.getElementById('timerModal');
    if (Timer.state.running) {
      Timer.isMinimized = false;
      document.getElementById('timerBtn').innerHTML = '<i class="fas fa-stopwatch"></i> 计时';
      document.getElementById('timerBtn').classList.remove('timer-active');
    }
    modal.style.display = 'block';
    if (!modal.dataset.eventsBound) {
      Timer.bindEvents();
      modal.dataset.eventsBound = 'true';
    }
  },

  bindEvents() {
    document.querySelectorAll('.timer-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (Timer.state.running) { alert('请先停止当前计时器再切换！'); return; }
        document.querySelector('.timer-tab-btn.active')?.classList.remove('active');
        btn.classList.add('active');
        Timer.activeType = btn.dataset.tab;
        document.querySelector('.timer-pane.active')?.classList.remove('active');
        document.getElementById(Timer.activeType + 'Content')?.classList.add('active');
      });
    });
    document.getElementById('startStopwatchBtn')?.addEventListener('click', Timer.toggleStopwatch);
    document.getElementById('resetStopwatchBtn')?.addEventListener('click', Timer.resetStopwatch);
    document.getElementById('startCountdownBtn')?.addEventListener('click', Timer.toggleCountdown);
    document.getElementById('cancelCountdownBtn')?.addEventListener('click', Timer.cancelCountdown);
    document.getElementById('minimizeTimerBtn')?.addEventListener('click', Timer.minimize);
  },

  updateDisplay() {
    const now = Date.now();
    let str = '';
    if (Timer.activeType === 'stopwatch') {
      const total = Timer.stopwatch.elapsedTime + (Timer.stopwatch.running ? (now - Timer.stopwatch.startTime) : 0);
      const m = Math.floor(total / 60000);
      const s = Math.floor((total % 60000) / 1000);
      const cs = Math.floor((total % 1000) / 10);
      str = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
      document.getElementById('stopwatchDisplay').textContent = str;
    } else {
      const remaining = Timer.countdown.endTime - now;
      if (remaining <= 0) {
        document.getElementById('countdownDisplay').textContent = '00:00:00';
        if (Timer.countdown.running) { alert('⏰ 倒计时结束！'); Timer.cancelCountdown(); }
        return;
      }
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      str = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      document.getElementById('countdownDisplay').textContent = str;
    }
    if (Timer.isMinimized) {
      const el = document.querySelector('#timerBtn .minimized-display');
      if (el) el.textContent = str;
    }
  },

  toggleStopwatch() {
    const btn = document.getElementById('startStopwatchBtn');
    if (Timer.stopwatch.running) {
      Timer.stopwatch.running = false;
      Timer.state.running = false;
      Timer.stopwatch.elapsedTime += Date.now() - Timer.stopwatch.startTime;
      clearInterval(Timer.interval); Timer.interval = null;
      btn.innerHTML = '<i class="fas fa-play"></i> 继续';
      btn.className = 'btn btn-accent2';
    } else {
      Timer.stopwatch.running = true;
      Timer.state.running = true;
      Timer.stopwatch.startTime = Date.now();
      Timer.interval = setInterval(Timer.updateDisplay, 10);
      btn.innerHTML = '<i class="fas fa-pause"></i> 暂停';
      btn.className = 'btn btn-danger';
    }
  },

  resetStopwatch() {
    clearInterval(Timer.interval); Timer.interval = null;
    Timer.stopwatch = { running: false, startTime: 0, elapsedTime: 0 };
    Timer.state.running = false;
    Timer.updateDisplay();
    const btn = document.getElementById('startStopwatchBtn');
    btn.innerHTML = '<i class="fas fa-play"></i> 开始';
    btn.className = 'btn btn-accent2';
  },

  toggleCountdown() {
    const btn = document.getElementById('startCountdownBtn');
    if (Timer.countdown.running) {
      if (Timer.countdown.paused) {
        Timer.countdown.paused = false;
        Timer.countdown.endTime = Date.now() + Timer.countdown.pauseTime;
        Timer.interval = setInterval(Timer.updateDisplay, 100);
        btn.innerHTML = '<i class="fas fa-pause"></i> 暂停';
      } else {
        Timer.countdown.paused = true;
        Timer.countdown.pauseTime = Timer.countdown.endTime - Date.now();
        clearInterval(Timer.interval); Timer.interval = null;
        btn.innerHTML = '<i class="fas fa-play"></i> 继续';
      }
    } else {
      const h = parseInt(document.getElementById('hoursInput').value) || 0;
      const m = parseInt(document.getElementById('minutesInput').value) || 0;
      const s = parseInt(document.getElementById('secondsInput').value) || 0;
      Timer.countdown.initialDuration = (h * 3600 + m * 60 + s) * 1000;
      if (Timer.countdown.initialDuration <= 0) { alert('请输入有效的倒计时时间！'); return; }
      Timer.countdown.endTime = Date.now() + Timer.countdown.initialDuration;
      Timer.countdown.running = true;
      Timer.state.running = true;
      Timer.interval = setInterval(Timer.updateDisplay, 100);
      document.getElementById('countdownInputs').classList.add('hidden');
      document.getElementById('countdownDisplay').classList.remove('hidden');
      btn.innerHTML = '<i class="fas fa-pause"></i> 暂停';
    }
  },

  cancelCountdown() {
    clearInterval(Timer.interval); Timer.interval = null;
    Timer.countdown = { running: false, initialDuration: 0, endTime: 0, paused: false, pauseTime: 0 };
    Timer.state.running = false;
    document.getElementById('countdownDisplay').classList.add('hidden');
    document.getElementById('countdownInputs').classList.remove('hidden');
    document.getElementById('hoursInput').value = '';
    document.getElementById('minutesInput').value = '';
    document.getElementById('secondsInput').value = '';
    document.getElementById('countdownDisplay').textContent = '00:00:00';
    const btn = document.getElementById('startCountdownBtn');
    btn.innerHTML = '<i class="fas fa-play"></i> 开始';
  },

  minimize() {
    if (!Timer.state.running) { alert('没有正在计时的任务！'); return; }
    Timer.isMinimized = true;
    document.getElementById('timerModal').style.display = 'none';
    const btn = document.getElementById('timerBtn');
    btn.classList.add('timer-active');
    const icon = Timer.activeType === 'stopwatch' ? 'fa-stopwatch' : 'fa-hourglass-half';
    btn.innerHTML = `<i class="fas ${icon}"></i> <span class="minimized-display">00:00.00</span>`;
    Timer.updateDisplay();
  }
};

// ==================== 随机点名 ====================
const RollCall = {
  interval: null,

  async showModal() {
    const students = App.students;
    if (!students.length) { alert('请先添加学生！'); return; }
    RollCall.reset();
    const modal = document.getElementById('rollCallModal');
    const listEl = document.getElementById('rollCallStudentList');
    const countEl = document.getElementById('rollCallCount');
    listEl.innerHTML = '';
    students.forEach(s => {
      const el = document.createElement('div');
      el.className = 'roll-call-student';
      el.dataset.id = s.id;
      const initial = (s.name || '?').charAt(0);
      el.innerHTML = `
        <div class="roll-call-avatar ${s.gender}">${initial}</div>
        <div class="roll-call-name">${s.name}</div>`;
      listEl.appendChild(el);
    });
    countEl.innerHTML = '';
    for (let i = 1; i <= students.length; i++) {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = i;
      countEl.appendChild(opt);
    }
    countEl.value = 1;
    modal.style.display = 'block';
    document.getElementById('startRollCallBtn').onclick = RollCall.start;
    document.getElementById('resetRollCallBtn').onclick = RollCall.reset;
  },

  start() {
    const startBtn = document.getElementById('startRollCallBtn');
    const resetBtn = document.getElementById('resetRollCallBtn');
    const countEl = document.getElementById('rollCallCount');
    const listEl = document.getElementById('rollCallStudentList');
    const elements = [...listEl.querySelectorAll('.roll-call-student')];
    const count = parseInt(countEl.value);
    if (count > elements.length) { alert('抽取人数不能超过总人数！'); return; }

    startBtn.disabled = true;
    countEl.disabled = true;
    let lastIdx = -1;
    RollCall.interval = setInterval(() => {
      if (lastIdx !== -1) elements[lastIdx].classList.remove('highlight');
      const r = Math.floor(Math.random() * elements.length);
      elements[r].classList.add('highlight');
      lastIdx = r;
    }, 80);

    setTimeout(() => {
      clearInterval(RollCall.interval);
      if (lastIdx !== -1) elements[lastIdx].classList.remove('highlight');
      const indices = Array.from(elements.keys());
      const shuffled = indices.sort(() => 0.5 - Math.random());
      const winners = new Set(shuffled.slice(0, count));
      elements.forEach((el, i) => { if (winners.has(i)) el.classList.add('selected'); });
      listEl.classList.add('result-shown');
      startBtn.style.display = 'none';
      resetBtn.style.display = 'inline-flex';
      setTimeout(() => {
        elements.forEach(el => { if (!el.classList.contains('selected')) el.style.display = 'none'; });
      }, 450);
    }, 3000);
  },

  reset() {
    clearInterval(RollCall.interval);
    const listEl = document.getElementById('rollCallStudentList');
    if (listEl) {
      listEl.classList.remove('result-shown');
      listEl.querySelectorAll('.roll-call-student').forEach(el => {
        el.classList.remove('highlight', 'selected');
        el.style.display = 'flex';
      });
    }
    const startBtn = document.getElementById('startRollCallBtn');
    const resetBtn = document.getElementById('resetRollCallBtn');
    const countEl = document.getElementById('rollCallCount');
    if (startBtn) { startBtn.style.display = 'inline-flex'; startBtn.disabled = false; }
    if (resetBtn) resetBtn.style.display = 'none';
    if (countEl) countEl.disabled = false;
  }
};

// ==================== 登录状态管理 ====================
const Auth = {
  isGuest: false,          // 访客模式（无 Token，仅浏览）
  isAuthenticated: false,  // 已登录（admin 或 user token）
  isAdmin: false,          // 管理员（admin token）

  /** 切换登录/退出按钮的显示状态 */
  updateAuthButtons() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminLoginBtn = document.getElementById('adminLoginBtn');
    if (loginBtn) loginBtn.style.display = this.isGuest ? 'inline-flex' : 'none';
    if (logoutBtn) logoutBtn.style.display = this.isAuthenticated ? 'inline-flex' : 'none';
    // 用户（非管理员）登录时，主页显示"用管理员密码登录"按钮
    if (adminLoginBtn) adminLoginBtn.style.display = (this.isAuthenticated && !this.isAdmin) ? 'inline-flex' : 'none';
  },

  /** 退出登录 */
  handleLogout() {
    UI.confirm('退出登录', '确定要退出登录吗？', () => {
      API.clearToken();
      location.href = '/login.html';
    });
  },

  /** 解析 JWT payload（不含 secret，仅解码） */
  _parseToken(token) {
    try {
      const payload = token.split('.')[1];
      // base64url → base64
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(base64));
    } catch (e) {
      return null;
    }
  },

  async init() {
    try {
      const status = await API.getAuthStatus();
      const appContainer = document.querySelector('.app-container');

      // 先把登录/退出按钮的事件绑定好（在所有路径中都需要）
      document.getElementById('loginBtn')?.addEventListener('click', () => {
        location.href = '/login.html';
      });
      document.getElementById('logoutBtn')?.addEventListener('click', () => Auth.handleLogout());
      // 主页"用管理员密码登录"按钮 → 跳转登录页
      document.getElementById('adminLoginBtn')?.addEventListener('click', () => {
        location.href = '/login.html';
      });

      if (!status.hasPassword) {
        // 未设置管理员密码 → 视为管理员，无需登录
        this.isAuthenticated = true;
        this.isAdmin = true;
        Auth.updateAuthButtons();
        if (appContainer) appContainer.style.display = 'block';
        return;
      }

      // 有密码 → 检查是否已有保存的 Token
      const savedToken = API.getToken();
      if (savedToken) {
        const payload = Auth._parseToken(savedToken);
        if (payload && payload.exp * 1000 > Date.now()) {
          // 验证 token 是否仍有效（调用一个轻量 GET 端点）
          try {
            await API.request('GET', '/api/students?limit=1');
            API.setToken(savedToken);
            if (payload.role === 'admin') {
              // 管理员
              this.isAuthenticated = true;
              this.isAdmin = true;
              this.isGuest = false;
              Auth.updateAuthButtons();
              if (appContainer) appContainer.style.display = 'block';
              return;
            } else if (payload.role === 'user') {
              // 用户（可加减分，不可访问管理后台）
              this.isAuthenticated = true;
              this.isAdmin = false;
              this.isGuest = false;
              Auth.updateAuthButtons();
              if (appContainer) appContainer.style.display = 'block';
              return;
            } else {
              // guest token（旧版）→ 清除，按访客处理
              API.clearToken();
            }
          } catch (_) {
            // Token 无效或过期 → 清除
            API.clearToken();
          }
        } else {
          API.clearToken();
        }
      }

      // 无有效 Token → 访客模式（无 token，仅浏览）
      this.isGuest = true;
      this.isAuthenticated = false;
      this.isAdmin = false;
      Auth.updateAuthButtons();
      if (appContainer) appContainer.style.display = 'block';
      document.body.classList.add('guest-mode');
    } catch (e) {
      Auth.isAuthenticated = true;
      Auth.isAdmin = true;
      document.querySelector('.app-container').style.display = 'block';
    }
  },

  /** 检查是否有操作权限（访客返回 false） */
  requireAuth() {
    if (this.isGuest) {
      UI.alert('访客模式不能进行此操作，请先登录');
      return false;
    }
    return true;
  }
};

// ==================== 数据导入导出 ====================
const DataManager = {
  async exportAll() {
    try {
      const data = await API.exportData();
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `班级积分数据_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) { alert('导出失败: ' + err.message); }
  },

  async importAll(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await API.importData(data);
      alert('数据导入成功！');
      await App.loadAllData();
      App.renderAll();
    } catch (err) { alert('导入失败，请确保文件格式正确。'); }
    event.target.value = '';
  },

  showExportDetailsModal() {
    const modal = document.getElementById('exportDetailsModal');
    const startInput = document.getElementById('startDate');
    const endInput = document.getElementById('endDate');
    const btn = document.getElementById('generateReportBtn');
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    startInput.max = todayStr; endInput.max = todayStr;
    startInput.value = ''; endInput.value = '';
    btn.disabled = true;
    const validate = () => { btn.disabled = !(startInput.value && endInput.value && startInput.value <= endInput.value); };
    startInput.oninput = validate; endInput.oninput = validate;
    btn.onclick = () => DataManager.generateReport(startInput.value, endInput.value);
    modal.style.display = 'block';
  },

  async generateReport(startDateStr, endDateStr) {
    try {
      const result = await API.exportReport(startDateStr, endDateStr);
      if (!result.studentStats.length) { alert('所选日期范围内没有任何有效的积分记录。'); return; }
      // 构建 Excel 数据
      const data = result;
      const wb = XLSX.utils.book_new();

      // Sheet1: 学生积分汇总
      const sheet1 = [['排名', '学生姓名', '期间总加分', '期间总减分', '期间净得分']];
      let rank = 1;
      data.studentStats.forEach((s, i) => {
        if (i > 0 && s.netPoints < data.studentStats[i-1].netPoints) rank = i + 1;
        sheet1.push([rank, s.name, s.positivePoints, s.negativePoints, s.netPoints]);
      });
      sheet1.push([], ['详细记录'], ['学生姓名', '变动时间', '变动原因', '分值']);
      data.studentStats.forEach(s => {
        s.history.forEach(h => {
          sheet1.push([s.name, UI.formatDate(h.created_at), h.reason, h.points]);
        });
      });
      const ws1 = XLSX.utils.aoa_to_sheet(sheet1);
      ws1['!cols'] = [{wch:8},{wch:12},{wch:12},{wch:12},{wch:12}];
      XLSX.utils.book_append_sheet(wb, ws1, '学生积分明细');

      // Sheet2: 小组积分汇总
      if (data.groupStats && data.groupStats.length) {
        const sheet2 = [['小组排名', '小组名称', '期间总得分']];
        let gr = 1;
        data.groupStats.forEach((g, i) => {
          if (i > 0 && g.netPoints < data.groupStats[i-1].netPoints) gr = i + 1;
          sheet2.push([gr, g.name, g.netPoints]);
        });
        sheet2.push([], ['详细记录'], ['小组名称', '成员姓名', '变动时间', '变动原因', '分值']);
        data.groupStats.forEach(g => {
          g.members.forEach(m => {
            m.history.forEach(h => {
              sheet2.push([g.name, m.studentName, UI.formatDate(h.created_at), h.reason, h.points]);
            });
          });
        });
        const ws2 = XLSX.utils.aoa_to_sheet(sheet2);
        ws2['!cols'] = [{wch:12},{wch:12},{wch:20},{wch:30},{wch:10}];
        XLSX.utils.book_append_sheet(wb, ws2, '小组积分明细');
      }

      XLSX.writeFile(wb, `积分明细报表_${startDateStr}_至_${endDateStr}.xlsx`);
    } catch (err) { alert('生成报表失败: ' + err.message); }
  }
};
