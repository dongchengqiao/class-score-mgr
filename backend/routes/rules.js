const express = require('express');
const router = express.Router();
const DB = require('../json-db');

// ==================== 工具 ====================

/** 解析并校验规则类型 */
function parseType(value) {
  if (value === undefined || value === null || value === '') return 'fixed';
  return DB.RULE_TYPES.includes(value) ? value : null;
}

/** 解析推荐分数（支持数组或逗号分隔字符串） */
function parsePresets(value) {
  if (value === undefined || value === null || value === '') return undefined;
  let list = value;
  if (typeof value === 'string') {
    list = value.split(/[,，\s]+/).filter(Boolean);
  }
  if (!Array.isArray(list)) return undefined;
  const out = [];
  for (const item of list) {
    const n = Math.abs(parseInt(item, 10));
    if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  out.sort((a, b) => a - b);
  return out.length ? out.slice(0, 8) : undefined;
}

// ==================== GET ====================

router.get('/', (req, res) => {
  try {
    res.json(DB.getRules());
  } catch (err) {
    res.status(500).json({ error: '获取规则列表失败' });
  }
});

// ==================== POST ====================

router.post('/', (req, res) => {
  try {
    const { name, points, type, presets } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '请提供有效的规则名称' });
    }

    const parsedType = parseType(type);
    if (!parsedType) {
      return res.status(400).json({ error: '无效的规则类型' });
    }

    let finalPoints = 0;
    if (parsedType === 'fixed') {
      if (typeof points !== 'number' || !Number.isFinite(points)) {
        return res.status(400).json({ error: '固定分值规则需要提供有效的分值' });
      }
      finalPoints = points;
    }

    const id = DB.addRule(name.trim(), finalPoints, {
      type: parsedType,
      presets: parsePresets(presets)
    });
    res.status(201).json(DB.getRule(id));
  } catch (err) {
    res.status(500).json({ error: '添加规则失败' });
  }
});

// ==================== PUT ====================

router.put('/reorder', (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: '无效的排序数据' });
    DB.reorderRules(order);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '排序失败' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const rule = DB.getRule(parseInt(req.params.id));
    if (!rule) return res.status(404).json({ error: '规则不存在' });

    const { name, points, type, presets } = req.body || {};
    const fields = {};

    if (name !== undefined) {
      if (!name || !name.trim()) return res.status(400).json({ error: '规则名称不能为空' });
      fields.name = name.trim();
    }

    if (type !== undefined) {
      const parsedType = parseType(type);
      if (!parsedType) return res.status(400).json({ error: '无效的规则类型' });
      fields.type = parsedType;
    }

    const effectiveType = fields.type || rule.type || 'fixed';
    if (points !== undefined) {
      if (typeof points !== 'number' || !Number.isFinite(points)) {
        return res.status(400).json({ error: '分值必须为数字' });
      }
      if (effectiveType === 'fixed') fields.points = points;
    }

    if (presets !== undefined) {
      const parsed = parsePresets(presets);
      if (parsed) fields.presets = parsed;
    }

    DB.updateRule(rule.id, fields);
    res.json(DB.getRule(rule.id));
  } catch (err) {
    res.status(500).json({ error: '更新规则失败' });
  }
});

// ==================== DELETE ====================

router.delete('/:id', (req, res) => {
  try {
    if (!DB.deleteRule(parseInt(req.params.id))) {
      return res.status(404).json({ error: '规则不存在' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除规则失败' });
  }
});

module.exports = router;
