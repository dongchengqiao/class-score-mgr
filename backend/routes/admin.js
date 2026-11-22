const express = require('express');
const router = express.Router();
const DB = require('../json-db');
const setupState = require('../lib/setup-state');
const runtime = require('../lib/runtime');

const MIN_PORT = 1024;
const MAX_PORT = 65535;

/** 校验端口（非法返回 null） */
function validatePort(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < MIN_PORT || n > MAX_PORT) return null;
  return n;
}

/** 读取环境变量 PORT（未设置或被配置覆盖时返回 null） */
function envPort() {
  return setupState.hasEnvPort() ? parseInt(process.env.PORT, 10) : null;
}

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
        positive: rules.filter(r => (r.type === 'fixed' || !r.type) ? r.points > 0 : r.type !== 'custom-minus').length,
        negative: rules.filter(r => (r.type === 'fixed' || !r.type) ? r.points < 0 : r.type === 'custom-minus').length
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

/** 获取当前服务端口 */
router.get('/port', (req, res) => {
  try {
    const env = envPort();
    res.json({
      port: setupState.readPort(),
      defaultPort: setupState.DEFAULT_PORT,
      envLocked: env !== null,
      envPort: env
    });
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

/** 修改服务端口（写入配置，端口变化时自动重启服务） */
router.put('/port', (req, res) => {
  try {
    const port = validatePort((req.body || {}).port);
    if (port === null) {
      return res.status(400).json({ error: `端口需在 ${MIN_PORT} ~ ${MAX_PORT} 之间` });
    }

    const previousPort = setupState.readPort();
    // 端口持久化到 data/config.json（json-db 负责写入，单一真源）
    DB.setSetting('port', port);

    if (port === previousPort) {
      return res.json({ success: true, port, previousPort, portChanged: false, restarted: false });
    }

    res.json({
      success: true,
      port,
      previousPort,
      portChanged: true,
      restarted: true,
      envLocked: envPort() !== null
    });
    // 响应已发出后再重启，避免连接被掐断；显式传入新端口覆盖继承的 PORT
    runtime.restart(900, { port }).catch(err => console.error('切换端口后重启失败:', err));
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
