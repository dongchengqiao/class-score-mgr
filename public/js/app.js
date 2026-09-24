// ============================================================
// 班级积分管理 - 主应用逻辑
// ============================================================
const App = {
  students: [],
  groups: [],
  rules: [],
  shopItems: [],
  multiSelectedIds: new Set(),

  // ==================== 数据加载 ====================

  async loadAllData() {
    try {
      const [students, groups, rules, shopItems] = await Promise.all([
        API.getStudents(),
        API.getGroups(),
        API.getRules(),
        API.getShopItems()
      ]);
      this.students = students;
      this.groups = groups;
      this.rules = rules;
      this.shopItems = shopItems;
    } catch (err) {
      console.error('加载数据失败:', err);
      UI.alert('加载数据失败，请确保后端服务已启动！');
    }
  },

  async loadStudents() {
    this.students = await API.getStudents();
  },
  async loadGroups() {
    this.groups = await API.getGroups();
  },
  async loadRules() {
    this.rules = await API.getRules();
  },
  async loadShopItems() {
    this.shopItems = await API.getShopItems();
  },

  // ==================== 渲染总入口 ====================

  renderAll() {
    this.renderAllStudents();
    this.renderUngroupedStudents();
    this.renderGroups();
    this.renderLeaderboards();
    this.renderRules();
    this.renderShop();
    this.updateSelectionButtons();
  },

  // ==================== 学生卡片 ====================

  createStudentCard(student, isInGroupView = false) {
    const card = document.createElement('div');
    card.className = `student-card ${student.gender}`;
    card.setAttribute('data-id', student.id);
    card.draggable = true;
    card.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', student.id));

    const available = student.total_points - student.used_points;
    const checked = this.multiSelectedIds.has(student.id) ? 'checked' : '';

    card.innerHTML = `
      <div class="student-card-inner">
        <input type="checkbox" class="multi-select-checkbox" data-id="${student.id}" ${checked}>
        <div class="student-avatar ${student.gender}" id="avatar-${student.id}">
          ${student.avatar ? `<img src="${student.avatar}" alt="${student.name}">` : (student.name || '?').charAt(0)}
        </div>
        <div class="student-info">
          <div class="student-name">
            ${student.name}
            <i class="fas fa-pencil-alt edit-student-btn" title="编辑学生信息"></i>
          </div>
          <div class="student-points">
            <div class="points-row"><span class="points-label">总分:</span><span class="points-value">${student.total_points}</span></div>
            <div class="points-row"><span class="points-label">可用:</span><span class="points-value">${available}</span></div>
          </div>
          <div class="student-controls">
            <button class="btn btn-icon btn-primary add-btn" title="加分"><i class="fas fa-plus"></i></button>
            <button class="btn btn-icon btn-danger subtract-btn" title="减分"><i class="fas fa-minus"></i></button>
            <button class="btn btn-icon btn-secondary history-btn" title="历史记录"><i class="fas fa-history"></i></button>
            <button class="btn btn-icon btn-accent1 shop-btn" title="兑换商品"><i class="fas fa-shopping-cart"></i></button>
          </div>
        </div>
      </div>`;

    // 事件绑定
    card.querySelector('.edit-student-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      App.showEditStudentModal(student.id);
    });
    if (!isInGroupView) {
      card.querySelector(`#avatar-${student.id}`)?.addEventListener('click', () => {
        if (document.body.classList.contains('multi-select-mode')) {
          card.click();
        } else {
          App.showAvatarUploadModal(student);
        }
      });
    }
    card.querySelector('.add-btn')?.addEventListener('click', () => App.showPointsModal(student, 'add'));
    card.querySelector('.subtract-btn')?.addEventListener('click', () => App.showPointsModal(student, 'subtract'));
    card.querySelector('.history-btn')?.addEventListener('click', () => App.showHistoryModal(student));
    card.querySelector('.shop-btn')?.addEventListener('click', () => App.showShopModal(student));
    card.querySelector('.edit-student-btn')?.addEventListener('click', e => e.stopPropagation());

    // 多选点击逻辑
    const checkbox = card.querySelector('.multi-select-checkbox');
    card.addEventListener('click', e => {
      if (!document.body.classList.contains('multi-select-mode')) return;
      if (e.target.closest('.student-controls') ||
          e.target.closest('.edit-student-btn') || e.target.closest('.remove-from-group-btn')) return;
      if (!e.target.classList.contains('multi-select-checkbox')) checkbox.checked = !checkbox.checked;
      if (checkbox.checked) App.multiSelectedIds.add(student.id);
      else App.multiSelectedIds.delete(student.id);
      App.updateSelectionButtons();
    });

    // 移除小组按钮
    if (student.group_id && !isInGroupView) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-from-group-btn';
      removeBtn.innerHTML = '<i class="fas fa-times"></i>';
      removeBtn.title = '从小组移除';
      removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await API.removeStudentFromGroup(student.group_id, student.id);
        await App.loadAllData();
        App.renderAll();
      });
      card.appendChild(removeBtn);
    }

    return card;
  },

  // ==================== 学生列表 ====================

  renderAllStudents() {
    const el = document.getElementById('allStudents');
    if (!el) return;
    el.innerHTML = '';
    this.students.forEach(s => el.appendChild(this.createStudentCard(s)));
  },

  renderUngroupedStudents() {
    const el = document.getElementById('ungroupedStudents');
    if (!el) return;
    el.innerHTML = '';
    this.students.filter(s => !s.group_id).forEach(s => el.appendChild(this.createStudentCard(s)));
  },

  searchStudents() {
    const term = document.getElementById('studentSearchInput')?.value.trim().toLowerCase() || '';
    const el = document.getElementById('allStudents');
    if (!el) return;
    el.innerHTML = '';
    if (!term) {
      this.students.forEach(s => el.appendChild(this.createStudentCard(s)));
      return;
    }
    const filtered = this.students.filter(s => s.name.toLowerCase().includes(term));
    if (!filtered.length) { el.innerHTML = '<p class="text-center" style="padding:30px;color:var(--text-light);">没有找到匹配的学生</p>'; return; }
    filtered.forEach(s => el.appendChild(this.createStudentCard(s)));
  },

  // ==================== 小组 ====================

  renderGroups() {
    const area = document.getElementById('groupsArea');
    if (!area) return;
    area.innerHTML = '';

    // 小组排名
    const groupPoints = this.groups.map(g => {
      const members = this.students.filter(s => s.group_id === g.id);
      return { id: g.id, points: members.reduce((sum, s) => sum + s.total_points, 0) };
    });
    groupPoints.sort((a, b) => b.points - a.points);
    const ranks = {};
    groupPoints.forEach((g, i) => { ranks[g.id] = i + 1; });

    this.groups.forEach(group => {
      const members = this.students.filter(s => s.group_id === group.id);
      const total = members.reduce((sum, s) => sum + s.total_points, 0);
      const available = members.reduce((sum, s) => sum + (s.total_points - s.used_points), 0);
      const rank = ranks[group.id] || 0;
      const rClass = rank <= 3 ? `rank-badge-${rank}` : 'rank-badge-other';

      const card = document.createElement('div');
      card.className = 'group-card';
      card.innerHTML = `
        <div class="group-header">
          <div class="d-flex align-center">
            <div class="group-rank"><div class="rank-badge ${rClass}">${rank}</div></div>
            <div class="group-name"><i class="fas fa-users-gear"></i> ${group.name}</div>
          </div>
          <div class="group-points"><span><i class="fas fa-star"></i> 总分: ${total}</span><span><i class="fas fa-coins"></i> 可用: ${available}</span></div>
        </div>
        <div class="group-actions">
          <button class="btn btn-sm btn-primary add-students-btn" data-id="${group.id}"><i class="fas fa-user-plus"></i> 添加学生</button>
          <button class="btn btn-sm btn-secondary edit-group-btn" data-id="${group.id}"><i class="fas fa-edit"></i> 编辑组名</button>
          <button class="btn btn-sm btn-danger delete-group-btn" data-id="${group.id}"><i class="fas fa-trash"></i> 删除小组</button>
          <button class="btn btn-sm btn-accent1 group-points-btn" data-id="${group.id}"><i class="fas fa-coins"></i> 小组积分</button>
        </div>
        <div class="group-students dropzone" data-group-id="${group.id}"></div>`;
      area.appendChild(card);

      card.querySelector('.add-students-btn').onclick = () => App.showAddStudentToGroupModal(group.id);
      card.querySelector('.edit-group-btn').onclick = () => App.showEditGroupModal(group.id);
      card.querySelector('.delete-group-btn').onclick = async () => {
        UI.confirm('删除小组', `确定要删除「${group.name}」吗？组内学生将返回未分组状态。`, async () => {
          await API.deleteGroup(group.id);
          await App.loadAllData();
          App.renderAll();
        });
      };
      card.querySelector('.group-points-btn').onclick = () => App.showGroupPointsModal(group.id);

      const studentsEl = card.querySelector('.group-students');
      members.forEach(s => {
        const sc = App.createStudentCard(s, true);
        sc.querySelector('.student-card-inner')?.addEventListener('click', e => {
          if (!e.target.closest('.remove-from-group-btn')) App.showPointsModal(s);
        });
        studentsEl.appendChild(sc);
      });
    });
  },

  // ==================== 排行榜 ====================

  renderLeaderboards() {
    // 个人排行榜
    const studentEl = document.getElementById('studentLeaderboardList');
    if (studentEl) {
      studentEl.innerHTML = '';
      const sorted = [...this.students].sort((a, b) => b.total_points - a.total_points);
      sorted.forEach((s, i) => {
        const rank = i + 1;
        const rClass = rank <= 3 ? `rank-${rank}` : '';
        const el = document.createElement('div');
        el.className = `leaderboard-item ${rClass}`;
        el.innerHTML = `
          <div class="leaderboard-rank">${rank}</div>
          <div class="leaderboard-avatar ${s.gender}">
            ${s.avatar ? `<img src="${s.avatar}" alt="${s.name}">` : (s.name || '?').charAt(0)}
          </div>
          <div class="leaderboard-info">
            <div class="leaderboard-name">${s.name}</div>
            <div class="leaderboard-points">${s.total_points}分</div>
          </div>`;
        studentEl.appendChild(el);
      });
    }

    // 小组排行榜
    const groupEl = document.getElementById('groupLeaderboardList');
    if (groupEl) {
      groupEl.innerHTML = '';
      const gp = this.groups.map(g => {
        const m = this.students.filter(s => s.group_id === g.id);
        return { id: g.id, name: g.name, points: m.reduce((sum, s) => sum + s.total_points, 0), count: m.length };
      }).sort((a, b) => b.points - a.points);
      gp.forEach((g, i) => {
        const rank = i + 1;
        const rClass = rank <= 3 ? `rank-${rank}` : '';
        const el = document.createElement('div');
        el.className = `leaderboard-item ${rClass}`;
        el.innerHTML = `
          <div class="leaderboard-rank">${rank}</div>
          <div class="leaderboard-info">
            <div class="leaderboard-name">${g.name} <span class="group-members-count">(${g.count}人)</span></div>
            <div class="leaderboard-points">${g.points}分</div>
          </div>`;
        groupEl.appendChild(el);
      });
    }
  },

  // ==================== 规则 ====================

  renderRules() {
    const el = document.getElementById('rulesList');
    if (!el) return;
    el.innerHTML = '';
    this.rules.forEach((rule, i) => {
      const positive = rule.points > 0;
      const item = document.createElement('div');
      item.className = `rule-item ${positive ? 'positive' : 'negative'}`;
      item.dataset.id = rule.id;
      item.innerHTML = `
        <div class="rule-text">${rule.name}</div>
        <div class="rule-points ${positive ? 'positive' : 'negative'}">${positive ? '+' : ''}${rule.points}</div>`;
      el.appendChild(item);
    });
  },

  // ==================== 商店 ====================

  renderShop() {
    const el = document.getElementById('shopItems');
    if (!el) return;
    el.innerHTML = '';
    this.shopItems.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML = `
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-cost">${item.cost} 积分</div>
        <div class="shop-item-stock">库存: ${item.stock}</div>`;
      el.appendChild(div);
    });
  },

  // ==================== 多选操作 ====================

  toggleMultiSelectMode() {
    document.body.classList.add('multi-select-mode');
    document.getElementById('multiSelectToggleBtn').style.display = 'none';
    document.getElementById('randomRollCallBtn').style.display = 'none';
    document.getElementById('selectAllBtn').style.display = 'inline-flex';
    document.getElementById('cancelMultiSelectBtn').style.display = 'inline-flex';
    this.updateSelectionButtons();
  },

  cancelMultiSelectMode() {
    document.body.classList.remove('multi-select-mode');
    this.multiSelectedIds.clear();
    document.querySelectorAll('.multi-select-checkbox').forEach(cb => cb.checked = false);
    document.getElementById('multiSelectToggleBtn').style.display = 'inline-flex';
    document.getElementById('randomRollCallBtn').style.display = 'inline-flex';
    document.getElementById('selectAllBtn').style.display = 'none';
    document.getElementById('batchAddPointsBtn').style.display = 'none';
    document.getElementById('batchSubtractPointsBtn').style.display = 'none';
    document.getElementById('cancelMultiSelectBtn').style.display = 'none';
  },

  toggleSelectAll() {
    const allChecked = this.multiSelectedIds.size === this.students.length;
    this.multiSelectedIds.clear();
    if (!allChecked) this.students.forEach(s => this.multiSelectedIds.add(s.id));
    document.querySelectorAll('.multi-select-checkbox').forEach(cb => cb.checked = !allChecked);
    this.updateSelectionButtons();
  },

  updateSelectionButtons() {
    const count = this.multiSelectedIds.size;
    document.getElementById('batchAddPointsBtn').style.display = count > 0 ? 'inline-flex' : 'none';
    document.getElementById('batchSubtractPointsBtn').style.display = count > 0 ? 'inline-flex' : 'none';
    const selectAllBtn = document.getElementById('selectAllBtn');
    if (selectAllBtn) {
      selectAllBtn.innerHTML = count === this.students.length && this.students.length > 0
        ? '<i class="far fa-check-square"></i> 取消全选'
        : '<i class="fas fa-check-square"></i> 全选';
    }
  },

  showBatchPointsModal(type) {
    if (!Auth.requireAuth()) return;
    if (!this.multiSelectedIds.size) { alert('请至少选择一名学生！'); return; }
    const selected = this.students.filter(s => this.multiSelectedIds.has(s.id));
    const names = selected.map(s => s.name).join(', ');
    const title = type === 'add' ? '批量加分' : '批量减分';
    const filteredRules = this.rules.filter(r => type === 'add' ? r.points > 0 : r.points < 0);
    let html = `
      <h3>${title}</h3>
      <div class="multi-select-info"><p>操作对象 (${selected.length}人):</p><span>${names}</span></div>
      <div class="rules-options">`;
    filteredRules.forEach(r => {
      const sign = r.points > 0 ? '+' : '';
      html += `<div class="rule-option ${r.points > 0 ? 'positive' : 'negative'}" data-points="${r.points}" data-name="${r.name}">
        <span>${r.name}</span><span>${sign}${r.points}</span></div>`;
    });
    html += `</div>
      <div class="custom-points mt-3">
        <h4>自定义${title}</h4>
        <div class="form-group">
          <input type="number" id="customPoints" class="form-control" placeholder="分数">
          <input type="text" id="customReason" class="form-control mt-2" placeholder="原因">
          <button id="applyCustomBtn" class="btn btn-primary mt-2">应用</button>
        </div>
      </div>`;
    UI.openModal(html, title);

    document.querySelectorAll('.rule-option').forEach(el => {
      el.onclick = async () => {
        const pts = parseInt(el.dataset.points);
        const rsn = el.dataset.name;
        UI.confirm('确认操作', `确定为选中的 ${selected.length} 名学生 ${pts > 0 ? '加' : '减'} ${Math.abs(pts)} 分吗？`, async () => {
          await API.batchPoints([...App.multiSelectedIds], pts, rsn);
          App.multiSelectedIds.clear();
          App.cancelMultiSelectMode();
          await App.loadStudents();
          App.renderAll();
          UI.closeModal();
        });
      };
    });
    document.getElementById('applyCustomBtn').onclick = async () => {
      const ptsInput = document.getElementById('customPoints');
      const rsnInput = document.getElementById('customReason');
      let pts = parseInt(ptsInput.value);
      const rsn = rsnInput.value.trim() || '自定义';
      if (isNaN(pts)) { alert('请输入有效的分数！'); return; }
      if (type === 'subtract' && pts > 0) pts = -pts;
      if (type === 'add' && pts < 0) pts = Math.abs(pts);
      UI.confirm('确认操作', `确定为选中的 ${selected.length} 名学生 ${pts > 0 ? '加' : '减'} ${Math.abs(pts)} 分吗？`, async () => {
        await API.batchPoints([...App.multiSelectedIds], pts, rsn);
        App.multiSelectedIds.clear();
        App.cancelMultiSelectMode();
        await App.loadStudents();
        App.renderAll();
        UI.closeModal();
      });
    };
  },

  /** 快捷多选加分：直接打开选人弹窗，无需进入多选模式 */
  showQuickMultiAddModal() {
    if (!Auth.requireAuth()) return;
    let html = `
      <h3><i class="fas fa-check-double"></i> 多选加分</h3>
      <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;margin:10px 0;">
        <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          <button id="qmaSelectAllBtn" class="btn btn-sm btn-secondary"><i class="fas fa-check-square"></i> 全选</button>
          <button id="qmaDeselectAllBtn" class="btn btn-sm btn-white"><i class="far fa-square"></i> 取消全选</button>
          <span style="font-size:13px;color:var(--text-light);align-self:center;" id="qmaCount">已选 0 人</span>
        </div>
        <div id="qmaStudentList" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;">`;
    this.students.forEach(s => {
      html += `<label style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:14px;background:${s.gender === 'female' ? 'var(--girl-light)' : 'var(--boy-light)'}22;">
        <input type="checkbox" class="qma-checkbox" data-id="${s.id}" style="width:16px;height:16px;">
        <span>${s.name}</span>
      </label>`;
    });
    html += `</div></div>
      <div class="rules-options">`;
    this.rules.filter(r => r.points > 0).forEach(r => {
      html += `<div class="rule-option positive" data-points="${r.points}" data-name="${r.name}">
        <span>${r.name}</span><span>+${r.points}</span></div>`;
    });
    html += `</div>
      <div class="custom-points mt-3">
        <h4>自定义加分</h4>
        <div class="form-group">
          <input type="number" id="qmaPoints" class="form-control" placeholder="分数">
          <input type="text" id="qmaReason" class="form-control mt-2" placeholder="原因">
          <button id="qmaApplyBtn" class="btn btn-primary mt-2"><i class="fas fa-check"></i> 确认加分</button>
        </div>
      </div>`;
    UI.openModal(html, '多选加分');

    // 全选/取消
    document.getElementById('qmaSelectAllBtn').onclick = () => {
      document.querySelectorAll('.qma-checkbox').forEach(cb => cb.checked = true);
      App.updateQmaCount();
    };
    document.getElementById('qmaDeselectAllBtn').onclick = () => {
      document.querySelectorAll('.qma-checkbox').forEach(cb => cb.checked = false);
      App.updateQmaCount();
    };
    document.querySelectorAll('.qma-checkbox').forEach(cb => {
      cb.addEventListener('change', App.updateQmaCount);
    });

    // 规则点击
    document.querySelectorAll('#modal .rule-option').forEach(el => {
      el.onclick = async () => {
        const pts = parseInt(el.dataset.points);
        const rsn = el.dataset.name;
        const ids = App.getSelectedQmaIds();
        if (!ids.length) { alert('请至少选择一名学生！'); return; }
        UI.confirm('确认加分', `确定为 ${ids.length} 名学生各加 ${pts} 分（${rsn}）吗？`, async () => {
          await API.batchPoints(ids, pts, rsn);
          await App.loadStudents();
          App.renderAll();
          UI.closeModal();
        });
      };
    });

    // 自定义加分
    document.getElementById('qmaApplyBtn').onclick = async () => {
      const pts = parseInt(document.getElementById('qmaPoints').value);
      const rsn = document.getElementById('qmaReason').value.trim() || '自定义';
      if (isNaN(pts) || pts <= 0) { alert('请输入有效的正数分数！'); return; }
      const ids = App.getSelectedQmaIds();
      if (!ids.length) { alert('请至少选择一名学生！'); return; }
      UI.confirm('确认加分', `确定为 ${ids.length} 名学生各加 ${pts} 分（${rsn}）吗？`, async () => {
        await API.batchPoints(ids, pts, rsn);
        await App.loadStudents();
        App.renderAll();
        UI.closeModal();
      });
    };

    App.updateQmaCount();
  },

  getSelectedQmaIds() {
    return [...document.querySelectorAll('.qma-checkbox:checked')].map(cb => parseInt(cb.dataset.id));
  },

  updateQmaCount() {
    const count = document.querySelectorAll('.qma-checkbox:checked').length;
    const el = document.getElementById('qmaCount');
    if (el) el.textContent = `已选 ${count} 人`;
  },

  // ==================== 模态框 - 加减分 ====================

  showPointsModal(student, type = null) {
    if (!Auth.requireAuth()) return;
    let html, title;
    const posRules = this.rules.filter(r => r.points > 0);
    const negRules = this.rules.filter(r => r.points < 0);
    let rulesHtml = '';
    const mkRule = (r) => `<div class="rule-option ${r.points > 0 ? 'positive' : 'negative'}" data-points="${r.points}" data-name="${r.name}">
      <span>${r.name}</span><span>${r.points > 0 ? '+' : ''}${r.points}</span></div>`;

    if (type === 'add') {
      title = `加分：${student.name}`;
      posRules.forEach(r => rulesHtml += mkRule(r));
      html = `<h3>${title}</h3><div class="rules-options">${rulesHtml}</div>${App.customPointsHtml('add')}`;
    } else if (type === 'subtract') {
      title = `减分：${student.name}`;
      negRules.forEach(r => rulesHtml += mkRule(r));
      html = `<h3>${title}</h3><div class="rules-options">${rulesHtml}</div>${App.customPointsHtml('subtract')}`;
    } else {
      title = `加减分：${student.name}`;
      posRules.forEach(r => rulesHtml += mkRule(r));
      if (negRules.length) rulesHtml += '<div style="grid-column:1/-1;"><hr style="margin:10px 0;border-style:dashed;"></div>';
      negRules.forEach(r => rulesHtml += mkRule(r));
      html = `<h3>${title}</h3><div class="rules-options">${rulesHtml}</div>${App.customPointsHtml()}`;
    }
    UI.openModal(html, title);

    document.querySelectorAll('.rule-option').forEach(el => {
      el.onclick = async () => {
        const pts = parseInt(el.dataset.points);
        const rsn = el.dataset.name;
        try {
          const result = await API.addPoints(student.id, pts, rsn);
          App.students = App.students.map(s => s.id === student.id ? result : s);
          UI.showPointAnimation(student.id, pts);
          App.renderAll();
          UI.closeModal();
        } catch (err) { alert(err.message); }
      };
    });
    document.getElementById('applyCustomBtn').onclick = async () => {
      const ptsInput = document.getElementById('customPoints');
      const rsnInput = document.getElementById('customReason');
      let pts = parseInt(ptsInput.value);
      const rsn = rsnInput.value.trim() || '自定义';
      if (isNaN(pts)) return;
      if (type === 'subtract' && pts > 0) pts = -pts;
      if (type === 'add' && pts < 0) pts = Math.abs(pts);
      try {
        const result = await API.addPoints(student.id, pts, rsn);
        App.students = App.students.map(s => s.id === student.id ? result : s);
        UI.showPointAnimation(student.id, pts);
        App.renderAll();
        UI.closeModal();
      } catch (err) { alert(err.message); }
    };
  },

  customPointsHtml(type = 'combined') {
    const t = type === 'add' ? '自定义加分' : (type === 'subtract' ? '自定义减分' : '自定义积分');
    return `<div class="custom-points mt-3"><h4>${t}</h4>
      <div class="form-group">
        <input type="number" id="customPoints" class="form-control" placeholder="${type === 'combined' ? '分数(正数加分,负数减分)' : '分数'}">
        <input type="text" id="customReason" class="form-control mt-2" placeholder="原因">
        <button id="applyCustomBtn" class="btn btn-primary mt-2">应用</button>
      </div></div>`;
  },

  // ==================== 历史记录 ====================

  async showHistoryModal(student) {
    let html;
    if (student.history && student.history.length) {
      const items = [...student.history].reverse().map((h, i) => {
        const sign = h.points > 0 ? '+' : '';
        const cls = h.points > 0 ? 'positive' : 'negative';
        return `<div class="history-item ${cls}">
          <div class="history-date">${UI.formatDate(h.created_at)}</div>
          <div class="history-reason">${h.reason || '-'}</div>
          <div class="history-points ${cls}">${sign}${h.points}</div>
          <button class="btn-revert-history" data-student-id="${student.id}" data-history-id="${h.id}" title="撤回此操作"><i class="fas fa-undo"></i></button>
        </div>`;
      }).join('');
      html = `<h3>${student.name} 的积分历史</h3><div class="history-list">${items}</div>`;
    } else {
      html = `<h3>${student.name} 的积分历史</h3><p>暂无积分记录</p>`;
    }
    UI.openModal(html);
    document.querySelectorAll('.btn-revert-history').forEach(btn => {
      btn.onclick = async () => {
        const sid = parseInt(btn.dataset.studentId);
        const hid = parseInt(btn.dataset.historyId);
        UI.confirm('撤回确认', '确定要撤回这条操作吗？此操作不可恢复。', async () => {
          try {
            const result = await API.revertHistory(sid, hid);
            App.students = App.students.map(s => s.id === sid ? result : s);
            App.renderAll();
            App.showHistoryModal(App.students.find(s => s.id === sid));
          } catch (err) { alert('撤回失败: ' + err.message); }
        });
      };
    });
  },

  // ==================== 商店兑换 ====================

  async showShopModal(student) {
    if (!Auth.requireAuth()) return;
    const available = student.total_points - student.used_points;
    let html = `<h3>${student.name} 的商店兑换</h3>
      <div class="student-points-info">可用积分: <span class="available-points-value">${available}</span></div>`;
    if (this.shopItems.length) {
      html += '<div class="shop-modal-items">';
      this.shopItems.forEach(item => {
        const canAfford = available >= item.cost;
        const inStock = item.stock > 0;
        const disabled = !canAfford || !inStock;
        html += `<div class="shop-modal-item ${disabled ? 'disabled' : ''}">
          <div class="shop-item-name">${item.name}</div>
          <div class="shop-item-cost">${item.cost}积分</div>
          <div class="shop-item-stock">库存: ${item.stock}</div>
          <button class="btn ${canAfford ? 'btn-primary' : 'btn-secondary'} purchase-btn"
            data-item-id="${item.id}" data-student-id="${student.id}" ${disabled ? 'disabled' : ''}>
            ${canAfford ? (inStock ? '兑换' : '无库存') : '积分不足'}
          </button>
        </div>`;
      });
      html += '</div>';
    } else {
      html += '<p>商店暂无商品</p>';
    }
    UI.openModal(html);

    document.querySelectorAll('.purchase-btn').forEach(btn => {
      btn.onclick = async () => {
        const itemId = parseInt(btn.dataset.itemId);
        const studentId = parseInt(btn.dataset.studentId);
        try {
          const result = await API.purchaseItem(itemId, studentId);
          App.students = App.students.map(s => s.id === studentId ? result.student : s);
          App.shopItems = App.shopItems.map(i => i.id === itemId ? result.item : i);
          App.renderAll();
          App.showShopModal(App.students.find(s => s.id === studentId));
        } catch (err) { alert(err.message); }
      };
    });
  },

  // ==================== 头像上传 ====================

  showAvatarUploadModal(student) {
    if (!Auth.requireAuth()) return;
    const html = `
      <h3>上传头像</h3>
      <p>为 ${student.name} 上传头像：</p>
      <div class="form-group"><input type="file" id="avatarFile" class="form-control" accept="image/*"></div>
      <div class="preview-container mt-2" style="display:none;text-align:center;">
        <p>预览:</p>
        <div style="width:100px;height:100px;border-radius:50%;overflow:hidden;margin:0 auto;background:#f0f0f0;">
          <img id="previewImg" src="" style="width:100%;height:100%;object-fit:cover;"></div>
      </div>
      <div class="modal-footer"><button id="saveAvatarBtn" class="btn btn-primary" disabled>保存</button></div>`;
    UI.openModal(html, '上传头像');
    let compressedImageData = null;
    document.getElementById('avatarFile').onchange = async function () {
      if (this.files && this.files[0]) {
        try {
          compressedImageData = await UI.compressImage(this.files[0]);
          document.getElementById('previewImg').src = compressedImageData;
          document.querySelector('.preview-container').style.display = 'block';
          document.getElementById('saveAvatarBtn').disabled = false;
        } catch (e) { alert('图片处理失败'); }
      }
    };
    document.getElementById('saveAvatarBtn').onclick = async () => {
      if (compressedImageData) {
        const idx = App.students.findIndex(s => s.id === student.id);
        if (idx !== -1) {
          App.students[idx].avatar = compressedImageData;
          // 通过 API 保存（base64方式）
          await API.updateStudent(student.id, { name: student.name, gender: student.gender });
          // 用 POST avatar 存 base64
          try {
            const blob = await (await fetch(compressedImageData)).blob();
            const file = new File([blob], 'avatar.webp', { type: 'image/webp' });
            await API.uploadAvatar(student.id, file);
          } catch (e) {
            // 如果上传失败，base64 也在本地渲染可用
            console.warn('头像文件上传失败，使用本地缓存', e);
          }
          App.renderAll();
          UI.closeModal();
        }
      }
    };
  },

  // ==================== 添加学生到小组弹窗 ====================

  async showAddStudentToGroupModal(groupId) {
    if (!Auth.requireAuth()) return;
    const ungrouped = this.students.filter(s => !s.group_id);
    if (!ungrouped.length) { alert('没有可添加的未分组学生'); return; }
    let html = '<h3>添加学生到小组</h3><div class="student-select-list">';
    ungrouped.forEach(s => {
      html += `<div class="student-select-item ${s.gender}">
        <label class="student-select-label"><input type="checkbox" class="student-select-checkbox" value="${s.id}">
          <div class="student-select-info">
            <div class="student-select-avatar ${s.gender}">${(s.name||'?').charAt(0)}</div>
            <span>${s.name}</span>
          </div></label></div>`;
    });
    html += '</div><div class="modal-footer">';
    html += '<button id="addSelectedStudentsBtn" class="btn btn-primary">添加所选学生</button></div>';
    UI.openModal(html);
    document.getElementById('addSelectedStudentsBtn').onclick = async () => {
      const ids = [...document.querySelectorAll('.student-select-checkbox:checked')].map(cb => parseInt(cb.value));
      if (!ids.length) { alert('请选择学生'); return; }
      await API.addStudentsToGroup(groupId, ids);
      await App.loadAllData();
      App.renderAll();
      UI.closeModal();
    };
  },

  // ==================== 编辑小组名称 ====================

  showEditGroupModal(groupId) {
    if (!Auth.requireAuth()) return;
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;
    const html = `<h3>修改小组名称</h3>
      <div class="form-group"><input type="text" id="editGroupNameInput" class="form-control" value="${group.name}"></div>
      <div class="modal-footer"><button id="saveGroupNameBtn" class="btn btn-primary">保存</button></div>`;
    UI.openModal(html);
    document.getElementById('saveGroupNameBtn').onclick = async () => {
      const name = document.getElementById('editGroupNameInput').value.trim();
      if (name) { await API.updateGroup(groupId, name); await App.loadGroups(); App.renderGroups(); UI.closeModal(); }
    };
  },

  // ==================== 小组积分 ====================

  async showGroupPointsModal(groupId) {
    if (!Auth.requireAuth()) return;
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;
    const members = this.students.filter(s => s.group_id === groupId);
    if (!members.length) { alert('该小组没有学生，无法操作。'); return; }

    let html = `<h3>小组积分: ${group.name}</h3><p>选择要加减分的成员 (默认全选):</p>
      <div class="form-group"><label class="student-select-label" style="font-weight:bold;cursor:pointer;">
        <input type="checkbox" id="groupSelectAllCheckbox" checked style="margin-right:10px;"> 全选/取消全选</label></div>
      <div class="student-select-list">`;
    members.forEach(m => {
      html += `<div class="student-select-item ${m.gender}">
        <label class="student-select-label" style="align-items:center;">
          <input type="checkbox" class="group-member-checkbox" value="${m.id}" checked style="margin-right:10px;">
          <span>${m.name}</span></label></div>`;
    });
    html += '</div><hr style="margin:20px 0;"><p>选择规则或自定义积分:</p><div class="rules-options">';
    this.rules.forEach(r => {
      const sign = r.points > 0 ? '+' : '';
      html += `<div class="rule-option ${r.points > 0 ? 'positive' : 'negative'}" data-points="${r.points}" data-name="${r.name}">
        <span>${r.name}</span><span>${sign}${r.points}</span></div>`;
    });
    html += '</div>';
    html += `<div class="custom-points mt-3"><h4>自定义积分</h4>
      <div class="form-group">
        <input type="number" id="customPoints" class="form-control" placeholder="分数">
        <input type="text" id="customReason" class="form-control mt-2" placeholder="原因">
        <button id="applyCustomBtn" class="btn btn-primary mt-2">应用</button>
      </div></div>`;
    UI.openModal(html);

    // 全选
    document.getElementById('groupSelectAllCheckbox').onchange = function () {
      document.querySelectorAll('.group-member-checkbox').forEach(cb => cb.checked = this.checked);
    };

    const getSelected = () => [...document.querySelectorAll('.group-member-checkbox:checked')].map(cb => parseInt(cb.value));

    document.querySelectorAll('.rule-option').forEach(el => {
      el.onclick = async () => {
        const ids = getSelected();
        if (!ids.length) { alert('请至少选择一名小组成员！'); return; }
        const pts = parseInt(el.dataset.points);
        const rsn = el.dataset.name;
        UI.confirm('确认操作', `确定为选中的 ${ids.length} 名成员 ${pts > 0 ? '加' : '减'} ${Math.abs(pts)} 分吗？`, async () => {
          await API.groupPoints(groupId, ids, pts, rsn);
          await App.loadStudents();
          App.renderAll();
          UI.closeModal();
        });
      };
    });
    document.getElementById('applyCustomBtn').onclick = async () => {
      const ids = getSelected();
      if (!ids.length) { alert('请至少选择一名小组成员！'); return; }
      let pts = parseInt(document.getElementById('customPoints').value);
      const rsn = document.getElementById('customReason').value.trim() || '自定义';
      if (isNaN(pts)) { alert('请输入有效的分数！'); return; }
      UI.confirm('确认操作', `确定为选中的 ${ids.length} 名成员 ${pts > 0 ? '加' : '减'} ${Math.abs(pts)} 分吗？`, async () => {
        await API.groupPoints(groupId, ids, pts, rsn);
        await App.loadStudents();
        App.renderAll();
        UI.closeModal();
      });
    };
  },

  // ==================== 编辑学生信息 ====================

  showEditStudentModal(studentId) {
    if (!Auth.requireAuth()) return;
    const s = this.students.find(st => st.id === studentId);
    if (!s) return;
    const html = `<h3>编辑学生信息</h3>
      <div class="form-group"><label class="form-label">姓名:</label><input type="text" id="editStudentName" class="form-control" value="${s.name}"></div>
      <div class="form-group"><label class="form-label">性别:</label>
        <div class="radio-group mt-2">
          <label class="radio-container radio-male"><input type="radio" class="radio-input" name="editGender" value="male" ${s.gender === 'male' ? 'checked' : ''}><span class="radio-mark"></span> 男生</label>
          <label class="radio-container radio-female"><input type="radio" class="radio-input" name="editGender" value="female" ${s.gender === 'female' ? 'checked' : ''}><span class="radio-mark"></span> 女生</label>
        </div></div>
      <div class="modal-footer"><button id="saveStudentChanges" class="btn btn-primary">保存</button></div>`;
    UI.openModal(html);
    document.getElementById('saveStudentChanges').onclick = async () => {
      const name = document.getElementById('editStudentName').value.trim();
      const gender = document.querySelector('input[name="editGender"]:checked').value;
      if (!name) { alert('姓名不能为空！'); return; }
      await API.updateStudent(studentId, { name, gender });
      await App.loadStudents();
      App.renderAll();
      UI.closeModal();
    };
  },

  // ==================== 初始化 ====================

  async init() {
    // 先初始化密码验证（可能会锁定页面）
    await Auth.init();

    // 如果已锁定，无需加载数据（API 调用会因无 Token 而失败）
    if (document.body.classList.contains('locked')) return;

    // 加载数据
    try {
      await this.loadAllData();
      await this.loadClassInfo();
    } catch (err) {
      console.error('初始化加载失败:', err);
    }
    this.finishInit();
  },

  finishInit() {
    this.renderAll();
    this.bindEvents();
    UI.loadTheme();
    UI.setupDropZones();
    // loadTheme() 会重置 className，若有 guest-mode 需重新添加
    if (Auth.isGuest) document.body.classList.add('guest-mode');
  },

  async loadClassInfo() {
    try {
      const data = await API.getSettings();
      const settings = data.settings || data;
      if (settings.class_name) {
        const watermark = document.querySelector('.author-watermark');
        if (watermark) {
          watermark.textContent = `📚 ${settings.class_name} · 积分管理`;
        }
        document.title = `${settings.class_name} - 班级积分管理系统`;
      }
    } catch (err) {
      // 静默失败，使用默认水印
    }
  },

  bindEvents() {
    // 添加小组
    document.getElementById('addGroupBtn').addEventListener('click', async () => {
      const name = document.getElementById('groupName').value.trim();
      if (!name) return;
      await API.addGroup(name);
      document.getElementById('groupName').value = '';
      await App.loadGroups();
      App.renderGroups();
    });

    // 搜索
    document.getElementById('studentSearchInput')?.addEventListener('input', () => App.searchStudents());

    // 批量操作
    document.getElementById('multiSelectToggleBtn')?.addEventListener('click', () => App.toggleMultiSelectMode());
    document.getElementById('cancelMultiSelectBtn')?.addEventListener('click', () => App.cancelMultiSelectMode());
    document.getElementById('selectAllBtn')?.addEventListener('click', () => App.toggleSelectAll());
    document.getElementById('batchAddPointsBtn')?.addEventListener('click', () => App.showBatchPointsModal('add'));
    document.getElementById('batchSubtractPointsBtn')?.addEventListener('click', () => App.showBatchPointsModal('subtract'));
    document.getElementById('quickMultiAddBtn')?.addEventListener('click', () => App.showQuickMultiAddModal());

    // 随机点名
    document.getElementById('randomRollCallBtn')?.addEventListener('click', () => RollCall.showModal());

    // 计时器
    document.getElementById('timerBtn')?.addEventListener('click', () => Timer.showModal());

    // 语音加分
    document.getElementById('goToVoice')?.addEventListener('click', () => {
      if (!Auth.requireAuth()) return;
      document.getElementById('voiceModal').style.display = 'block';
    });

    // 导出/导入
    document.getElementById('exportData')?.addEventListener('click', () => DataManager.exportAll());
    document.getElementById('importData')?.addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile')?.addEventListener('change', (e) => DataManager.importAll(e));
    document.getElementById('exportDetailsBtn')?.addEventListener('click', () => DataManager.showExportDetailsModal());
    document.getElementById('exportGroupBtn')?.addEventListener('click', () => DataManager.showExportGroupModal());

    // 标签页切换
    document.querySelectorAll('.left-panel .tab-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.left-panel .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.left-panel .tab-content').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        document.getElementById(this.dataset.tab).classList.add('active');
      });
    });
    document.querySelectorAll('.right-panel .tab-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.right-panel .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.right-panel .tab-content').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        document.getElementById(this.dataset.tab).classList.add('active');
      });
    });

    // 模态框关闭
    document.querySelectorAll('.close').forEach(btn => {
      btn.addEventListener('click', function () {
        const modal = this.closest('.modal');
        modal.style.display = 'none';
        // 关闭语音模态框时停止麦克风
        if (modal.id === 'voiceModal' && Voice.isListening) {
          Voice.stop();
        }
      });
    });
    window.addEventListener('click', (event) => {
      if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
        // 关闭语音模态框时停止麦克风
        if (event.target.id === 'voiceModal' && Voice.isListening) {
          Voice.stop();
        }
      }
    });
  }
};

// 🚀 启动应用
document.addEventListener('DOMContentLoaded', () => App.init());
