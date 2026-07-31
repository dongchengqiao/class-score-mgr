// ============================================================
// 早读加分工具 (数据存储在 class-data.json 的 reading_points)
// ============================================================

let studentList = [];
let scoresMap = {};
let currentOrderIds = [];

// ==================== 权限/登录状态 ====================

/** 当前是否为只读访客模式 */
let isReadOnly = true;

/** 解析 JWT payload（不验证签名，仅前端展示用） */
function parseToken(token) {
  try {
    const payload = token.split('.')[1];
    // base64url → base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch (e) {
    return null;
  }
}

/** 检测登录状态，自动获取访客 token */
async function checkAuth() {
  const token = API.getToken && API.getToken();
  if (token) {
    const payload = parseToken(token);
    if (payload && payload.role === 'admin' && payload.exp * 1000 > Date.now()) {
      isReadOnly = false;
      return; // 管理员已登录
    }
  }
  // 没有有效管理员 token → 尝试获取访客 token
  try {
    const res = await API.getGuestToken();
    if (res && res.token) {
      API.setToken(res.token);
    }
  } catch (e) {
    console.warn('获取访客 token 失败，可能无法加载数据:', e);
  }
  isReadOnly = true;
}

/** 更新页面上的权限状态横幅 */
function updateAuthBanner() {
  const banner = document.getElementById('authBanner');
  if (!banner) return;
  if (isReadOnly) {
    banner.innerHTML = '<i class="fas fa-eye"></i> 访客模式 · 仅可查看分数 <a href="/" class="banner-link">去登录 →</a>';
    banner.className = 'auth-banner guest';
  } else {
    banner.innerHTML = '<i class="fas fa-lock-open"></i> 管理员模式 · 可进行加减分操作';
    banner.className = 'auth-banner admin';
  }

  // 更新页脚提示
  const footer = document.getElementById('footerNote');
  if (footer) {
    footer.textContent = isReadOnly
      ? '🔒 访客模式 · 登录后可进行加减分操作'
      : '🌟 点击 ＋/－ 为每位同学加减分';
  }
}

// ==================== 学生列表管理 ====================

/** 从后端加载学生列表（数据来自主 DB） */
async function loadStudents() {
  try {
    const data = await API.getMorningReading();
    studentList = (data.students && Array.isArray(data.students)) ? data.students : [];
  } catch (e) {
    console.warn('从后端加载学生列表失败:', e);
    studentList = [];
  }
}

// ==================== 积分管理 ====================

/** 从后端加载积分（来自每个学生的 reading_points） */
async function loadScores() {
  try {
    const data = await API.getMorningReading();
    const parsed = data.scoresMap || {};
    studentList.forEach(s => {
      scoresMap[s.id] = typeof parsed[s.id] === 'number' ? parsed[s.id] : 0;
    });
  } catch (e) {
    console.warn('从后端加载积分失败，使用空数据:', e);
    initScoresToZero();
  }
}

/** 保存到后端（更新每个学生的 reading_points） */
async function persistScores() {
  try {
    await API.saveMorningReading(scoresMap);
  } catch (e) {
    console.error('保存到后端失败:', e);
  }
}

/** 将所有学生积分归零 */
async function initScoresToZero() {
  studentList.forEach(s => { scoresMap[s.id] = 0; });
  await persistScores();
}

/** 重置所有积分 → 并询问是否同步到班级积分管理（原因：早读优秀） */
async function resetAllScores() {
  if (isReadOnly) { alert('🔒 访客模式无法操作'); return; }
  if (!confirm('🧸 确定要把所有小可爱的积分归零吗')) return;

  // 询问是否同步到积分管理
  if (confirm('📊 是否将本次早读积分同步到班级积分管理？\n（通过标准积分 API 逐一添加到总积分）')) {
    try {
      // 使用标准学生积分 API（与 index.html 加减分同接口）逐一同步
      const syncedNames = [];
      for (const s of studentList) {
        const pts = scoresMap[s.id] || 0;
        if (pts > 0) {
          await API.addPoints(s.id, pts, '早读优秀');
          syncedNames.push(s.name);
        }
      }
      const total = syncedNames.length;
      alert(`✅ 同步完成！共 ${total} 人获得早读优秀积分`);
    } catch (e) {
      alert('❌ 同步失败: ' + e.message);
    }
  }

  // 重置积分（前端清零并保存）
  studentList.forEach(s => { scoresMap[s.id] = 0; });
  await persistScores();
  renderCards();
}

/** 更新单个学生积分 */
async function updateScore(studentId, delta) {
  if (isReadOnly) { alert('🔒 访客模式无法操作'); return; }
  if (scoresMap[studentId] === undefined) scoresMap[studentId] = 0;
  scoresMap[studentId] += delta;
  await persistScores();
  renderCards();
}

// ==================== 排序 & 导出 ====================

function getPinyinSortedIds() {
  return [...studentList].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' })).map(s => s.id);
}

function applyPinyinSort() {
  currentOrderIds = getPinyinSortedIds();
  renderCards();
}

function exportToCSV() {
  const studentMap = new Map(studentList.map(s => [s.id, s.name]));
  const exportIds = currentOrderIds.length ? currentOrderIds : getPinyinSortedIds();
  const rows = [['序号', '姓名', '积分']];
  exportIds.forEach((id, idx) => {
    const name = studentMap.get(id);
    if (name) {
      rows.push([idx + 1, name, scoresMap[id] || 0]);
    }
  });
  const csvContent = rows.map(row => row.map(cell => {
    if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  }).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  link.setAttribute('download', `早读积分_703班_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ==================== 渲染 ====================

function renderCards() {
  const container = document.getElementById('cardsContainer');
  if (!container) return;
  if (!currentOrderIds || currentOrderIds.length === 0) {
    currentOrderIds = getPinyinSortedIds();
  }
  const studentMap = new Map(studentList.map(s => [s.id, s]));
  const fragment = document.createDocumentFragment();
  currentOrderIds.forEach(stuId => {
    const student = studentMap.get(stuId);
    if (!student) return;
    const currentScore = scoresMap[stuId] || 0;
    const card = document.createElement('div');
    card.className = 'student-card';
    const headerDiv = document.createElement('div');
    headerDiv.className = 'card-header';
    const nameSpan = document.createElement('div');
    nameSpan.className = 'student-name';
    nameSpan.innerText = student.name;
    headerDiv.appendChild(nameSpan);
    const scoreArea = document.createElement('div');
    scoreArea.className = 'score-area';
    const scoreValueSpan = document.createElement('span');
    scoreValueSpan.className = 'score-value';
    scoreValueSpan.innerText = currentScore;
    scoreArea.appendChild(scoreValueSpan);
    card.appendChild(headerDiv);
    card.appendChild(scoreArea);

    // 只读模式不显示加减按钮
    if (!isReadOnly) {
      const btnGroup = document.createElement('div');
      btnGroup.className = 'button-group';
      const minusBtn = document.createElement('button');
      minusBtn.innerText = '-';
      minusBtn.className = 'btn-point minus';
      const plusBtn = document.createElement('button');
      plusBtn.innerText = '+';
      plusBtn.className = 'btn-point plus';
      minusBtn.addEventListener('click', e => { e.stopPropagation(); updateScore(stuId, -1); });
      plusBtn.addEventListener('click', e => { e.stopPropagation(); updateScore(stuId, +1); });
      btnGroup.appendChild(minusBtn);
      btnGroup.appendChild(plusBtn);
      card.appendChild(btnGroup);
    }
    fragment.appendChild(card);
  });
  container.innerHTML = '';
  container.appendChild(fragment);
}

// ==================== 事件绑定 ====================

function bindGlobalButtons() {
  document.getElementById('sortPinyinBtn')?.addEventListener('click', applyPinyinSort);
  const resetBtn = document.getElementById('resetAllScoresBtn');
  if (resetBtn) {
    if (isReadOnly) {
      resetBtn.disabled = true;
      resetBtn.title = '访客模式不可用';
      resetBtn.style.opacity = '0.4';
      resetBtn.style.cursor = 'not-allowed';
    } else {
      resetBtn.addEventListener('click', resetAllScores);
    }
  }
  document.getElementById('exportDataBtn')?.addEventListener('click', exportToCSV);
}

/** 初始化系统 */
async function initSystem() {
  await checkAuth();
  updateAuthBanner();
  await loadStudents();
  // 更新总人数显示
  const totalEl = document.getElementById('totalStudents');
  if (totalEl) totalEl.textContent = studentList.length;
  await loadScores();
  currentOrderIds = getPinyinSortedIds();
  renderCards();
  bindGlobalButtons();
}

document.addEventListener('DOMContentLoaded', () => {
  initSystem();
});
