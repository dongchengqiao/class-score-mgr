// ============================================================
// 初始化向导接口（公开，无需鉴权）
//   GET  /api/setup/status   — 是否需要初始化 / 当前端口 / 版本
//   POST /api/setup/complete — 写入端口配置与初始数据，可选重启
// ============================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const DB = require('../json-db');
const setupState = require('../lib/setup-state');
const runtime = require('../lib/runtime');

const MIN_PORT = 1024;
const MAX_PORT = 65535;

/** 校验端口 */
function validatePort(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < MIN_PORT || n > MAX_PORT) return null;
  return n;
}

/** 归一化性别 */
function normalizeGender(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['女', 'female', 'f', '女生', '女孩', 'woman'].includes(v)) return 'female';
  if (['男', 'male', 'm', '男生', '男孩', 'man'].includes(v)) return 'male';
  return null;
}

/** 解析学生列表（支持 {name,gender} 对象或字符串） */
function parseStudents(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input) {
    if (!item) continue;
    let name = '';
    let gender = 'male';
    if (typeof item === 'string') {
      // 支持 "姓名<TAB>性别" / "姓名,性别"
      const parts = item.split(/[\t,，]+/).map(s => s.trim()).filter(Boolean);
      name = parts[0] || '';
      gender = normalizeGender(parts[1]) || 'male';
    } else if (typeof item === 'object') {
      name = String(item.name || '').trim();
      gender = normalizeGender(item.gender) || 'male';
    }
    if (name) out.push({ name, gender });
  }
  return out;
}

// ==================== GET /status ====================

router.get('/status', (req, res) => {
  try {
    res.json({
      needsSetup: setupState.needsSetup(),
      port: setupState.readPort(),
      defaultPort: setupState.DEFAULT_PORT,
      version: setupState.getVersion(),
      dataDir: setupState.DATA_DIR
    });
  } catch (err) {
    console.error('读取初始化状态失败:', err);
    res.status(500).json({ error: '读取初始化状态失败' });
  }
});

// ==================== POST /complete ====================

router.post('/complete', async (req, res) => {
  try {
    const body = req.body || {};

    // ---- 1. 端口 ----
    const port = body.port === undefined || body.port === null || body.port === ''
      ? setupState.DEFAULT_PORT
      : validatePort(body.port);
    if (port === null) {
      return res.status(400).json({ error: `端口需在 ${MIN_PORT} ~ ${MAX_PORT} 之间` });
    }
    const portChanged = port !== setupState.readPort();

    // ---- 2. 学生 ----
    const students = parseStudents(body.students);
    let studentIds = [];
    if (students.length) {
      // 按性别分组批量创建
      const males = students.filter(s => s.gender === 'male').map(s => s.name);
      const females = students.filter(s => s.gender === 'female').map(s => s.name);
      if (males.length) studentIds = studentIds.concat(DB.addStudents(males, 'male'));
      if (females.length) studentIds = studentIds.concat(DB.addStudents(females, 'female'));
    }

    // ---- 3. 小组 ----
    const groupNames = Array.isArray(body.groups)
      ? body.groups.map(g => (typeof g === 'string' ? g.trim() : String(g && g.name || '').trim())).filter(Boolean)
      : [];
    for (const name of groupNames) DB.addGroup(name);

    // ---- 4. 规则 ----
    let ruleCount = 0;
    if (Array.isArray(body.rules)) {
      for (const r of body.rules) {
        if (!r) continue;
        const name = typeof r === 'string' ? r.trim() : String(r.name || '').trim();
        if (!name) continue;
        const type = DB.RULE_TYPES.includes(r && r.type) ? r.type : 'fixed';
        const points = type === 'fixed' ? (Number(r && r.points) || 0) : 0;
        DB.addRule(name, points, { type, presets: r && r.presets });
        ruleCount++;
      }
    }

    // ---- 5. 商品 ----
    let shopCount = 0;
    if (Array.isArray(body.shopItems)) {
      for (const item of body.shopItems) {
        if (!item) continue;
        const name = typeof item === 'string' ? item.trim() : String(item.name || '').trim();
        if (!name) continue;
        const cost = Math.max(0, parseInt(item.cost, 10) || 0);
        const stock = Math.max(0, parseInt(item.stock, 10) || 0);
        DB.addShopItem(name, cost, stock);
        shopCount++;
      }
    }

    // ---- 6. 班级信息 / 端口 / 完成标记 ----
    if (body.className && String(body.className).trim()) {
      DB.setSetting('class_name', String(body.className).trim());
    }
    // 端口持久化到 data/config.json（json-db 负责写入）
    DB.setSetting('port', port);
    DB.setSetting('setup_completed', true);
    DB.setSetting('setup_completed_at', new Date().toISOString());

    setupState.markCompleted();

    const summary = {
      port,
      portChanged,
      students: studentIds.length,
      groups: groupNames.length,
      rules: ruleCount,
      shopItems: shopCount
    };

    // 端口变化才需要重启；否则直接返回
    if (!portChanged) {
      return res.json({ success: true, restarted: false, ...summary });
    }

    res.json({ success: true, restarted: true, ...summary });
    // 响应已发出后再重启，避免连接被掐断；显式传入新端口覆盖继承的 PORT
    runtime.restart(900, { port }).catch(err => console.error('初始化后重启失败:', err));
  } catch (err) {
    console.error('初始化失败:', err);
    res.status(500).json({ error: err.message || '初始化失败' });
  }
});

// ==================== POST /reset-port ====================

router.post('/reset-port', (req, res) => {
  try {
    const port = validatePort((req.body || {}).port);
    if (port === null) return res.status(400).json({ error: `端口需在 ${MIN_PORT} ~ ${MAX_PORT} 之间` });
    DB.setSetting('port', port);
    res.json({ success: true, port, portChanged: port !== setupState.readPort() });
  } catch (err) {
    res.status(500).json({ error: '保存端口失败' });
  }
});

module.exports = router;
