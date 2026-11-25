/* ============================================================
 * 初始化向导逻辑 (setup.html)
 *   - 5 步向导：端口 / 学生 / 小组 / 规则 / 商品
 *   - Excel 粘贴解析（姓名 + 性别）
 *   - 完成后调用 /api/setup/complete，必要时等待重启
 * ============================================================ */
(function () {
  'use strict';

  const MAX_PREVIEW = 12;

  const Setup = {
    step: 1,
    totalSteps: 5,
    serverPort: 4000,
    restarting: false,
    students: [],
    groups: [],
    rules: [],
    shopItems: []
  };

  // ==================== 工具 ====================

  function $(id) { return document.getElementById(id); }

  /** 性别归一化 */
  function normalizeGender(value) {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return null;
    if (['女', '女生', '女孩', 'female', 'f', 'woman', 'girl'].includes(v)) return 'female';
    if (['男', '男生', '男孩', 'male', 'm', 'man', 'boy'].includes(v)) return 'male';
    return null;
  }

  function isHeaderCell(text) {
    const v = String(text || '').trim().toLowerCase();
    return ['姓名', '名字', '学生', '学生姓名', 'name', '性别', 'gender', 'sex'].includes(v);
  }

  /** 解析学生文本：每行 姓名 [Tab|逗号] 性别 */
  function parseStudents(text) {
    const out = [];
    const lines = String(text || '').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      // Tab 优先，其次中文/英文逗号、分号、多个空格
      const parts = line.split(/\t|[,，;；]+|\s{2,}/).map(s => s.trim()).filter(Boolean);
      if (!parts.length) continue;
      // 跳过表头行
      if (parts.length >= 1 && isHeaderCell(parts[0]) && (parts.length === 1 || normalizeGender(parts[1]))) continue;
      const name = parts[0].replace(/\s+/g, '');
      if (!name || isHeaderCell(name)) continue;
      const gender = (parts.length > 1 ? normalizeGender(parts[1]) : null) || 'male';
      out.push({ name, gender });
    }
    return out;
  }

  /** 解析逐行名称（小组） */
  function parseLines(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  /** 解析规则：名称,分值 */
  function parseRules(text) {
    const out = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      const raw = line.trim();
      if (!raw) continue;
      const parts = raw.split(/\t|[,，]+/).map(s => s.trim()).filter(Boolean);
      if (!parts.length) continue;
      const name = parts[0];
      if (!name || ['规则', '规则名称', '名称'].includes(name)) continue;
      let points = parseInt(parts[1], 10);
      if (!Number.isFinite(points)) points = 1;
      out.push({ name, type: 'fixed', points });
    }
    return out;
  }

  /** 解析商品：名称,积分,库存 */
  function parseShop(text) {
    const out = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      const raw = line.trim();
      if (!raw) continue;
      const parts = raw.split(/\t|[,，]+/).map(s => s.trim()).filter(Boolean);
      if (!parts.length) continue;
      const name = parts[0];
      if (!name || ['商品', '商品名称', '名称'].includes(name)) continue;
      const cost = Math.max(0, parseInt(parts[1], 10) || 0);
      const stock = Math.max(0, parseInt(parts[2], 10) || 0);
      out.push({ name, cost, stock });
    }
    return out;
  }

  // ==================== 预览渲染 ====================

  function renderPreview(el, items, formatter, titleText) {
    if (!el) return;
    if (!items.length) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }
    el.style.display = 'block';
    const shown = items.slice(0, MAX_PREVIEW);
    const chips = shown.map(formatter).join('');
    const more = items.length > MAX_PREVIEW
      ? `<span class="chip more">… 还有 ${items.length - MAX_PREVIEW} 项</span>`
      : '';
    el.innerHTML = `<div class="preview-title">${titleText}</div><div class="chip-row">${chips}${more}</div>`;
  }

  function refreshStudentPreview() {
    Setup.students = parseStudents($('setupStudents').value);
    const male = Setup.students.filter(s => s.gender === 'male').length;
    const female = Setup.students.length - male;
    const el = $('studentPreview');
    if (!Setup.students.length) { renderPreview(el, [], () => '', ''); return; }
    renderPreview(
      el,
      Setup.students,
      s => `<span class="chip ${s.gender}">${s.name} · ${s.gender === 'male' ? '男' : '女'}</span>`,
      `已识别 ${Setup.students.length} 名学生（男生 ${male} 人 / 女生 ${female} 人）`
    );
  }

  function refreshGroupPreview() {
    Setup.groups = parseLines($('setupGroups').value);
    renderPreview($('groupPreview'), Setup.groups, g => `<span class="chip">${g}</span>`,
      `已识别 ${Setup.groups.length} 个小组`);
  }

  function refreshRulePreview() {
    Setup.rules = parseRules($('setupRules').value);
    renderPreview($('rulePreview'), Setup.rules,
      r => `<span class="chip ${r.points >= 0 ? 'male' : 'female'}">${r.name} ${r.points > 0 ? '+' : ''}${r.points}</span>`,
      `已识别 ${Setup.rules.length} 条规则`);
  }

  function refreshShopPreview() {
    Setup.shopItems = parseShop($('setupShop').value);
    renderPreview($('shopPreview'), Setup.shopItems,
      i => `<span class="chip">${i.name} · ${i.cost}分 · 库存${i.stock}</span>`,
      `已识别 ${Setup.shopItems.length} 个商品`);
  }

  // ==================== 步骤控制 ====================

  function showError(step, message) {
    const el = $('setupError' + step);
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.classList.add('show');
    } else {
      el.textContent = '';
      el.classList.remove('show');
    }
  }

  function clearErrors() {
    for (let i = 1; i <= 5; i++) showError(i, '');
  }

  function goStep(step) {
    if (step === 'done') {
      Setup.step = 'done';
      document.querySelectorAll('.setup-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.panel === 'done');
      });
      document.querySelectorAll('.setup-step').forEach(s => {
        s.classList.remove('active');
        s.classList.add('done');
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const n = parseInt(step, 10);
    if (!Number.isFinite(n) || n < 1 || n > Setup.totalSteps) return;

    // 允许向前跳转时校验当前步骤
    if (n > Setup.step) {
      if (!validateStep(Setup.step)) return;
    }

    Setup.step = n;
    document.querySelectorAll('.setup-panel').forEach(p => {
      p.classList.toggle('active', parseInt(p.dataset.panel, 10) === n);
    });
    document.querySelectorAll('.setup-step').forEach(s => {
      const sn = parseInt(s.dataset.step, 10);
      s.classList.toggle('active', sn === n);
      s.classList.toggle('done', sn < n);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** 校验指定步骤 */
  function validateStep(step) {
    clearErrors();
    if (step === 1) {
      const raw = $('setupPort').value.trim();
      const port = raw === '' ? 4000 : parseInt(raw, 10);
      if (!Number.isFinite(port) || port < 1024 || port > 65535) {
        showError(1, '端口需为 1024 ~ 65535 之间的整数');
        return false;
      }
      return true;
    }
    return true;
  }

  // ==================== 提交 ====================

  function collectPayload() {
    const rawPort = $('setupPort').value.trim();
    const port = rawPort === '' ? 4000 : parseInt(rawPort, 10);
    return {
      className: $('setupClassName').value.trim(),
      port,
      students: parseStudents($('setupStudents').value),
      groups: parseLines($('setupGroups').value),
      rules: parseRules($('setupRules').value),
      shopItems: parseShop($('setupShop').value)
    };
  }

  function renderSummary(data) {
    const el = $('setupSummary');
    if (!el) return;
    el.innerHTML = `
      <div class="summary-item"><div class="k">端口</div><div class="v">${data.port}</div></div>
      <div class="summary-item"><div class="k">学生</div><div class="v">${data.students || 0}</div></div>
      <div class="summary-item"><div class="k">小组</div><div class="v">${data.groups || 0}</div></div>
      <div class="summary-item"><div class="k">规则</div><div class="v">${data.rules || 0}</div></div>
      <div class="summary-item"><div class="k">商品</div><div class="v">${data.shopItems || 0}</div></div>
    `;
  }

  function finishButtonBusy(busy) {
    const btns = [$('setupFinishBtn'), $('setupSkipAll')];
    btns.forEach(b => { if (b) b.disabled = busy; });
    if ($('setupFinishBtn')) {
      $('setupFinishBtn').innerHTML = busy
        ? '<i class="fas fa-spinner fa-spin"></i> 保存中…'
        : '<i class="fas fa-check"></i> 完成初始化';
    }
  }

  async function submit() {
    if (!validateStep(1)) { goStep(1); return; }
    const payload = collectPayload();
    finishButtonBusy(true);
    clearErrors();

    try {
      const res = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `保存失败（HTTP ${res.status}）`);

      renderSummary(data);
      goStep('done');

      if (data.portChanged) {
        await waitForRestart(data.port);
      } else {
        markReady(data.port);
      }
    } catch (err) {
      finishButtonBusy(false);
      showError(5, err.message || '保存失败，请重试');
      goStep(5);
    }
  }

  /** 跳转到新端口 */
  function markReady(port) {
    const note = $('setupRestartNote');
    const text = $('setupRestartText');
    const btn = $('setupGoHome');
    if (note) note.innerHTML = '<i class="fas fa-circle-check" style="color:var(--accent2)"></i><span>一切就绪</span>';
    if (text) text.textContent = '';
    if ($('setupDoneDesc')) $('setupDoneDesc').textContent = '配置已保存，可以开始使用系统了。';
    if (btn) {
      btn.disabled = false;
      btn.onclick = () => { window.location.href = '/index.html'; };
    }
    Setup.serverPort = port || Setup.serverPort;
  }

  /** 轮询等待服务重启完成（端口可能变化） */
  async function waitForRestart(port) {
    Setup.restarting = true;
    const targetPort = port || Setup.serverPort;
    const targetOrigin = `${window.location.protocol}//${window.location.hostname}:${targetPort}`;
    const text = $('setupRestartText');
    const note = $('setupRestartNote');
    const btn = $('setupGoHome');

    if ($('setupDoneDesc')) {
      $('setupDoneDesc').textContent = `端口已更改为 ${targetPort}，服务正在重启…`;
    }
    if (text) text.textContent = `正在重启服务（端口 ${targetPort}）…`;

    const startedAt = Date.now();
    const timeout = 60000;
    let ready = false;

    while (Date.now() - startedAt < timeout) {
      try {
        const res = await fetch(`${targetOrigin}/api/health?_t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.status === 'ok') { ready = true; break; }
        }
      } catch (err) { /* 服务重启中，忽略 */ }
      await new Promise(r => setTimeout(r, 1200));
    }

    if (ready) {
      if (note) note.innerHTML = '<i class="fas fa-circle-check" style="color:var(--accent2)"></i><span>服务已重启</span>';
      if (text) text.textContent = '';
      if (btn) {
        btn.disabled = false;
        btn.onclick = () => { window.location.href = targetOrigin + '/index.html'; };
      }
      // 端口变化时自动跳转
      if (targetPort !== window.location.port) {
        setTimeout(() => { window.location.href = targetOrigin + '/index.html'; }, 900);
      }
    } else {
      if (note) note.innerHTML = '<i class="fas fa-triangle-exclamation" style="color:var(--primary)"></i><span>自动重启超时</span>';
      if (text) {
        text.textContent = `请手动访问 ${targetOrigin}/index.html，或重新启动服务。`;
      }
      if (btn) {
        btn.disabled = false;
        btn.onclick = () => { window.location.href = targetOrigin + '/index.html'; };
      }
    }
    Setup.restarting = false;
  }

  // ==================== 导入已有备份 ====================

  /** 备份文件的解析结果 */
  let importPayload = null;

  function showImportError(message) {
    const el = $('setupImportError');
    if (!el) return;
    if (message) { el.textContent = message; el.classList.add('show'); }
    else { el.textContent = ''; el.classList.remove('show'); }
  }

  /** 校验备份数据结构并给出摘要 */
  function describeBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('文件内容不是有效的备份数据（应为 JSON 对象）');
    }
    const counts = {
      students: Array.isArray(data.students) ? data.students.length : 0,
      groups: Array.isArray(data.groups) ? data.groups.length : 0,
      rules: Array.isArray(data.rules)
        ? data.rules.length
        : ((data.rules && Array.isArray(data.rules.add)) ? data.rules.add.length : 0)
          + ((data.rules && Array.isArray(data.rules.minus)) ? data.rules.minus.length : 0),
      shopItems: Array.isArray(data.shopItems) ? data.shopItems.length : 0
    };
    if (!counts.students && !counts.groups && !counts.rules && !counts.shopItems) {
      throw new Error('备份文件里没有可导入的数据（学生 / 小组 / 规则 / 商品均为空）');
    }
    return counts;
  }

  function bindImport() {
    const pickBtn = $('setupImportPick');
    const fileInput = $('setupImportFile');
    const importBtn = $('setupImportBtn');
    const nameEl = $('setupImportName');

    if (pickBtn && fileInput) {
      pickBtn.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        showImportError('');
        importPayload = null;
        if (importBtn) importBtn.disabled = true;

        const file = fileInput.files && fileInput.files[0];
        if (!file) {
          if (nameEl) { nameEl.textContent = '未选择文件'; nameEl.classList.remove('picked'); }
          return;
        }
        if (nameEl) { nameEl.textContent = file.name; nameEl.classList.add('picked'); }

        try {
          const text = await file.text();
          const data = JSON.parse(text);
          const counts = describeBackup(data);
          importPayload = data;
          if (nameEl) {
            nameEl.textContent = `${file.name} · 学生 ${counts.students} / 小组 ${counts.groups} / 规则 ${counts.rules} / 商品 ${counts.shopItems}`;
          }
          if (importBtn) importBtn.disabled = false;
        } catch (err) {
          showImportError(err.message || '无法解析该文件');
        }
      });
    }

    if (importBtn) {
      importBtn.addEventListener('click', async () => {
        if (!importPayload) { showImportError('请先选择一个有效的备份文件'); return; }
        showImportError('');

        const className = ($('setupClassName') && $('setupClassName').value.trim()) || '';
        const rawPort = ($('setupPort') && $('setupPort').value.trim()) || '';
        const port = rawPort === '' ? null : parseInt(rawPort, 10);
        if (port !== null && (!Number.isFinite(port) || port < 1024 || port > 65535)) {
          showImportError('端口需为 1024 ~ 65535 之间的整数');
          return;
        }

        importBtn.disabled = true;
        const original = importBtn.innerHTML;
        importBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 导入中…';

        try {
          const res = await fetch('/api/setup/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: importPayload, className, port })
          });
          const result = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(result.error || `导入失败（HTTP ${res.status}）`);

          renderSummary(result);
          goStep('done');
          if ($('setupDoneDesc')) {
            $('setupDoneDesc').textContent = '备份数据已导入，历史记录与积分均已恢复。';
          }
          if (result.portChanged) {
            await waitForRestart(result.port);
          } else {
            markReady(result.port);
          }
        } catch (err) {
          showImportError(err.message || '导入失败，请重试');
          importBtn.disabled = false;
          importBtn.innerHTML = original;
        }
      });
    }
  }

  // ==================== 事件绑定 ====================

  function bindEvents() {
    // 下一步 / 上一步
    document.querySelectorAll('[data-next]').forEach(btn => {
      btn.addEventListener('click', () => goStep(btn.dataset.next));
    });
    document.querySelectorAll('[data-prev]').forEach(btn => {
      btn.addEventListener('click', () => goStep(btn.dataset.prev));
    });
    // 步骤指示器点击（仅允许回看已完成步骤）
    document.querySelectorAll('.setup-step').forEach(el => {
      el.addEventListener('click', () => {
        const n = parseInt(el.dataset.step, 10);
        if (n < Setup.step) goStep(n);
      });
    });

    // 实时预览
    const pairs = [
      ['setupStudents', refreshStudentPreview],
      ['setupGroups', refreshGroupPreview],
      ['setupRules', refreshRulePreview],
      ['setupShop', refreshShopPreview]
    ];
    pairs.forEach(([id, fn]) => {
      const el = $(id);
      if (el) el.addEventListener('input', fn);
    });

    // 端口
    const portInput = $('setupPort');
    const resetPortBtn = $('setupResetPort');
    if (portInput) {
      portInput.addEventListener('input', () => showError(1, ''));
      portInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); goStep(2); }
      });
    }
    if (resetPortBtn) {
      resetPortBtn.addEventListener('click', () => {
        if (portInput) portInput.value = 4000;
        showError(1, '');
      });
    }

    // 班级名称回车
    const nameInput = $('setupClassName');
    if (nameInput) {
      nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); goStep(2); }
      });
    }

    // 完成
    const finishBtn = $('setupFinishBtn');
    if (finishBtn) finishBtn.addEventListener('click', submit);
    const skipAll = $('setupSkipAll');
    if (skipAll) skipAll.addEventListener('click', () => {
      const shop = $('setupShop');
      if (shop) shop.value = '';
      refreshShopPreview();
      submit();
    });

    // 导入已有备份
    bindImport();

    // 离开提醒
    window.addEventListener('beforeunload', e => {
      if (Setup.restarting) return;
      if (Setup.step === 'done') return;
      const hasInput = ['setupClassName', 'setupStudents', 'setupGroups', 'setupRules', 'setupShop']
        .some(id => $(id) && $(id).value.trim());
      if (hasInput) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  // ==================== 初始化 ====================

  async function init() {
    bindEvents();

    // 读取服务端状态
    try {
      const res = await fetch('/api/setup/status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        Setup.serverPort = data.port || 4000;
        if (!data.needsSetup) {
          // 已完成初始化，直接进系统
          window.location.replace('/index.html');
          return;
        }
        if ($('setupPort')) $('setupPort').value = data.port || data.defaultPort || 4000;
      }
    } catch (err) {
      if ($('setupPort')) $('setupPort').value = 4000;
    }

    if ($('setupPort') && !$('setupPort').value) $('setupPort').value = 4000;
    goStep(1);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
