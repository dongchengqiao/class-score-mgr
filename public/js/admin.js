// ============================================================
// 管理后台 - 逻辑
// ============================================================

const Admin = {
  unlocked: false,
  unlockMode: 'unlock', // 'unlock' | 'setup' | 'blocked'
  rules: [],
  shopItems: [],
  students: [],
  groups: [],

  async init() {
    // 顶部导航折叠（通用组件）
    if (window.HeaderNav) HeaderNav.init();

    // 切换端口后源（含端口）变化会丢失 localStorage，用 URL hash 传回 token
    Admin.adoptTokenFromHash();

    // 检查当前 token 角色：admin 可直接进入，否则显示"登录管理员账号"
    const role = API.getRole();
    if (role === 'admin') {
      Admin.unlocked = true;
      document.getElementById('unlockOverlay').style.display = 'none';
      document.getElementById('adminContent').style.display = 'block';
      document.getElementById('adminBadge').innerHTML = '<i class="fas fa-unlock"></i> 已验证';
      document.getElementById('adminBadge').style.background = 'var(--accent2)';
      Admin.bindEvents();
      Admin.loadData();
      return;
    }

    // 非管理员 → 显示"登录管理员账号"提示
    Admin.unlockMode = 'blocked';
    document.getElementById('unlockIcon').className = 'fas fa-user-shield';
    document.getElementById('unlockTitle').textContent = '需要管理员权限';
    document.getElementById('unlockDesc').textContent = '仅管理员可访问管理后台';
    document.getElementById('unlockPasswordGroup').style.display = 'none';
    document.getElementById('unlockSetPwGroup').style.display = 'none';
    document.getElementById('unlockLoginGroup').style.display = 'block';
    document.getElementById('adminUnlockBtn').style.display = 'none';
    document.getElementById('adminGoLoginBtn').addEventListener('click', () => {
      location.href = '/login.html?redirect=/admin.html';
    });

    // 若尚未设置管理员密码，提供首次设置入口
    try {
      const status = await API.getAuthStatus();
      if (!status.hasPassword) {
        Admin.unlockMode = 'setup';
        document.getElementById('unlockIcon').className = 'fas fa-key';
        document.getElementById('unlockTitle').textContent = '首次使用';
        document.getElementById('unlockDesc').textContent = '尚未设置管理员密码，请先设置一个管理密码';
        document.getElementById('unlockPasswordGroup').style.display = 'none';
        document.getElementById('unlockSetPwGroup').style.display = 'block';
        document.getElementById('unlockLoginGroup').style.display = 'none';
        document.getElementById('adminUnlockBtn').style.display = 'block';
      }
    } catch (e) {
      console.error('检查密码状态失败:', e);
    }

    Admin.bindEvents();
  },

  /**
   * 从 URL hash 中接收 token（用于跨端口跳转）
   * 形如 #token=xxx；读取后立即从地址栏抹掉，避免被分享或截图泄漏
   */
  adoptTokenFromHash() {
    const raw = String(location.hash || '').replace(/^#/, '');
    if (!raw) return;
    const matched = /(?:^|&)token=([^&]+)/.exec(raw);
    if (!matched) return;
    const token = decodeURIComponent(matched[1]);
    if (token && !API.getToken()) API.setToken(token);
    const rest = raw.replace(/(?:^|&)token=[^&]+/, '').replace(/^&/, '');
    try {
      history.replaceState(null, '', location.pathname + location.search + (rest ? '#' + rest : ''));
    } catch { /* 忽略 */ }
  },

  bindEvents() {
    // 解锁按钮
    document.getElementById('adminUnlockBtn')?.addEventListener('click', () => Admin.handleUnlock());
    document.getElementById('adminPasswordInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') Admin.handleUnlock();
    });
    document.getElementById('adminNewPwInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') Admin.handleUnlock();
    });
    document.getElementById('adminConfirmPwInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') Admin.handleUnlock();
    });

    // 密码管理
    document.getElementById('setPasswordBtn').addEventListener('click', () => Admin.handleSetPassword());
    document.getElementById('changePasswordBtn').addEventListener('click', () => Admin.handleChangePassword());
    document.getElementById('cancelPasswordBtn').addEventListener('click', () => Admin.handleCancelPassword());

    // 用户密码管理
    document.getElementById('setUserPasswordBtn').addEventListener('click', () => Admin.handleSetUserPassword());
    document.getElementById('changeUserPasswordBtn').addEventListener('click', () => Admin.handleChangeUserPassword());
    document.getElementById('cancelUserPasswordBtn').addEventListener('click', () => Admin.handleCancelUserPassword());

    // 数据管理
    document.getElementById('adminExportBtn').addEventListener('click', () => Admin.handleExport());
    document.getElementById('adminImportBtn').addEventListener('click', () => document.getElementById('adminImportFile').click());
    document.getElementById('adminImportFile').addEventListener('change', e => Admin.handleImport(e));
    document.getElementById('adminExportReportBtn').addEventListener('click', () => Admin.handleExportReport());

    // 设置管理
    document.getElementById('addSettingBtn').addEventListener('click', () => Admin.handleAddSetting());

    // 服务端口
    const savePortBtn = document.getElementById('adminSavePortBtn');
    if (savePortBtn) savePortBtn.addEventListener('click', () => Admin.handleSavePort());
    const resetPortBtn = document.getElementById('adminResetPortBtn');
    if (resetPortBtn) resetPortBtn.addEventListener('click', () => Admin.handleResetPort());
    const portInput = document.getElementById('adminPort');
    if (portInput) {
      portInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') Admin.handleSavePort();
      });
    }

    // 班级信息
    document.getElementById('adminSaveClassInfoBtn').addEventListener('click', () => Admin.handleSaveClassInfo());
    document.getElementById('adminClassName').addEventListener('keydown', e => {
      if (e.key === 'Enter') Admin.handleSaveClassInfo();
    });

    // 积分清零
    document.getElementById('adminResetAllPoints').addEventListener('click', () => Admin.handleResetAllPoints());

    // 删除所有学生
    document.getElementById('adminDeleteAllStudents').addEventListener('click', () => Admin.handleDeleteAllStudents());

    // 规则管理
    document.getElementById('adminAddRuleBtn').addEventListener('click', () => Admin.handleAddRule());
    document.getElementById('adminRuleName').addEventListener('keydown', e => {
      if (e.key === 'Enter') Admin.handleAddRule();
    });
    document.getElementById('adminRulePoints').addEventListener('keydown', e => {
      if (e.key === 'Enter') Admin.handleAddRule();
    });
    const ruleTypeEl = document.getElementById('adminRuleType');
    if (ruleTypeEl) {
      ruleTypeEl.addEventListener('change', () => Admin.toggleRuleTypeFields(ruleTypeEl.value));
    }
    const rulePresetsEl = document.getElementById('adminRulePresets');
    if (rulePresetsEl) {
      rulePresetsEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') Admin.handleAddRule();
      });
    }

    // 学生管理
    document.getElementById('adminAddStudentBtn').addEventListener('click', () => Admin.handleAddStudent());
    document.getElementById('adminStudentNames').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.ctrlKey) Admin.handleAddStudent();
    });

    // 小组管理
    document.getElementById('adminAddGroupBtn').addEventListener('click', () => Admin.handleAddGroup());
    document.getElementById('adminGroupName').addEventListener('keydown', e => {
      if (e.key === 'Enter') Admin.handleAddGroup();
    });

    // 商店管理
    document.getElementById('adminAddItemBtn').addEventListener('click', () => Admin.handleAddItem());
    document.getElementById('adminItemName').addEventListener('keydown', e => {
      if (e.key === 'Enter') Admin.handleAddItem();
    });
    document.getElementById('adminItemCost').addEventListener('keydown', e => {
      if (e.key === 'Enter') Admin.handleAddItem();
    });
    document.getElementById('adminItemStock').addEventListener('keydown', e => {
      if (e.key === 'Enter') Admin.handleAddItem();
    });

    // 设置默认日期范围（本月）
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    document.getElementById('reportStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('reportEndDate').value = now.toISOString().split('T')[0];

    // 版本更新
    document.getElementById('checkUpdateBtn')?.addEventListener('click', () => Admin.handleCheckUpdate());
    document.getElementById('applyUpdateBtn')?.addEventListener('click', () => {
      // 自动重启超时后，同一按钮切换为「手动重启服务」
      if (Admin.applyBtnMode === 'restart') {
        Admin.handleManualRestart();
      } else {
        Admin.handleApplyUpdate();
      }
    });
    const proxyCheckbox = document.getElementById('updateUseProxy');
    if (proxyCheckbox) {
      proxyCheckbox.checked = Admin.getProxyPref();
      proxyCheckbox.addEventListener('change', () => {
        Admin.setProxyPref(proxyCheckbox.checked);
        if (Admin.latestRelease) Admin.renderUpdateResult(Admin.latestRelease);
      });
    }
  },

  async handleUnlock() {
    if (Admin.unlockMode === 'setup') {
      // 设置密码模式
      const pw = document.getElementById('adminNewPwInput').value;
      const confirm = document.getElementById('adminConfirmPwInput').value;
      if (!pw) { Admin.showError('请输入新密码'); return; }
      if (pw.length < 4) { Admin.showError('密码至少 4 个字符'); return; }
      if (pw !== confirm) { Admin.showError('两次输入的密码不一致'); return; }

      document.getElementById('unlockError').style.display = 'none';
      try {
        const res = await API.setPassword(pw);
        if (res.success) {
          if (res.token) API.setToken(res.token);
          Admin.unlocked = true;
          document.getElementById('unlockOverlay').style.display = 'none';
          document.getElementById('adminContent').style.display = 'block';
          document.getElementById('adminBadge').innerHTML = '<i class="fas fa-unlock"></i> 已验证';
          document.getElementById('adminBadge').style.background = 'var(--accent2)';
          Admin.loadData();
        } else {
          Admin.showError('设置密码失败');
        }
      } catch (err) {
        Admin.showError('设置失败: ' + (err.message || err));
      }
      return;
    }

    // 解锁模式
    const pw = document.getElementById('adminPasswordInput').value;
    if (!pw) { Admin.showError('请输入密码'); return; }

    document.getElementById('unlockError').style.display = 'none';

    try {
      const res = await API.verifyPassword(pw);
      if (res.success) {
        if (res.token) API.setToken(res.token);
        Admin.unlocked = true;
        document.getElementById('unlockOverlay').style.display = 'none';
        document.getElementById('adminContent').style.display = 'block';
        document.getElementById('adminBadge').innerHTML = '<i class="fas fa-unlock"></i> 已验证';
        document.getElementById('adminBadge').style.background = 'var(--accent2)';
        Admin.loadData();
      } else {
        Admin.showError('密码错误');
      }
    } catch (err) {
      Admin.showError('验证失败: ' + (err.message || err));
    }
  },

  showError(msg) {
    const el = document.getElementById('unlockError');
    el.textContent = msg;
    el.style.display = 'block';
  },

  async loadData() {
    document.getElementById('loadingOverlay').style.display = 'flex';
    try {
      await Promise.all([
        Admin.loadStats(),
        Admin.loadPasswordStatus(),
        Admin.loadSettings(),
        Admin.loadSystemInfo(),
        Admin.loadRules(),
        Admin.loadShopItems(),
        Admin.loadStudents(),
        Admin.loadGroups(),
        Admin.loadClassInfo(),
        Admin.loadLocalVersion(),
        Admin.loadServerPort()
      ]);
      Admin.renderRules();
      Admin.renderShop();
      Admin.renderStudents();
      Admin.renderGroups();
      Admin.setupRulesDragDrop();
    } catch (err) {
      console.error('加载数据失败:', err);
    }
    document.getElementById('loadingOverlay').style.display = 'none';
  },

  async loadClassInfo() {
    try {
      const settings = await API.request('GET', '/api/admin/settings');
      document.getElementById('adminClassName').value = settings.class_name || '';
    } catch (err) {
      console.error('加载班级信息失败:', err);
    }
  },

  // ==================== 统计 ====================

  async loadStats() {
    try {
      const stats = await API.request('GET', '/api/admin/stats');

      document.getElementById('statStudents').textContent = stats.students.total;
      document.getElementById('statStudentsSub').textContent = `♂ ${stats.students.male} · ♀ ${stats.students.female}`;
      document.getElementById('statGroups').textContent = stats.groups.total;
      document.getElementById('statRules').textContent = stats.rules.total;
      document.getElementById('statRulesSub').textContent = `+${stats.rules.positive} / ${stats.rules.negative}`;
      document.getElementById('statShop').textContent = stats.shop.total;
      document.getElementById('statTotalPoints').textContent = stats.totalPoints;
      document.getElementById('statHistory').textContent = stats.totalHistory;
      document.getElementById('statHealth').innerHTML = '<span style="font-size:16px;color:var(--accent2);">✓ 运行中</span>';

      // 服务器时间
      try {
        const health = await API.request('GET', '/api/health');
        document.getElementById('statServerTime').textContent = new Date(health.time).toLocaleString('zh-CN');
      } catch (e) {
        document.getElementById('statServerTime').textContent = '获取失败';
      }

      // 序列信息
      if (stats.sequences) {
        const seq = stats.sequences;
        document.getElementById('seqInfo').textContent =
          `学生=${seq.students}, 小组=${seq.groups}, 规则=${seq.rules}, 商品=${seq.shopItems}, 历史=${seq.history}`;
      }
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  },

  // ==================== 密码管理 ====================

  async loadPasswordStatus() {
    try {
      const res = await API.getAuthStatus();
      const el = document.getElementById('passwordStatus');
      if (res.hasPassword) {
        el.innerHTML = '<i class="fas fa-check-circle" style="color:var(--accent2);"></i> 已设置管理员密码保护';
      } else {
        el.innerHTML = '<i class="fas fa-exclamation-circle" style="color:var(--accent1);"></i> 未设置管理员密码';
      }
      // 用户密码状态
      const userEl = document.getElementById('userPasswordStatus');
      if (userEl) {
        if (res.hasUserPassword) {
          userEl.innerHTML = '<i class="fas fa-check-circle" style="color:var(--accent2);"></i> 已设置用户密码（用户可加减分，不可访问后台）';
        } else {
          userEl.innerHTML = '<i class="fas fa-exclamation-circle" style="color:var(--accent1);"></i> 未设置用户密码（用户无法登录）';
        }
      }
    } catch (err) {
      console.error('加载密码状态失败:', err);
    }
  },

  async handleSetUserPassword() {
    const newPw = document.getElementById('newUserPassword').value;
    if (!newPw) { UI.alert('请输入新用户密码'); return; }
    try {
      const res = await API.setUserPassword(newPw);
      if (res.success) {
        UI.alert('用户密码设置成功！');
        document.getElementById('newUserPassword').value = '';
        Admin.loadPasswordStatus();
      }
    } catch (err) {
      UI.alert('设置失败: ' + (err.message || err));
    }
  },

  async handleChangeUserPassword() {
    const newPw = document.getElementById('newUserPassword').value;
    if (!newPw) { UI.alert('请输入新用户密码'); return; }
    try {
      const res = await API.changeUserPassword(newPw);
      if (res.success) {
        UI.alert('用户密码修改成功！');
        document.getElementById('newUserPassword').value = '';
        Admin.loadPasswordStatus();
      }
    } catch (err) {
      UI.alert('修改失败: ' + (err.message || err));
    }
  },

  async handleCancelUserPassword() {
    UI.confirm('取消用户密码', '确定要取消用户密码吗？用户将无法通过用户密码登录。', async () => {
      try {
        const res = await API.cancelUserPassword();
        if (res.success) {
          UI.alert('已取消用户密码！');
          Admin.loadPasswordStatus();
        }
      } catch (err) {
        UI.alert('取消失败: ' + (err.message || err));
      }
    });
  },

  async handleSetPassword() {
    const newPw = document.getElementById('newPassword').value;
    if (!newPw) { UI.alert('请输入新密码'); return; }
    try {
      const res = await API.setPassword(newPw);
      if (res.success) {
        if (res.token) API.setToken(res.token);
        UI.alert('密码设置成功！');
        document.getElementById('newPassword').value = '';
        Admin.loadPasswordStatus();
      }
    } catch (err) {
      UI.alert('设置失败: ' + (err.message || err));
    }
  },

  async handleChangePassword() {
    const newPw = document.getElementById('newPassword').value;
    if (!newPw) { UI.alert('请输入新密码'); return; }
    try {
      const res = await API.changePassword(newPw);
      if (res.success) {
        UI.alert('密码修改成功！');
        document.getElementById('newPassword').value = '';
        Admin.loadPasswordStatus();
      }
    } catch (err) {
      UI.alert('修改失败: ' + (err.message || err));
    }
  },

  async handleCancelPassword() {
    UI.confirm('取消密码保护', '确定要取消密码保护吗？任何人都可以访问此系统。', async () => {
      try {
        const res = await API.cancelPassword();
        if (res.success) {
          UI.alert('已取消密码保护！');
          Admin.loadPasswordStatus();
        }
      } catch (err) {
        UI.alert('取消失败: ' + (err.message || err));
      }
    });
  },

  // ==================== 数据管理 ====================

  async handleExport() {
    try {
      const data = await API.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `class-data-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      UI.alert('导出失败: ' + (err.message || err));
    }
  },

  async handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      UI.confirm('导入数据', `确定要导入数据吗？当前所有数据将被替换！<br>文件大小: ${(text.length / 1024).toFixed(1)}KB`, async () => {
        try {
          await API.importData(data);
          UI.alert('数据导入成功！');
          Admin.loadData();
        } catch (err) {
          UI.alert('导入失败: ' + (err.message || err));
        }
      });
    } catch (err) {
      UI.alert('导入失败: ' + (err.message || err));
    }
    e.target.value = '';
  },

  async handleExportReport() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    if (!startDate || !endDate) { UI.alert('请选择日期范围'); return; }

    try {
      const report = await API.exportReport(startDate, endDate);
      Admin.downloadExcelReport(report, startDate, endDate);
    } catch (err) {
      UI.alert('导出报表失败: ' + (err.message || err));
    }
  },

  downloadExcelReport(report, startDate, endDate) {
    if (typeof XLSX === 'undefined') {
      UI.alert('XLSX 库未加载，请检查网络连接');
      return;
    }

    // 学生明细表
    const studentRows = report.studentStats.map((s, i) => ({
      '排名': i + 1,
      '姓名': s.name,
      '净积分': s.netPoints,
      '加分': s.positivePoints,
      '减分': s.negativePoints,
      '操作次数': s.history.length
    }));

    const ws1 = XLSX.utils.json_to_sheet(studentRows);
    ws1['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];

    // 小组明细表
    const groupRows = (report.groupStats || []).map(g => ({
      '小组名称': g.name,
      '净积分': g.netPoints,
      '加分': g.positivePoints,
      '减分': g.negativePoints,
      '成员数': g.memberCount
    }));

    const ws2 = XLSX.utils.json_to_sheet(groupRows);
    ws2['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, '学生积分明细');
    XLSX.utils.book_append_sheet(wb, ws2, '小组积分明细');

    XLSX.writeFile(wb, `积分报表_${startDate}_至_${endDate}.xlsx`);
  },

  // ==================== 设置管理 ====================

  async loadSettings() {
    try {
      const settings = await API.request('GET', '/api/admin/settings');
      const container = document.getElementById('settingsList');

      const keys = Object.keys(settings);
      if (keys.length === 0) {
        container.innerHTML = '<p style="color:var(--text-light);">暂无自定义设置</p>';
        return;
      }

      // 过滤掉系统内部键（密码哈希、端口、初始化标记等，已有独立 UI）
      const SYSTEM_KEYS = [
        'app_password_hash', 'user_password_hash', 'school_name',
        'port', 'setup_completed', 'setup_completed_at'
      ];
      let html = '<table class="settings-table"><thead><tr><th>键名</th><th>值</th><th>操作</th></tr></thead><tbody>';
      for (const key of keys) {
        if (SYSTEM_KEYS.includes(key)) continue;
        let val = settings[key];
        if (typeof val === 'object') val = JSON.stringify(val);
        html += `<tr>
          <td><code>${key}</code></td>
          <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">${val}</td>
          <td><button class="btn btn-sm btn-danger" onclick="Admin.handleDeleteSetting('${key}')"><i class="fas fa-trash"></i></button></td>
        </tr>`;
      }
      html += '</tbody></table>';
      container.innerHTML = html;
    } catch (err) {
      console.error('加载设置失败:', err);
    }
  },

  async handleAddSetting() {
    const key = document.getElementById('settingKey').value.trim();
    const value = document.getElementById('settingValue').value.trim();
    if (!key) { UI.alert('请输入设置键名'); return; }

    try {
      const data = await API.request('PUT', `/api/admin/settings/${encodeURIComponent(key)}`, { value });
      if (data.success) {
        document.getElementById('settingKey').value = '';
        document.getElementById('settingValue').value = '';
        Admin.loadSettings();
      } else {
        UI.alert('添加失败: ' + (data.error || '未知错误'));
      }
    } catch (err) {
      UI.alert('添加失败: ' + (err.message || err));
    }
  },

  async handleDeleteSetting(key) {
    UI.confirm('删除设置', `确定删除设置 "${key}" 吗？`, async () => {
      try {
        const data = await API.request('DELETE', `/api/admin/settings/${encodeURIComponent(key)}`);
        if (data.success) Admin.loadSettings();
      } catch (err) {
        UI.alert('删除失败: ' + (err.message || err));
      }
    });
  },

  async handleSaveClassInfo() {
    const className = document.getElementById('adminClassName').value.trim();
    const statusEl = document.getElementById('classInfoStatus');

    try {
      await API.request('PUT', '/api/admin/settings/class_name', { value: className });
      statusEl.style.display = 'flex';
      statusEl.innerHTML = '<i class="fas fa-check-circle" style="color:var(--accent2);"></i> 班级信息已保存！';
      setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
    } catch (err) {
      statusEl.style.display = 'flex';
      statusEl.innerHTML = '<i class="fas fa-exclamation-circle" style="color:var(--primary);"></i> 保存失败: ' + (err.message || err);
    }
  },

  // ==================== 危险操作 ====================

  async handleResetAllPoints() {
    UI.confirm('积分清零', '⚠️ 确定要将所有学生的积分和历史记录清零吗？此操作不可撤销！', () => {
      UI.confirm('二次确认', '这将清除所有学生的积分和积分历史记录，确定继续吗？', async () => {
        try {
          const res = await API.resetAllPoints();
          UI.alert(res.message || '积分已清零！');
          Admin.loadData();
        } catch (err) {
          UI.alert('清零失败: ' + (err.message || err));
        }
      });
    });
  },

  async handleDeleteAllStudents() {
    UI.confirm('删除所有数据', '⚠️ 此操作将删除所有学生数据和小组数据，不可恢复！', () => {
      UI.confirm('二次确认', '确定要删除所有学生和小组数据吗？', async () => {
        try {
          await API.deleteAllStudents();
          // 删除所有小组
          const groups = await API.getGroups();
          for (const g of groups) await API.deleteGroup(g.id);
          UI.alert('已删除所有学生和小组数据！');
          Admin.loadData();
        } catch (err) {
          UI.alert('删除失败: ' + (err.message || err));
        }
      });
    });
  },

  // ==================== 规则管理 ====================

  async loadRules() {
    try {
      Admin.rules = await API.getRules();
    } catch (err) {
      console.error('加载规则失败:', err);
    }
  },

  renderRules() {
    const el = document.getElementById('adminRulesList');
    if (!el) return;
    el.innerHTML = '';
    Admin.rules.forEach(rule => {
      const type = Admin.ruleType(rule);
      const isCustom = type !== 'fixed';
      const positive = Admin.ruleIsPositive(rule);
      const item = document.createElement('div');
      item.className = `rule-item ${positive ? 'positive' : 'negative'}`;
      item.dataset.id = rule.id;
      item.draggable = true;
      const typeLabel = Admin.ruleTypeLabel(type);
      const valueHtml = isCustom
        ? `<span class="rule-custom-badge"><i class="fas fa-sliders-h"></i> ${typeLabel}</span>`
        : `${positive ? '+' : ''}${rule.points}`;
      item.innerHTML = `
        <span class="rule-drag-handle"><i class="fas fa-grip-vertical"></i></span>
        <div class="rule-text">${rule.name}${isCustom ? `<span class="rule-presets-hint">推荐: ${Admin.rulePresets(rule).join(', ')}</span>` : ''}</div>
        <div class="rule-points ${positive ? 'positive' : 'negative'}">${valueHtml}</div>
        <div class="rule-actions">
          <button class="btn btn-icon btn-secondary edit-rule-btn" data-id="${rule.id}" title="编辑规则"><i class="fas fa-edit"></i></button>
          <button class="btn btn-icon btn-danger delete-rule-btn" data-id="${rule.id}" title="删除规则"><i class="fas fa-trash"></i></button>
        </div>`;
      el.appendChild(item);
    });
    // 绑定事件
    el.querySelectorAll('.edit-rule-btn').forEach(btn => {
      btn.onclick = () => Admin.showEditRuleModal(parseInt(btn.dataset.id));
    });
    el.querySelectorAll('.delete-rule-btn').forEach(btn => {
      btn.onclick = () => {
        const rule = Admin.rules.find(r => r.id === parseInt(btn.dataset.id));
        UI.confirm('删除规则', `确定要删除规则「${rule ? rule.name : ''}」吗？`, async () => {
          await API.deleteRule(parseInt(btn.dataset.id));
          await Admin.loadRules();
          Admin.renderRules();
        });
      };
    });
  },

  /** 规则类型（缺省/非法 → fixed） */
  ruleType(rule) {
    const t = rule && rule.type;
    return ['fixed', 'custom-add', 'custom-minus', 'custom-both'].includes(t) ? t : 'fixed';
  },

  ruleTypeLabel(type) {
    return ({
      'fixed': '固定分值',
      'custom-add': '自定义加分',
      'custom-minus': '自定义减分',
      'custom-both': '自定义加减分'
    })[type] || '固定分值';
  },

  ruleIsPositive(rule) {
    const t = Admin.ruleType(rule);
    if (t === 'custom-minus') return false;
    if (t === 'custom-add' || t === 'custom-both') return true;
    return (Number(rule && rule.points) || 0) >= 0;
  },

  rulePresets(rule) {
    const list = Array.isArray(rule && rule.presets) ? rule.presets : [];
    const out = [];
    for (const p of list) {
      const n = Math.abs(parseInt(p, 10));
      if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
    }
    out.sort((a, b) => a - b);
    return out.length ? out.slice(0, 8) : [1, 2, 3, 4];
  },

  /** 解析推荐分数字符串（逗号/空格分隔） */
  parsePresets(value) {
    const raw = String(value || '').split(/[,，\s]+/).filter(Boolean);
    const out = [];
    for (const item of raw) {
      const n = Math.abs(parseInt(item, 10));
      if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
    }
    out.sort((a, b) => a - b);
    return out.slice(0, 8);
  },

  /** 切换「分值 / 推荐分数」输入组的显隐 */
  toggleRuleTypeFields(type) {
    const isFixed = (type || 'fixed') === 'fixed';
    const pointsGroup = document.getElementById('adminRulePointsGroup');
    const presetsGroup = document.getElementById('adminRulePresetsGroup');
    if (pointsGroup) pointsGroup.style.display = isFixed ? '' : 'none';
    if (presetsGroup) presetsGroup.style.display = isFixed ? 'none' : '';
  },

  async handleAddRule() {
    const name = document.getElementById('adminRuleName').value.trim();
    const typeEl = document.getElementById('adminRuleType');
    const type = typeEl ? typeEl.value : 'fixed';
    if (!name) { UI.alert('请填写规则名称'); return; }

    let points = 0;
    let presets;
    if (type === 'fixed') {
      points = parseInt(document.getElementById('adminRulePoints').value, 10);
      if (isNaN(points)) { UI.alert('请填写有效分值'); return; }
    } else {
      const presetsEl = document.getElementById('adminRulePresets');
      presets = Admin.parsePresets(presetsEl ? presetsEl.value : '');
      if (!presets.length) { UI.alert('请填写至少一个推荐分数'); return; }
    }

    try {
      await API.addRule(name, points, { type, presets });
      document.getElementById('adminRuleName').value = '';
      const pointsEl = document.getElementById('adminRulePoints');
      if (pointsEl) pointsEl.value = '';
      const presetsEl = document.getElementById('adminRulePresets');
      if (presetsEl) presetsEl.value = '';
      await Admin.loadRules();
      Admin.renderRules();
    } catch (err) {
      UI.alert('添加规则失败: ' + (err.message || err));
    }
  },

  showEditRuleModal(ruleId) {
    const rule = Admin.rules.find(r => r.id === ruleId);
    if (!rule) return;
    const type = Admin.ruleType(rule);
    const isFixed = type === 'fixed';
    const typeOptions = ['fixed', 'custom-add', 'custom-minus', 'custom-both']
      .map(t => `<option value="${t}"${t === type ? ' selected' : ''}>${Admin.ruleTypeLabel(t)}</option>`)
      .join('');
    const html = `<h3>编辑规则</h3>
      <div class="form-group"><label class="form-label">规则名称:</label><input type="text" id="editRuleName" class="form-control" value="${Admin.escapeHtml ? Admin.escapeHtml(rule.name) : rule.name}"></div>
      <div class="form-group"><label class="form-label">规则类型:</label><select id="editRuleType" class="form-control">${typeOptions}</select></div>
      <div class="form-group" id="editRulePointsGroup" style="${isFixed ? '' : 'display:none;'}"><label class="form-label">分值（正数加分，负数减分）:</label><input type="number" id="editRulePoints" class="form-control" value="${rule.points}"></div>
      <div class="form-group" id="editRulePresetsGroup" style="${isFixed ? 'display:none;' : ''}"><label class="form-label">推荐分数（逗号分隔）:</label><input type="text" id="editRulePresets" class="form-control" value="${Admin.rulePresets(rule).join(',')}"></div>
      <div class="modal-footer"><button id="saveRuleChanges" class="btn btn-primary">保存</button></div>`;

    if (typeof UI !== 'undefined' && UI.openModal) {
      UI.openModal(html, '编辑规则');
    } else {
      const newName = prompt('规则名称:', rule.name);
      if (!newName) return;
      const newPoints = parseInt(prompt('分值:', rule.points), 10);
      if (isNaN(newPoints)) return;
      Admin.saveEditRule(ruleId, newName, newPoints, 'fixed', undefined);
      return;
    }

    const typeEl = document.getElementById('editRuleType');
    typeEl.onchange = () => {
      const fixed = typeEl.value === 'fixed';
      document.getElementById('editRulePointsGroup').style.display = fixed ? '' : 'none';
      document.getElementById('editRulePresetsGroup').style.display = fixed ? 'none' : '';
    };

    document.getElementById('saveRuleChanges').onclick = () => {
      const name = document.getElementById('editRuleName').value.trim();
      const newType = typeEl.value;
      if (!name) { UI.alert('请输入规则名称！'); return; }
      let points = 0;
      let presets;
      if (newType === 'fixed') {
        points = parseInt(document.getElementById('editRulePoints').value, 10);
        if (isNaN(points)) { UI.alert('请输入有效分值！'); return; }
      } else {
        presets = Admin.parsePresets(document.getElementById('editRulePresets').value);
        if (!presets.length) { UI.alert('请填写至少一个推荐分数！'); return; }
      }
      Admin.saveEditRule(ruleId, name, points, newType, presets);
    };
  },

  async saveEditRule(ruleId, name, points, type, presets) {
    try {
      const payload = { name, type: type || 'fixed' };
      if (payload.type === 'fixed') payload.points = points;
      else payload.presets = presets;
      await API.updateRule(ruleId, payload);
      await Admin.loadRules();
      Admin.renderRules();
      if (typeof UI !== 'undefined' && UI.closeModal) UI.closeModal();
    } catch (err) {
      UI.alert('保存失败: ' + (err.message || err));
    }
  },

  // ==================== 商店管理 ====================

  async loadShopItems() {
    try {
      Admin.shopItems = await API.getShopItems();
    } catch (err) {
      console.error('加载商品失败:', err);
    }
  },

  renderShop() {
    const el = document.getElementById('adminShopItems');
    if (!el) return;
    el.innerHTML = '';
    Admin.shopItems.forEach(item => {
      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML = `
        <button class="edit-shop-item-btn" data-id="${item.id}" title="编辑商品"><i class="fas fa-edit"></i></button>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-cost">${item.cost} 积分</div>
        <div class="shop-item-stock">库存: ${item.stock}</div>
        <div class="shop-item-actions">
          <button class="btn btn-sm btn-danger delete-item-btn" data-id="${item.id}"><i class="fas fa-trash"></i> 删除</button>
        </div>`;
      el.appendChild(div);
    });
    el.querySelectorAll('.edit-shop-item-btn').forEach(btn => {
      btn.onclick = () => Admin.showEditShopItemModal(parseInt(btn.dataset.id));
    });
    el.querySelectorAll('.delete-item-btn').forEach(btn => {
      btn.onclick = () => {
        const item = Admin.shopItems.find(i => i.id === parseInt(btn.dataset.id));
        UI.confirm('删除商品', `确定要删除商品「${item ? item.name : ''}」吗？`, async () => {
          await API.deleteShopItem(parseInt(btn.dataset.id));
          await Admin.loadShopItems();
          Admin.renderShop();
        });
      };
    });
  },

  async handleAddItem() {
    const name = document.getElementById('adminItemName').value.trim();
    const cost = parseInt(document.getElementById('adminItemCost').value);
    const stock = parseInt(document.getElementById('adminItemStock').value);
    if (!name || isNaN(cost) || isNaN(stock)) { UI.alert('请填写完整的商品信息'); return; }
    try {
      await API.addShopItem(name, cost, stock);
      document.getElementById('adminItemName').value = '';
      document.getElementById('adminItemCost').value = '';
      document.getElementById('adminItemStock').value = '';
      await Admin.loadShopItems();
      Admin.renderShop();
    } catch (err) {
      UI.alert('添加商品失败: ' + (err.message || err));
    }
  },

  showEditShopItemModal(itemId) {
    const item = Admin.shopItems.find(i => i.id === itemId);
    if (!item) return;
    const html = `<h3>编辑商品</h3>
      <div class="form-group"><label class="form-label">商品名称:</label><input type="text" id="editItemName" class="form-control" value="${item.name}"></div>
      <div class="form-group"><label class="form-label">所需积分:</label><input type="number" id="editItemCost" class="form-control" value="${item.cost}"></div>
      <div class="form-group"><label class="form-label">库存:</label><input type="number" id="editItemStock" class="form-control" value="${item.stock}"></div>
      <div class="modal-footer"><button id="saveItemChanges" class="btn btn-primary">保存</button></div>`;
    if (typeof UI !== 'undefined' && UI.openModal) {
      UI.openModal(html);
    } else {
      const newName = prompt('商品名称:', item.name);
      if (!newName) return;
      const newCost = parseInt(prompt('所需积分:', item.cost));
      if (isNaN(newCost)) return;
      const newStock = parseInt(prompt('库存数量:', item.stock));
      if (isNaN(newStock)) return;
      Admin.saveEditShopItem(itemId, newName, newCost, newStock);
      return;
    }
    document.getElementById('saveItemChanges').onclick = () => {
      const name = document.getElementById('editItemName').value.trim();
      const cost = parseInt(document.getElementById('editItemCost').value);
      const stock = parseInt(document.getElementById('editItemStock').value);
      if (!name || isNaN(cost) || isNaN(stock)) { UI.alert('请输入有效的信息！'); return; }
      Admin.saveEditShopItem(itemId, name, cost, stock);
    };
  },

  async saveEditShopItem(itemId, name, cost, stock) {
    try {
      await API.updateShopItem(itemId, { name, cost, stock });
      await Admin.loadShopItems();
      Admin.renderShop();
      if (typeof UI !== 'undefined' && UI.closeModal) UI.closeModal();
    } catch (err) {
      UI.alert('保存失败: ' + (err.message || err));
    }
  },

  // ==================== 学生管理 ====================

  async loadStudents() {
    try {
      Admin.students = await API.getStudents();
    } catch (err) {
      console.error('加载学生列表失败:', err);
    }
  },

  renderStudents() {
    const el = document.getElementById('adminStudentsList');
    if (!el) return;

    if (!Admin.students.length) {
      el.innerHTML = '<div class="admin-student-empty">暂无学生，请添加</div>';
      return;
    }

    el.innerHTML = Admin.students.map(s => `
      <div class="admin-student-item" data-id="${s.id}">
        <div class="admin-student-avatar ${s.gender}">${(s.name || '?').charAt(0)}</div>
        <span class="admin-student-name">${s.name}</span>
        <span class="admin-student-points">${s.total_points || 0} 分</span>
        <button class="admin-student-delete-btn" data-id="${s.id}" title="删除学生"><i class="fas fa-times"></i></button>
      </div>
    `).join('');

    // 绑定删除事件
    el.querySelectorAll('.admin-student-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const student = Admin.students.find(s => s.id === id);
        if (!student) return;
        UI.confirm('删除学生', `确定要删除学生「${student.name}」吗？此操作不可撤销！`, async () => {
          try {
            await API.deleteStudent(id);
            await Admin.loadStudents();
            Admin.renderStudents();
            // 刷新统计
            Admin.loadStats();
          } catch (err) {
            UI.alert('删除失败: ' + (err.message || err));
          }
        });
      });
    });
  },

  async handleAddStudent() {
    const text = document.getElementById('adminStudentNames').value.trim();
    const gender = document.querySelector('input[name="adminGender"]:checked')?.value || 'male';
    if (!text) { UI.alert('请输入学生姓名'); return; }
    const names = text.split('\n').filter(n => n.trim());
    if (!names.length) { UI.alert('请输入有效的学生姓名'); return; }
    try {
      await API.addStudents(names, gender);
      document.getElementById('adminStudentNames').value = '';
      await Admin.loadStudents();
      Admin.renderStudents();
      Admin.loadStats();
    } catch (err) {
      UI.alert('添加失败: ' + (err.message || err));
    }
  },

  // ==================== 小组管理 ====================

  async loadGroups() {
    try {
      Admin.groups = await API.getGroups();
    } catch (err) {
      console.error('加载小组失败:', err);
    }
  },

  renderGroups() {
    const el = document.getElementById('adminGroupsList');
    if (!el) return;

    if (!Admin.groups.length) {
      el.innerHTML = '<div class="admin-student-empty">暂无小组，请添加</div>';
      return;
    }

    el.innerHTML = Admin.groups.map(g => `
      <div class="admin-student-item" data-id="${g.id}">
        <div class="admin-student-avatar" style="background:var(--secondary);"><i class="fas fa-users"></i></div>
        <span class="admin-student-name">${g.name}</span>
        <button class="admin-student-delete-btn" data-id="${g.id}" title="删除小组"><i class="fas fa-times"></i></button>
      </div>
    `).join('');

    // 绑定删除事件
    el.querySelectorAll('.admin-student-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const group = Admin.groups.find(g => g.id === id);
        if (!group) return;
        UI.confirm('删除小组', `确定要删除小组「${group.name}」吗？组内学生将返回未分组状态。`, async () => {
          try {
            await API.deleteGroup(id);
            await Admin.loadGroups();
            Admin.renderGroups();
            Admin.loadStats();
          } catch (err) {
            UI.alert('删除失败: ' + (err.message || err));
          }
        });
      });
    });
  },

  async handleAddGroup() {
    const name = document.getElementById('adminGroupName').value.trim();
    if (!name) { UI.alert('请输入小组名称'); return; }
    try {
      await API.addGroup(name);
      document.getElementById('adminGroupName').value = '';
      await Admin.loadGroups();
      Admin.renderGroups();
      Admin.loadStats();
    } catch (err) {
      UI.alert('添加失败: ' + (err.message || err));
    }
  },

  setupRulesDragDrop() {
    const rulesList = document.getElementById('adminRulesList');
    if (!rulesList) return;
    let draggedRule = null;

    rulesList.addEventListener('dragstart', e => {
      if (e.target.closest('.rule-item')) {
        draggedRule = e.target.closest('.rule-item');
        setTimeout(() => draggedRule.classList.add('dragging'), 0);
      }
    });

    rulesList.addEventListener('dragend', async () => {
      if (draggedRule) {
        draggedRule.classList.remove('dragging');
        const items = [...document.querySelectorAll('#adminRulesList .rule-item')];
        const order = items.map((item, i) => ({
          id: parseInt(item.dataset.id),
          sort_order: i + 1
        }));
        try {
          await API.reorderRules(order);
          await Admin.loadRules();
          Admin.renderRules();
        } catch (err) {
          console.error('规则排序保存失败:', err);
        }
        draggedRule = null;
      }
    });

    rulesList.addEventListener('dragover', e => {
      e.preventDefault();
      if (!draggedRule) return;
      const afterElement = Admin.getDragAfterElement(rulesList, e.clientY);
      if (afterElement == null) {
        rulesList.appendChild(draggedRule);
      } else {
        rulesList.insertBefore(draggedRule, afterElement);
      }
    });
  },

  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.rule-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  },

  // ==================== 服务端口 ====================

  /** 当前服务端口（未确认前不变） */
  serverPort: null,

  /** 读取并回填当前服务端口 */
  async loadServerPort() {
    const input = document.getElementById('adminPort');
    const hint = document.getElementById('adminPortHint');
    try {
      const info = await API.getServerPort();
      Admin.serverPort = info.port;
      if (input) {
        input.value = info.port;
        input.placeholder = `默认 ${info.defaultPort}`;
      }
      if (hint) {
        hint.innerHTML = info.envLocked
          ? `<i class="fas fa-circle-info"></i> 当前端口 <strong>${info.port}</strong> 来自启动参数 <code>PORT=${info.envPort}</code>。在此保存会写入配置文件并以新端口重启，之后以配置文件为准。`
          : `<i class="fas fa-circle-info"></i> 当前端口 <strong>${info.port}</strong>。修改后服务会自动重启，当前页需要跳转到新端口。端口范围 1024 ~ 65535。`;
      }
    } catch (err) {
      console.error('加载服务端口失败:', err);
      if (hint) hint.textContent = '无法读取当前端口，请检查服务状态。';
    }
  },

  /** 端口提示信息 */
  setPortStatus(msg, type) {
    const el = document.getElementById('portStatus');
    if (!el) return;
    if (!msg) { el.style.display = 'none'; el.innerHTML = ''; return; }
    const icon = type === 'error' ? 'fa-exclamation-circle'
      : type === 'loading' ? 'fa-circle-notch fa-spin'
      : 'fa-check-circle';
    const color = type === 'error' ? 'var(--primary)' : type === 'loading' ? 'var(--text-light)' : 'var(--accent2)';
    el.style.display = 'flex';
    el.innerHTML = `<i class="fas ${icon}" style="color:${color};"></i> <span>${Admin.escapeHtml(msg)}</span>`;
  },

  /** 保存端口（端口变化时后端自动重启，前端轮询新端口） */
  async handleSavePort() {
    const input = document.getElementById('adminPort');
    const btn = document.getElementById('adminSavePortBtn');
    if (!input) return;

    const raw = String(input.value || '').trim();
    const port = parseInt(raw, 10);
    if (!raw || !Number.isFinite(port) || port < 1024 || port > 65535) {
      Admin.setPortStatus('端口需在 1024 ~ 65535 之间', 'error');
      return;
    }
    if (port === Admin.serverPort) {
      Admin.setPortStatus('端口未变化，无需保存', 'ok');
      setTimeout(() => Admin.setPortStatus(''), 3000);
      return;
    }

    UI.confirm('修改服务端口', `确定将服务端口从 ${Admin.serverPort} 改为 ${port} 吗？服务会立即重启，当前页面将跳转到新端口。`, async () => {
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> 保存中…'; }
      Admin.setPortStatus('正在保存端口…', 'loading');
      try {
        const res = await API.setServerPort(port);
        Admin.serverPort = res.port;
        if (!res.portChanged) {
          Admin.setPortStatus('端口未变化', 'ok');
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> 保存端口'; }
          return;
        }
        Admin.setPortStatus(`端口已改为 ${res.port}，服务正在重启…`, 'loading');
        await Admin.waitForPortChange(res.port);
      } catch (err) {
        Admin.setPortStatus('保存失败: ' + (err.message || err), 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> 保存端口'; }
      }
    });
  },

  /** 恢复默认端口 4000 */
  async handleResetPort() {
    const input = document.getElementById('adminPort');
    if (!input) return;
    input.value = '4000';
    Admin.setPortStatus('已填入默认端口 4000，点击「保存端口」生效', 'ok');
    setTimeout(() => Admin.setPortStatus(''), 3000);
  },

  /** 轮询等待服务在新端口上线，然后自动跳转 */
  async waitForPortChange(port) {
    const targetPort = port;
    const origin = `${window.location.protocol}//${window.location.hostname}:${targetPort}`;
    const start = Date.now();
    const maxWait = 60000;

    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 1200));
      try {
        const res = await fetch(`${origin}/api/health?_t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data && data.status === 'ok') {
            Admin.setPortStatus(`服务已在端口 ${targetPort} 启动，即将跳转…`, 'ok');
            await new Promise(r => setTimeout(r, 900));
            // 端口变了 → 源变了，localStorage 里的 token 会丢，用 hash 带过去
            const token = API.getToken();
            window.location.href = `${origin}/admin.html` + (token ? `#token=${encodeURIComponent(token)}` : '');
            return;
          }
        }
      } catch {
        Admin.setPortStatus(`正在重启服务（已等待 ${Math.round((Date.now() - start) / 1000)} 秒）…`, 'loading');
      }
    }

    Admin.setPortStatus(`未能确认服务已在端口 ${targetPort} 启动，请手动访问 ${origin}/admin.html，或在终端重新启动服务。`, 'error');
    const btn = document.getElementById('adminSavePortBtn');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> 保存端口'; }
  },

  // ==================== 系统信息 ====================

  async loadSystemInfo() {
    // 已整合到 loadStats 中
  },

  // ==================== 版本更新 ====================

  latestRelease: null,
  // 更新按钮当前模式：'apply' 一键更新 | 'restart' 手动重启
  applyBtnMode: 'apply',

  /** 读取 gh-proxy 加速下载偏好（本地保存） */
  getProxyPref() {
    try {
      return localStorage.getItem('update_use_gh_proxy') === '1';
    } catch {
      return false;
    }
  },

  /** 保存 gh-proxy 加速下载偏好 */
  setProxyPref(on) {
    try {
      localStorage.setItem('update_use_gh_proxy', on ? '1' : '0');
    } catch { /* 忽略隐私模式下的写入失败 */ }
    const box = document.getElementById('updateStatusBox');
    if (box && box.style.display !== 'none' && Admin.latestRelease) {
      Admin.renderUpdateResult(Admin.latestRelease);
    }
  },

  /** 拉取本地版本号 */
  async loadLocalVersion() {
    const el = document.getElementById('updateLocalVersion');
    try {
      const res = await API.getLocalVersion();
      if (el) el.textContent = 'v' + (res.version || '0.0.0');
    } catch (err) {
      console.error('获取本地版本失败:', err);
      if (el) el.textContent = '未知';
    }
  },

  /** 设置更新状态提示 */
  setUpdateStatus(msg, type) {
    const box = document.getElementById('updateStatusBox');
    if (!box) return;
    box.style.display = msg ? 'flex' : 'none';
    box.className = 'update-status' + (type ? ' is-' + type : '');
    box.innerHTML = msg
      ? `<i class="fas ${type === 'error' ? 'fa-exclamation-circle' : type === 'ok' ? 'fa-check-circle' : 'fa-circle-notch fa-spin'}"></i> ${Admin.escapeHtml(msg)}`
      : '';
  },

  /** 检查更新 */
  async handleCheckUpdate() {
    const btn = document.getElementById('checkUpdateBtn');
    if (btn) { btn.disabled = true; }
    Admin.setUpdateStatus('正在从 GitHub 获取最新发行版...', 'loading');
    document.getElementById('updateResultBox').style.display = 'none';

    try {
      const data = await API.getLatestRelease(true);
      Admin.latestRelease = data;
      Admin.renderUpdateResult(data);
      Admin.setUpdateStatus(
        data.hasUpdate ? `发现新版本 v${data.version}` : '当前已是最新版本',
        'ok'
      );
      if (data.localVersion) {
        const el = document.getElementById('updateLocalVersion');
        if (el) el.textContent = 'v' + data.localVersion;
      }
    } catch (err) {
      Admin.setUpdateStatus(err.message || '检查更新失败', 'error');
    } finally {
      if (btn) { btn.disabled = false; }
    }
  },

  /** 渲染更新结果（随 gh-proxy 勾选状态刷新下载地址） */
  renderUpdateResult(data) {
    const box = document.getElementById('updateResultBox');
    if (!box || !data) return;
    const useProxy = Admin.getProxyPref();

    document.getElementById('updateLatestVersion').textContent = 'v' + (data.version || '—');
    const tagEl = document.getElementById('updateTag');
    tagEl.textContent = data.hasUpdate ? '有可用更新' : '已是最新';
    tagEl.className = 'update-tag' + (data.hasUpdate ? ' is-new' : '');

    document.getElementById('updatePublishedAt').textContent = data.publishedAt
      ? '发布于 ' + new Date(data.publishedAt).toLocaleString('zh-CN')
      : '';

    // 下载列表
    const list = document.getElementById('updateDownloads');
    const assets = (data.assets || []);
    if (!assets.length) {
      list.innerHTML = '<div class="update-asset"><div class="update-asset-info"><i class="fas fa-info-circle"></i><span>该发行版没有附带可下载文件</span></div></div>';
    } else {
      list.innerHTML = assets.map(a => {
        const url = useProxy ? (a.proxyUrl || a.downloadUrl) : a.downloadUrl;
        const size = Admin.formatSize(a.size);
        return `
          <div class="update-asset">
            <div class="update-asset-info">
              <i class="fas fa-file-archive"></i>
              <span class="update-asset-name">${Admin.escapeHtml(a.name)}</span>
              <span class="update-asset-size">${size}</span>
            </div>
            <a class="btn btn-primary" href="${Admin.escapeHtml(url)}" target="_blank" rel="noopener">
              <i class="fas fa-download"></i> 下载
            </a>
          </div>`;
      }).join('');
    }

    // 更新日志（Markdown 渲染）
    const notesEl = document.getElementById('updateReleaseNotes');
    const body = (data.body || '').trim();
    if (body) {
      notesEl.innerHTML = Admin.renderMarkdown(body);
      notesEl.classList.add('is-markdown');
    } else {
      notesEl.textContent = '该发行版未填写更新日志。';
      notesEl.classList.remove('is-markdown');
    }

    // GitHub 链接
    const link = document.getElementById('updateReleaseLink');
    if (data.htmlUrl) {
      link.href = data.htmlUrl;
      link.style.display = 'inline-flex';
    } else {
      link.style.display = 'none';
    }

    // 一键自动更新按钮：仅在存在更新且安装包为 zip 时显示
    const applyBtn = document.getElementById('applyUpdateBtn');
    if (applyBtn) {
      const hasZip = assets.some(a => /\.zip$/i.test(a.name));
      applyBtn.style.display = (data.hasUpdate && hasZip) ? 'inline-flex' : 'none';
      applyBtn.disabled = false;
      applyBtn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> 一键自动更新';
      Admin.applyBtnMode = 'apply';
    }

    box.style.display = 'block';
  },

  /** 一键自动更新：下载并覆盖代码，保留 data/ */
  handleApplyUpdate() {
    const data = Admin.latestRelease;
    if (!data) { Admin.setUpdateStatus('请先检查更新', 'error'); return; }
    const asset = (data.assets || []).find(a => /\.zip$/i.test(a.name)) ||
      (data.primaryAsset && /\.zip$/i.test(data.primaryAsset.name) ? data.primaryAsset : null);
    if (!asset) { Admin.setUpdateStatus('该发行版没有可自动安装的 zip 包', 'error'); return; }

    const from = data.localVersion || '当前版本';
    const to = data.version || data.tag;
    UI.confirm(
      '自动更新',
      `将从 GitHub 下载 <strong>${Admin.escapeHtml(asset.name)}</strong> 并覆盖当前程序文件，版本 <strong>v${Admin.escapeHtml(from)} → v${Admin.escapeHtml(to)}</strong>。<br><br>
       <strong>不会改动 data/ 中的班级与学生数据。</strong><br>
       依赖有变化时会自动执行 <code>npm install</code>，完成后服务会自动重启，页面稍后自动刷新。<br><br>
       确定继续吗？`,
      async () => { await Admin.doApplyUpdate(asset); }
    );
  },

  /** 执行自动更新请求 */
  async doApplyUpdate(asset) {
    const btn = document.getElementById('applyUpdateBtn');
    Admin.applyBtnMode = 'apply';
    const useProxy = Admin.getProxyPref();
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> 正在更新...';
    }
    Admin.setUpdateStatus(
      `正在${useProxy ? '通过 gh-proxy ' : ''}下载并安装 ${asset.name}，请勿关闭页面...`,
      'loading'
    );

    try {
      const res = await API.applyUpdate({ useProxy, assetName: asset.name });
      if (!res.success) throw new Error(res.error || '自动更新失败');

      // 依赖安装结果汇总
      const npmList = res.dependenciesInstalled || [];
      let npmText = '';
      if (npmList.length) {
        const okList = npmList.filter(n => n.success).map(n => n.target);
        const badList = npmList.filter(n => !n.success).map(n => n.target);
        if (okList.length) npmText += `，已自动安装 ${okList.join('/')} 依赖`;
        if (badList.length) npmText += `，${badList.join('/')} 依赖安装失败需手动处理`;
      }

      Admin.setUpdateStatus(
        `${res.message}：已覆盖 ${res.filesWritten} 个文件${npmText}，data/ 数据已保留。`,
        res.npmFailed && res.npmFailed.length ? 'error' : 'ok'
      );

      const el = document.getElementById('updateLocalVersion');
      if (el && res.toVersion) el.textContent = 'v' + res.toVersion;
      Admin.latestRelease = null;

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-check-circle"></i> 更新完成';
      }

      // 自动重启 → 轮询等待新进程上线后刷新页面
      if (res.needsRestart && res.autoRestart !== false) {
        await Admin.waitForRestart(res.toVersion);
      } else if (res.needsRestart) {
        UI.alert(res.restartHint || '请重启后端服务使新版本生效');
      }
    } catch (err) {
      Admin.setUpdateStatus(err.message || '自动更新失败', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> 重试自动更新';
      }
    }
  },

  /**
   * 轮询等待后端重启完成（新进程的 startedAt 与旧的不同且版本已变更）
   * @param {string} expectVersion 期望的新版本号
   */
  async waitForRestart(expectVersion) {
    Admin.setUpdateStatus('正在重启服务，页面将在完成后自动刷新...', 'loading');
    const maxWait = 60000;
    const start = Date.now();
    let sawDowntime = false;

    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 1200));
      try {
        const st = await API.getUpdateStatus();
        const versionOk = !expectVersion || st.version === expectVersion;
        if (versionOk && (sawDowntime || !st.restartPending)) {
          Admin.setUpdateStatus('服务已重启，页面即将刷新...', 'ok');
          await new Promise(r => setTimeout(r, 800));
          location.reload();
          return;
        }
        if (st.restartPending) {
          Admin.setUpdateStatus(
            '服务正在重启，页面将在完成后自动刷新...',
            'loading'
          );
        }
      } catch {
        // 重启瞬间请求会失败，说明旧进程已退出
        sawDowntime = true;
        Admin.setUpdateStatus(
          `服务重启中（已等待 ${Math.round((Date.now() - start) / 1000)} 秒）...`,
          'loading'
        );
      }
    }

    // 超时未成功 → 提供手动重启入口
    Admin.setUpdateStatus('未能确认服务已重启，请手动重启后刷新页面', 'error');
    const btn = document.getElementById('applyUpdateBtn');
    if (btn) {
      btn.style.display = 'inline-flex';
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-redo"></i> 手动重启服务';
      Admin.applyBtnMode = 'restart';
    }
  },

  /** 手动重启服务（自动重启失败时兜底） */
  async handleManualRestart() {
    const btn = document.getElementById('applyUpdateBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> 正在重启...';
    }
    Admin.setUpdateStatus('正在重启服务...', 'loading');
    try {
      await API.restartServer();
    } catch {
      // 请求可能因进程退出而失败，这是预期的
    }
    await Admin.waitForRestart(null);
  },

  /** 字节数格式化 */
  formatSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  },

  /**
   * 轻量 Markdown 渲染（无外部依赖，供更新日志使用）
   * 支持：标题、粗体/斜体/删除线、行内代码、代码块、链接、图片、
   *      无序/有序列表、引用、分隔线、表格、段落与换行
   * 安全性：先整体 HTML 转义，再生成标签，链接仅允许 http/https/mailto
   */
  renderMarkdown(src) {
    const esc = Admin.escapeHtml;
    const text = String(src == null ? '' : src).replace(/\r\n?/g, '\n');
    if (!text.trim()) return '';

    // 行内元素处理（输入已转义）
    const inline = s => {
      let out = s;
      // 行内代码 `code`（先处理，避免内部内容被其它规则改写）
      const codes = [];
      out = out.replace(/`([^`\n]+)`/g, (_, code) => {
        codes.push(`<code>${code}</code>`);
        return `\u0000C${codes.length - 1}\u0000`;
      });
      // 图片 ![alt](url)
      out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, href) => {
        const safe = Admin.safeUrl(href);
        return safe ? `<img src="${safe}" alt="${alt}" loading="lazy">` : m;
      });
      // 链接 [text](url)
      out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
        const safe = Admin.safeUrl(href);
        return safe ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
      });
      // 裸链接
      out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre, href) => {
        const safe = Admin.safeUrl(href);
        return safe ? `${pre}<a href="${safe}" target="_blank" rel="noopener noreferrer">${href}</a>` : m;
      });
      // 粗体 / 斜体 / 删除线
      out = out.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
        .replace(/~~([^~]+)~~/g, '<del>$1</del>');
      // 还原行内代码
      out = out.replace(/\u0000C(\d+)\u0000/g, (_, i) => codes[Number(i)]);
      return out;
    };

    const lines = text.split('\n');
    const html = [];
    let i = 0;
    let paragraph = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      // 段内单换行 -> <br>
      html.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
      paragraph = [];
    };

    while (i < lines.length) {
      const line = lines[i];

      // 代码块 ```lang
      const fence = line.match(/^\s*```([\w+-]*)\s*$/);
      if (fence) {
        flushParagraph();
        const lang = fence[1];
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
          buf.push(esc(lines[i]));
          i++;
        }
        i++; // 跳过结束围栏
        html.push(
          `<pre class="md-code">${lang ? `<span class="md-code-lang">${esc(lang)}</span>` : ''}` +
          `<code>${buf.join('\n')}</code></pre>`
        );
        continue;
      }

      // 空行
      if (!line.trim()) {
        flushParagraph();
        i++;
        continue;
      }

      // 分隔线
      if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
        flushParagraph();
        html.push('<hr>');
        i++;
        continue;
      }

      // 标题 # ~ ######
      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
      if (heading) {
        flushParagraph();
        const level = Math.min(heading[1].length + 2, 6); // 面板内降级，避免标题过大
        html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
        i++;
        continue;
      }

      // 引用 >
      if (/^\s*>\s?/.test(line)) {
        flushParagraph();
        const buf = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        html.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`);
        continue;
      }

      // 表格 | a | b |
      if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
        flushParagraph();
        const splitRow = row => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const head = splitRow(line);
        i += 2; // 跳过表头与分隔行
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        html.push(
          '<table class="md-table"><thead><tr>' +
          head.map(c => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table>'
        );
        continue;
      }

      // 列表（无序 - * + / 有序 1.）
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        flushParagraph();
        const ordered = /^\s*\d+[.)]\s+/.test(line);
        const items = [];
        while (i < lines.length) {
          const cur = lines[i];
          const m = cur.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
          if (!m) {
            // 支持列表项的续行（缩进 2 空格以上）
            if (items.length && /^\s{2,}\S/.test(cur)) {
              items[items.length - 1] += ' ' + cur.trim();
              i++;
              continue;
            }
            break;
          }
          if (/^\s*\d+[.)]\s+/.test(cur) !== ordered) break;
          items.push(m[2]);
          i++;
        }
        const tag = ordered ? 'ol' : 'ul';
        html.push(
          `<${tag}>` + items.map(t => `<li>${inline(t)}</li>`).join('') + `</${tag}>`
        );
        continue;
      }

      // 普通段落
      paragraph.push(line);
      i++;
    }
    flushParagraph();
    return html.join('\n');
  },

  /** 仅放行安全协议，防止 javascript: 注入 */
  safeUrl(url) {
    const raw = String(url == null ? '' : url).trim();
    if (!raw) return '';
    if (/^(https?:|mailto:)/i.test(raw)) return Admin.escapeHtml(raw);
    // 站内相对路径
    if (/^(\/|\.{1,2}\/|#)/.test(raw)) return Admin.escapeHtml(raw);
    return '';
  },

  /** HTML 转义 */
  escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};

// 启动
document.addEventListener('DOMContentLoaded', () => Admin.init());
