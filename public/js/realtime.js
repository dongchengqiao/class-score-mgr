// ============================================================
// 实时同步（WebSocket）
//   - 连接 ws(s)://<host>/ws
//   - 收到 update 事件 → 按 resource 刷新对应数据并重绘
//   - 断线自动重连（指数退避，最多 30s）
//   - 不可用（未安装 ws / 网络受限）时静默降级为轮询式手动刷新
// ============================================================
const Realtime = {
  socket: null,
  url: '',
  connected: false,
  retry: 0,
  retryTimer: null,
  closedByUser: false,
  lastEventAt: 0,

  /** 是否处于可用状态 */
  get enabled() {
    return typeof WebSocket !== 'undefined';
  },

  /** 建立连接（重复调用安全） */
  connect() {
    if (!this.enabled) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${proto}//${location.host}/ws`;
    this.closedByUser = false;

    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch (err) {
      console.warn('WebSocket 连接失败，实时同步不可用:', err.message);
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.connected = true;
      this.retry = 0;
      console.log('🔌 实时同步已连接');
      this.setIndicator('connected');
      // 重连后补拉一次数据，避免离线期间漏掉的变更
      if (this.lastEventAt) this.refresh('all');
    };

    socket.onmessage = event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!msg || msg.type !== 'update') return;
      // 忽略自己刚发起的操作？不做区分：刷新幂等，直接刷新即可
      this.lastEventAt = Date.now();
      this.refresh(msg.resource || 'all');
    };

    socket.onclose = () => {
      this.connected = false;
      this.socket = null;
      this.setIndicator('offline');
      if (this.closedByUser) return;
      this.scheduleReconnect();
    };

    socket.onerror = () => { /* onclose 会接管重连 */ };
  },

  /** 指数退避重连（1s, 2s, 4s … 最多 30s） */
  scheduleReconnect() {
    if (this.retryTimer) return;
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(this.retry, 5)));
    this.retry++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  },

  /** 主动断开 */
  disconnect() {
    this.closedByUser = true;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.socket) { try { this.socket.close(); } catch { /* 忽略 */ } }
    this.socket = null;
    this.connected = false;
    this.setIndicator('offline');
  },

  /** 发送心跳（页面不可见时也会由浏览器节流，属正常行为） */
  ping() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    try { this.socket.send(JSON.stringify({ type: 'ping' })); } catch { /* 忽略 */ }
  },

  /** 按资源类型刷新页面数据 */
  async refresh(resource) {
    // 各页面可监听此事件自行刷新（早读页等）
    try {
      document.dispatchEvent(new CustomEvent('realtime:update', { detail: { resource } }));
    } catch { /* 忽略 */ }

    // 主页面 / 管理后台：App 提供统一刷新入口
    if (typeof App !== 'undefined' && App && App.loadAllData) {
      try {
        if (resource === 'rules' && App.loadRules) await App.loadRules();
        else if (resource === 'groups' && App.loadGroups) await App.loadGroups();
        else if (resource === 'shop' && App.loadShopItems) await App.loadShopItems();
        else if (resource === 'settings' && App.loadClassInfo) await App.loadClassInfo();
        else if (resource === 'students' && App.loadStudents) await App.loadStudents();
        else await App.loadAllData();
        if (App.renderAll) App.renderAll();
      } catch (err) {
        console.warn('实时刷新数据失败:', err);
      }
      return;
    }

    // 管理后台：Admin 提供 loadData
    if (typeof Admin !== 'undefined' && Admin && Admin.loadData && Admin.unlocked) {
      try { await Admin.loadData(); } catch (err) { console.warn('管理后台实时刷新失败:', err); }
    }
  },

  /** 状态指示灯（有对应元素时才更新） */
  setIndicator(state) {
    const el = document.getElementById('realtimeDot');
    if (!el) return;
    el.classList.toggle('connected', state === 'connected');
    el.title = state === 'connected' ? '实时同步已连接' : '实时同步未连接';
  },

  /** 在指定容器中渲染状态徽标 */
  mount(containerId) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = `<span class="realtime-indicator" id="realtimeDot" title="实时同步未连接"><i class="fas fa-circle"></i><span>实时同步</span></span>`;
    this.setIndicator(this.connected ? 'connected' : 'offline');
  }
};

// 页面隐藏时暂停心跳，回到前台补一次
document.addEventListener('visibilitychange', () => {
  if (!Realtime.enabled) return;
  if (document.hidden) return;
  if (Realtime.socket && Realtime.socket.readyState === WebSocket.OPEN) Realtime.ping();
  else Realtime.connect();
});

// 页面卸载时主动断开，避免浏览器重连机制干扰
window.addEventListener('beforeunload', () => Realtime.disconnect());
