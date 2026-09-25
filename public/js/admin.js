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
        Admin.loadClassInfo()
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

      // 过滤掉密码哈希（不显示）
      let html = '<table class="settings-table"><thead><tr><th>键名</th><th>值</th><th>操作</th></tr></thead><tbody>';
      for (const key of keys) {
        if (key === 'app_password_hash' || key === 'user_password_hash' || key === 'school_name') continue;
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
      const positive = rule.points > 0;
      const item = document.createElement('div');
      item.className = `rule-item ${positive ? 'positive' : 'negative'}`;
      item.dataset.id = rule.id;
      item.draggable = true;
      item.innerHTML = `
        <span class="rule-drag-handle"><i class="fas fa-grip-vertical"></i></span>
        <div class="rule-text">${rule.name}</div>
        <div class="rule-points ${positive ? 'positive' : 'negative'}">${positive ? '+' : ''}${rule.points}</div>
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

  async handleAddRule() {
    const name = document.getElementById('adminRuleName').value.trim();
    const points = parseInt(document.getElementById('adminRulePoints').value);
    if (!name || isNaN(points)) { UI.alert('请填写规则名称和分值'); return; }
    try {
      await API.addRule(name, points);
      document.getElementById('adminRuleName').value = '';
      document.getElementById('adminRulePoints').value = '';
      await Admin.loadRules();
      Admin.renderRules();
    } catch (err) {
      UI.alert('添加规则失败: ' + (err.message || err));
    }
  },

  showEditRuleModal(ruleId) {
    const rule = Admin.rules.find(r => r.id === ruleId);
    if (!rule) return;
    const html = `<h3>编辑规则</h3>
      <div class="form-group"><label class="form-label">规则名称:</label><input type="text" id="editRuleName" class="form-control" value="${rule.name}"></div>
      <div class="form-group"><label class="form-label">分值:</label><input type="number" id="editRulePoints" class="form-control" value="${rule.points}"></div>
      <div class="modal-footer"><button id="saveRuleChanges" class="btn btn-primary">保存</button></div>`;
    // 使用全局 UI 的弹窗
    if (typeof UI !== 'undefined' && UI.openModal) {
      UI.openModal(html);
    } else {
      // Fallback: 用简单确认
      const newName = prompt('规则名称:', rule.name);
      if (!newName) return;
      const newPoints = parseInt(prompt('分值:', rule.points));
      if (isNaN(newPoints)) return;
      Admin.saveEditRule(ruleId, newName, newPoints);
      return;
    }
    document.getElementById('saveRuleChanges').onclick = () => {
      const name = document.getElementById('editRuleName').value.trim();
      const points = parseInt(document.getElementById('editRulePoints').value);
      if (!name || isNaN(points)) { UI.alert('请输入有效的信息！'); return; }
      Admin.saveEditRule(ruleId, name, points);
    };
  },

  async saveEditRule(ruleId, name, points) {
    try {
      await API.updateRule(ruleId, { name, points });
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

  // ==================== 系统信息 ====================

  async loadSystemInfo() {
    // 已整合到 loadStats 中
  }
};

// 启动
document.addEventListener('DOMContentLoaded', () => Admin.init());
