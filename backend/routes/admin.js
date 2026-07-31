const express = require('express');
const router = express.Router();
const DB = require('../json-db');

// ==================== GET ====================

/** 系统统计数据 */
router.get('/stats', (req, res) => {
  try {
    const students = DB.getStudents();
    const groups = DB.getGroups();
    const rules = DB.getRules();
    const shop = DB.getShopItems();

    let totalPoints = 0, totalUsedPoints = 0, totalHistory = 0;
    for (const s of students) {
      totalPoints += s.total_points || 0;
      totalUsedPoints += s.used_points || 0;
      if (Array.isArray(s.history)) totalHistory += s.history.length;
    }

    const passwordHash = DB.getSetting('app_password_hash');
    const maxHistoryId = (() => {
      let max = 0;
      for (const s of students) {
        if (Array.isArray(s.history)) {
          for (const h of s.history) {
            if (h.id > max) max = h.id;
          }
        }
      }
      return max;
    })();

    res.json({
      students: {
        total: students.length,
        male: students.filter(s => s.gender === 'male').length,
        female: students.filter(s => s.gender === 'female').length
      },
      groups: { total: groups.length },
      rules: {
        total: rules.length,
        positive: rules.filter(r => r.points > 0).length,
        negative: rules.filter(r => r.points < 0).length
      },
      shop: { total: shop.length },
      totalPoints,
      totalUsedPoints,
      totalHistory,
      maxHistoryId,
      hasPassword: !!passwordHash,
      sequences: DB.exportAll()._sequences
    });
  } catch (err) {
    console.error('GET /api/admin/stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

/** 获取所有设置 */
router.get('/settings', (req, res) => {
  try {
    const settings = DB.getAllSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** 获取所有历史记录（按时间降序，分页） */
router.get('/history', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize) || 50));
    const students = DB.getStudents();

    // 收集所有历史记录，附上学生姓名
    const allHistory = [];
    for (const s of students) {
      if (Array.isArray(s.history)) {
        for (const h of s.history) {
          allHistory.push({
            ...h,
            student_name: s.name,
            student_gender: s.gender
          });
        }
      }
    }

    // 按时间降序
    allHistory.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = allHistory.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const items = allHistory.slice(start, start + pageSize);

    res.json({ items, total, page, pageSize, totalPages });
  } catch (err) {
    console.error('GET /api/admin/history error:', err);
    res.status(500).json({ error: err.message });
  }
});

/** 获取所有学生简要列表（用于管理端） */
router.get('/students', (req, res) => {
  try {
    const students = DB.getStudents();
    const list = students.map(s => ({
      id: s.id, name: s.name, gender: s.gender,
      total_points: s.total_points,
      used_points: s.used_points,
      reading_points: s.reading_points,
      group_id: s.group_id,
      historyCount: Array.isArray(s.history) ? s.history.length : 0
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== PUT ====================

/** 更新设置 */
router.put('/settings/:key', (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (key === undefined || value === undefined) {
      return res.status(400).json({ error: '请提供 key 和 value' });
    }
    DB.setSetting(key, value);
    res.json({ success: true, key, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== DELETE ====================

/** 删除设置 */
router.delete('/settings/:key', (req, res) => {
  try {
    DB.deleteSetting(req.params.key);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
