const express = require('express');
const router = express.Router();
const DB = require('../json-db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 头像上传配置
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `avatar_${req.params.id}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) return cb(null, true);
    cb(new Error('仅支持图片格式: jpg, jpeg, png, gif, webp'));
  }
});

// ==================== GET ====================

/** 获取所有学生 (支持 ?search=关键词) */
router.get('/', (req, res) => {
  try {
    const search = req.query.search || '';
    const students = DB.getStudents(search);
    const result = students.map(s => ({ ...s, history: DB.getHistory(s.id, 'ASC') }));
    res.json(result);
  } catch (err) {
    console.error('GET /api/students error:', err);
    res.status(500).json({ error: '获取学生列表失败' });
  }
});

/** 获取单个学生 */
router.get('/:id', (req, res) => {
  try {
    const student = DB.getStudent(parseInt(req.params.id));
    if (!student) return res.status(404).json({ error: '学生不存在' });
    student.history = DB.getHistory(student.id, 'ASC');
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: '获取学生信息失败' });
  }
});

/** 获取学生历史记录 */
router.get('/:id/history', (req, res) => {
  try {
    const history = DB.getHistory(parseInt(req.params.id), 'DESC');
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: '获取历史记录失败' });
  }
});

// ==================== POST ====================

/** 添加学生 (支持批量) */
router.post('/', (req, res) => {
  try {
    const { names, gender } = req.body;
    if (!names || !Array.isArray(names) || names.length === 0) {
      return res.status(400).json({ error: '请提供学生姓名列表' });
    }
    const ids = DB.addStudents(names, gender);
    const created = ids.map(id => DB.getStudent(id));
    res.status(201).json(created);
  } catch (err) {
    console.error('POST /api/students error:', err);
    res.status(500).json({ error: '添加学生失败' });
  }
});

/** 学生加减分 */
router.post('/:id/points', (req, res) => {
  try {
    const studentId = parseInt(req.params.id);
    const { points, reason } = req.body;
    if (typeof points !== 'number') {
      return res.status(400).json({ error: '请提供有效的分值' });
    }
    const result = DB.addPoints(studentId, points, reason || '自定义');
    if (!result) return res.status(404).json({ error: '学生不存在' });
    const updated = DB.getStudent(studentId);
    updated.history = DB.getHistory(studentId, 'ASC');
    res.json(updated);
  } catch (err) {
    console.error('POST /api/students/:id/points error:', err);
    res.status(500).json({ error: '加减分失败' });
  }
});

/** 批量加减分 */
router.post('/batch-points', (req, res) => {
  try {
    const { studentIds, points, reason } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: '请选择学生' });
    }
    if (typeof points !== 'number') {
      return res.status(400).json({ error: '请提供有效的分值' });
    }
    const appliedCount = DB.batchAddPoints(studentIds, points, reason);
    res.json({ success: true, appliedCount, message: `成功为 ${appliedCount} 名学生操作` });
  } catch (err) {
    console.error('POST /api/students/batch-points error:', err);
    res.status(500).json({ error: '批量操作失败' });
  }
});

/** 撤回历史记录 */
router.post('/:id/history/:hid/revert', (req, res) => {
  try {
    const studentId = parseInt(req.params.id);
    const historyId = parseInt(req.params.hid);
    // 每个学生的 history id 独立从 1 开始，按 学生ID + 历史ID 精确定位
    const record = DB.getHistoryRecord(studentId, historyId);
    if (!record) {
      return res.status(404).json({ error: '记录不存在' });
    }
    const student = DB.getStudent(studentId);
    if (!student) return res.status(404).json({ error: '学生不存在' });

    DB.updateStudent(studentId, { total_points: student.total_points - record.points });

    if (record.reason && record.reason.startsWith('兑换商品: ')) {
      const itemName = record.reason.replace('兑换商品: ', '');
      const cost = Math.abs(record.points);
      DB.addUsedPoints(studentId, -cost);
      const item = DB.findShopItemByName(itemName);
      if (item) DB.adjustStock(item.id, 1);
    }

    DB.deleteHistory(studentId, historyId);
    const updated = DB.getStudent(studentId);
    updated.history = DB.getHistory(studentId, 'ASC');
    res.json(updated);
  } catch (err) {
    console.error('POST /api/students/:id/history/:hid/revert error:', err);
    res.status(500).json({ error: '撤回失败' });
  }
});

/** 上传头像 */
router.post('/:id/avatar', upload.single('avatar'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择图片' });
    const avatarUrl = `/uploads/${req.file.filename}`;
    DB.updateStudent(parseInt(req.params.id), { avatar: avatarUrl });
    res.json({ avatar: avatarUrl });
  } catch (err) {
    res.status(500).json({ error: '上传头像失败' });
  }
});

// ==================== PUT ====================

/** 更新学生信息 */
router.put('/:id', (req, res) => {
  try {
    const student = DB.getStudent(parseInt(req.params.id));
    if (!student) return res.status(404).json({ error: '学生不存在' });
    const { name, gender } = req.body;
    DB.updateStudent(student.id, { name: name || student.name, gender: gender || student.gender });
    const updated = DB.getStudent(student.id);
    updated.history = DB.getHistory(student.id, 'ASC');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: '更新学生信息失败' });
  }
});

// ==================== DELETE ====================

/** 删除单个学生 */
router.delete('/:id', (req, res) => {
  try {
    if (!DB.deleteStudent(parseInt(req.params.id))) {
      return res.status(404).json({ error: '学生不存在' });
    }
    res.json({ success: true, message: '已删除' });
  } catch (err) {
    res.status(500).json({ error: '删除学生失败' });
  }
});

/** 重置所有学生积分为 0 */
router.post('/reset-points', (req, res) => {
  try {
    const count = DB.resetAllPoints();
    res.json({ success: true, count, message: `已重置 ${count} 名学生的积分` });
  } catch (err) {
    res.status(500).json({ error: '积分重置失败' });
  }
});

/** 删除所有学生 */
router.delete('/', (req, res) => {
  try {
    DB.deleteAllStudents();
    res.json({ success: true, message: '已删除所有学生' });
  } catch (err) {
    res.status(500).json({ error: '删除所有学生失败' });
  }
});

module.exports = router;
