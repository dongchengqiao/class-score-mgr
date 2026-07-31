const express = require('express');
const router = express.Router();
const DB = require('../json-db');

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
    const { name, points } = req.body;
    if (!name || !name.trim() || typeof points !== 'number') {
      return res.status(400).json({ error: '请提供有效的规则名称和分值' });
    }
    const id = DB.addRule(name.trim(), points);
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
    const { name, points } = req.body;
    DB.updateRule(rule.id, {
      name: name || rule.name,
      points: typeof points === 'number' ? points : rule.points
    });
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
