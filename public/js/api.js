// ============================================================
// API 客户端 - 所有前后端通信的封装
// ============================================================
const API = {
  baseUrl: '', // 同源请求，无需前缀

  /** 获取保存的 Token */
  getToken() {
    return localStorage.getItem('auth_token');
  },

  /** 保存 Token */
  setToken(token) {
    localStorage.setItem('auth_token', token);
  },

  /** 清除 Token */
  clearToken() {
    localStorage.removeItem('auth_token');
  },

  /** 通用请求方法 */
  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const options = { method, headers };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }
    const res = await fetch(`${this.baseUrl}${path}`, options);

    // Token 过期或无效 → 清除并弹窗提示
    if (res.status === 401) {
      this.clearToken();
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '登录已过期，请重新登录');
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  },

  // ==================== 学生 ====================

  /** 获取所有学生，支持搜索 */
  getStudents(search) {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.request('GET', `/api/students${qs}`);
  },

  /** 添加学生（批量） */
  addStudents(names, gender) {
    return this.request('POST', '/api/students', { names, gender });
  },

  /** 更新学生信息 */
  updateStudent(id, data) {
    return this.request('PUT', `/api/students/${id}`, data);
  },

  /** 删除单个学生 */
  deleteStudent(id) {
    return this.request('DELETE', `/api/students/${id}`);
  },

  /** 删除所有学生 */
  deleteAllStudents() {
    return this.request('DELETE', '/api/students');
  },

  /** 重置所有学生积分 */
  resetAllPoints() {
    return this.request('POST', '/api/students/reset-points');
  },

  /** 加减分 */
  addPoints(id, points, reason) {
    return this.request('POST', `/api/students/${id}/points`, { points, reason });
  },

  /** 批量加减分 */
  batchPoints(studentIds, points, reason) {
    return this.request('POST', '/api/students/batch-points', { studentIds, points, reason });
  },

  /** 撤回历史 */
  revertHistory(studentId, historyId) {
    return this.request('POST', `/api/students/${studentId}/history/${historyId}/revert`);
  },

  /** 获取系统设置（含班级名称） */
  getSettings() {
    return this.request('GET', '/api/data/settings');
  },

  /** 上传头像 */
  async uploadAvatar(id, file) {
    const formData = new FormData();
    formData.append('avatar', file);
    const headers = {};
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`/api/students/${id}/avatar`, { method: 'POST', headers, body: formData });
    if (res.status === 401) {
      this.clearToken();
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '上传失败');
    return data;
  },

  // ==================== 小组 ====================

  getGroups() {
    return this.request('GET', '/api/groups');
  },

  addGroup(name) {
    return this.request('POST', '/api/groups', { name });
  },

  updateGroup(id, name) {
    return this.request('PUT', `/api/groups/${id}`, { name });
  },

  deleteGroup(id) {
    return this.request('DELETE', `/api/groups/${id}`);
  },

  addStudentsToGroup(groupId, studentIds) {
    return this.request('POST', `/api/groups/${groupId}/students`, { studentIds });
  },

  removeStudentFromGroup(groupId, studentId) {
    return this.request('DELETE', `/api/groups/${groupId}/students/${studentId}`);
  },

  groupPoints(groupId, studentIds, points, reason) {
    return this.request('POST', `/api/groups/${groupId}/points`, { studentIds, points, reason });
  },

  // ==================== 规则 ====================

  getRules() {
    return this.request('GET', '/api/rules');
  },

  addRule(name, points) {
    return this.request('POST', '/api/rules', { name, points });
  },

  updateRule(id, data) {
    return this.request('PUT', `/api/rules/${id}`, data);
  },

  deleteRule(id) {
    return this.request('DELETE', `/api/rules/${id}`);
  },

  reorderRules(order) {
    return this.request('PUT', '/api/rules/reorder', { order });
  },

  // ==================== 商店 ====================

  getShopItems() {
    return this.request('GET', '/api/shop');
  },

  addShopItem(name, cost, stock) {
    return this.request('POST', '/api/shop', { name, cost, stock });
  },

  updateShopItem(id, data) {
    return this.request('PUT', `/api/shop/${id}`, data);
  },

  deleteShopItem(id) {
    return this.request('DELETE', `/api/shop/${id}`);
  },

  purchaseItem(itemId, studentId) {
    return this.request('POST', `/api/shop/${itemId}/purchase`, { studentId });
  },

  // ==================== 认证 ====================

  getAuthStatus() {
    return this.request('GET', '/api/auth/status');
  },

  /** 验证管理员密码 → admin token（可访问管理后台） */
  verifyPassword(password) {
    return this.request('POST', '/api/auth/verify', { password });
  },

  /** 验证用户密码 → user token（可加减分，不可访问管理后台） */
  verifyUserPassword(password) {
    return this.request('POST', '/api/auth/verify-user', { password });
  },

  /** 解析当前 token 的角色：'admin' | 'user' | 'guest' | null */
  getRole() {
    const token = this.getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.role || null;
    } catch (e) {
      return null;
    }
  },

  setPassword(password) {
    return this.request('POST', '/api/auth/set-password', { password });
  },

  changePassword(newPassword) {
    return this.request('POST', '/api/auth/change-password', { newPassword });
  },

  cancelPassword() {
    return this.request('POST', '/api/auth/cancel-password');
  },

  /** 设置用户密码 */
  setUserPassword(password) {
    return this.request('POST', '/api/auth/set-user-password', { password });
  },

  /** 修改用户密码（无需旧密码） */
  changeUserPassword(newPassword) {
    return this.request('POST', '/api/auth/change-user-password', { newPassword });
  },

  /** 取消用户密码 */
  cancelUserPassword() {
    return this.request('POST', '/api/auth/cancel-user-password');
  },

  // ==================== 数据 ====================

  exportData() {
    return this.request('GET', '/api/data/export');
  },

  importData(data) {
    return this.request('POST', '/api/data/import', data);
  },

  exportReport(startDate, endDate) {
    return this.request('POST', '/api/data/export-report', { startDate, endDate });
  },

  exportGroupReport(startDate, endDate, groupIds) {
    return this.request('POST', '/api/data/export-group-report', { startDate, endDate, groupIds });
  },

  /** 健康检查 */
  healthCheck() {
    return this.request('GET', '/api/health');
  },

  // ==================== 早读加分 ====================

  /** 获取早读加分数据（学生列表 + scoresMap，数据来自 class-data.json 的 reading_points） */
  getMorningReading() {
    return this.request('GET', '/api/morning-reading');
  },

  /** 保存早读加分数据（更新每个学生的 reading_points） */
  saveMorningReading(scoresMap) {
    return this.request('POST', '/api/morning-reading', { scoresMap });
  },

};
