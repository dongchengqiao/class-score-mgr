// ============================================================
// UI 工具函数
// ============================================================
const UI = {
  themes: ['theme-default', 'theme-vibrant', 'theme-pastel'],
  currentThemeIndex: 1,

  // ==================== 模态框 ====================

  /** 打开模态框并填充内容 */
  openModal(htmlContent, title = '操作') {
    const modal = document.getElementById('modal');
    const modalTitle = modal.querySelector('.modal-title');
    const modalBody = document.getElementById('modalContent');
    if (modalTitle) modalTitle.textContent = title;
    modalBody.innerHTML = htmlContent;
    modal.style.display = 'block';
    return modal;
  },

  /** 关闭模态框 */
  closeModal(modal) {
    if (!modal) modal = document.getElementById('modal');
    modal.style.display = 'none';
  },

  /** 自定义确认弹窗 */
  confirm(title, message, onConfirm) {
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalContent');
    modalBody.innerHTML = `
      <div class="card" style="box-shadow: none; margin: 0;">
        <div class="card-body" style="text-align: center;">
          <i class="fas fa-question-circle" style="font-size: 48px; color: var(--accent1); margin-bottom: 15px;"></i>
          <h3 style="margin-bottom: 10px;">${title}</h3>
          <p style="margin-bottom: 20px; color: var(--text-light);">${message}</p>
          <div style="display: flex; gap: 12px; justify-content: center;">
            <button id="confirmBtn" class="btn btn-primary"><i class="fas fa-check"></i> 确认</button>
            <button id="cancelBtn" class="btn btn-white"><i class="fas fa-times"></i> 取消</button>
          </div>
        </div>
      </div>
    `;
    modal.style.display = 'block';
    document.getElementById('confirmBtn').onclick = () => { UI.closeModal(modal); onConfirm(); };
    document.getElementById('cancelBtn').onclick = () => UI.closeModal(modal);
  },

  /** 提示弹窗 */
  alert(message) {
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalContent');
    modalBody.innerHTML = `
      <div class="card" style="box-shadow: none; margin: 0;">
        <div class="card-body" style="text-align: center;">
          <i class="fas fa-info-circle" style="font-size: 48px; color: var(--secondary); margin-bottom: 15px;"></i>
          <p style="margin-bottom: 20px;">${message}</p>
          <button id="okBtn" class="btn btn-primary"><i class="fas fa-check"></i> 好的</button>
        </div>
      </div>
    `;
    modal.style.display = 'block';
    document.getElementById('okBtn').onclick = () => UI.closeModal(modal);
  },

  // ==================== 动画 ====================

  /** 创建加减分浮动动画 */
  showPointAnimation(studentId, points) {
    const card = document.querySelector(`.student-card[data-id="${studentId}"]`);
    if (!card) return;
    const animation = document.createElement('div');
    animation.className = `point-animation ${points > 0 ? 'positive' : 'negative'}`;
    animation.textContent = points > 0 ? `+${points}` : `${points}`;
    const rect = card.getBoundingClientRect();
    animation.style.left = `${rect.left + rect.width / 2}px`;
    animation.style.top = `${rect.top + rect.height / 2}px`;
    document.body.appendChild(animation);
    animation.addEventListener('animationend', () => document.body.removeChild(animation));
  },

  // ==================== 主题 ====================

  /** 切换主题 */
  cycleTheme() {
    UI.currentThemeIndex = (UI.currentThemeIndex + 1) % UI.themes.length;
    document.body.className = UI.themes[UI.currentThemeIndex];
    localStorage.setItem('currentThemeIndex', UI.currentThemeIndex);
  },

  /** 加载保存的主题 */
  loadTheme() {
    const saved = localStorage.getItem('currentThemeIndex');
    if (saved !== null) {
      UI.currentThemeIndex = parseInt(saved);
      document.body.className = UI.themes[UI.currentThemeIndex];
    } else {
      document.body.className = UI.themes[1]; // 默认 vibrant
    }
  },

  // ==================== 拖拽 ====================

  /** 设置拖拽放置区 */
  setupDropZones() {
    document.querySelectorAll('.dropzone').forEach(zone => {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const studentId = parseInt(e.dataTransfer.getData('text/plain'));
        const groupId = zone.getAttribute('data-group-id');
        if (groupId) {
          await API.addStudentsToGroup(parseInt(groupId), [studentId]);
        } else {
          // 拖到未分组区域
          const group = App.students.find(s => s.id === studentId)?.group_id;
          if (group) {
            await API.removeStudentFromGroup(group, studentId);
          }
        }
        await App.loadAllData();
      });
    });
  },

  /** 规则拖拽排序 */
  setupRulesDragDrop() {
    const rulesList = document.getElementById('rulesList');
    if (!rulesList) return;
    let draggedRule = null;

    rulesList.addEventListener('dragstart', e => {
      if (e.target.closest('.rule-item')) {
        draggedRule = e.target.closest('.rule-item');
        setTimeout(() => draggedRule.classList.add('dragging'), 0);
      }
    });

    rulesList.addEventListener('dragend', async (e) => {
      if (draggedRule) {
        draggedRule.classList.remove('dragging');
        const items = [...document.querySelectorAll('#rulesList .rule-item')];
        const order = items.map((item, i) => ({
          id: parseInt(item.dataset.id),
          sort_order: i + 1
        }));
        try {
          await API.reorderRules(order);
          await App.loadRules();
          App.renderRules();
        } catch (err) {
          console.error('规则排序保存失败:', err);
        }
        draggedRule = null;
      }
    });

    rulesList.addEventListener('dragover', e => {
      e.preventDefault();
      if (!draggedRule) return;
      const afterElement = UI.getDragAfterElement(rulesList, e.clientY);
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

  // ==================== 图片压缩 ====================

  /** 压缩图片为 WebP base64 */
  compressImage(file, maxWidth = 300, maxHeight = 300, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          let { width, height } = img;
          if (width > height) {
            if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
          } else {
            if (height > maxHeight) { width = Math.round(width * maxHeight / height); height = maxHeight; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/webp', quality));
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  },

  /** 格式化日期 */
  formatDate(isoString) {
    return new Date(isoString).toLocaleString('zh-CN');
  }
};
