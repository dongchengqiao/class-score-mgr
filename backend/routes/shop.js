const express = require('express');
const router = express.Router();
const DB = require('../json-db');

// ==================== GET ====================

router.get('/', (req, res) => {
  try {
    res.json(DB.getShopItems());
  } catch (err) {
    res.status(500).json({ error: '获取商品列表失败' });
  }
});

// ==================== POST ====================

router.post('/', (req, res) => {
  try {
    const { name, cost, stock } = req.body;
    if (!name || !name.trim() || typeof cost !== 'number' || typeof stock !== 'number') {
      return res.status(400).json({ error: '请提供有效的商品信息' });
    }
    const id = DB.addShopItem(name.trim(), cost, stock);
    res.status(201).json(DB.getShopItem(id));
  } catch (err) {
    res.status(500).json({ error: '添加商品失败' });
  }
});

/** 学生兑换商品 */
router.post('/:itemId/purchase', (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const { studentId } = req.body;

    const item = DB.getShopItem(itemId);
    if (!item) return res.status(404).json({ error: '商品不存在' });

    const student = DB.getStudent(parseInt(studentId));
    if (!student) return res.status(404).json({ error: '学生不存在' });

    const availablePoints = student.total_points - student.used_points;
    if (availablePoints < item.cost) {
      return res.status(400).json({ error: '积分不足' });
    }
    if (item.stock <= 0) {
      return res.status(400).json({ error: '库存不足' });
    }

    DB.addUsedPoints(student.id, item.cost);
    DB.adjustStock(itemId, -1);
    DB.addHistory(student.id, -item.cost, `兑换商品: ${item.name}`);

    const updatedStudent = DB.getStudent(student.id);
    updatedStudent.history = DB.getHistory(student.id, 'ASC');
    const updatedItem = DB.getShopItem(itemId);

    res.json({ student: updatedStudent, item: updatedItem });
  } catch (err) {
    console.error('POST /api/shop/:itemId/purchase error:', err);
    res.status(500).json({ error: '兑换失败' });
  }
});

// ==================== PUT ====================

router.put('/:id', (req, res) => {
  try {
    const item = DB.getShopItem(parseInt(req.params.id));
    if (!item) return res.status(404).json({ error: '商品不存在' });

    const { name, cost, stock } = req.body;
    DB.updateShopItem(item.id, {
      name: name || item.name,
      cost: typeof cost === 'number' ? cost : item.cost,
      stock: typeof stock === 'number' ? stock : item.stock
    });
    res.json(DB.getShopItem(item.id));
  } catch (err) {
    res.status(500).json({ error: '更新商品失败' });
  }
});

// ==================== DELETE ====================

router.delete('/:id', (req, res) => {
  try {
    if (!DB.deleteShopItem(parseInt(req.params.id))) {
      return res.status(404).json({ error: '商品不存在' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除商品失败' });
  }
});

module.exports = router;
