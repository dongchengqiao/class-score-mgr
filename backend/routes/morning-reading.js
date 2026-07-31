const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const DB = require('../json-db');

const OLD_FILE = path.join(__dirname, '..', 'data', 'morning-reading.json');

// ==================== 启动迁移 ====================
// 如果旧的 morning-reading.json 存在，将其数据合并到 class-data.json 后删除
(function migrateOldData() {
  try {
    if (fs.existsSync(OLD_FILE)) {
      const raw = fs.readFileSync(OLD_FILE, 'utf-8');
      const old = JSON.parse(raw);
      if (old.scoresMap && typeof old.scoresMap === 'object') {
        const count = DB.batchUpdateReadingPoints(old.scoresMap);
        console.log(`📋 已从 morning-reading.json 迁移 ${count} 名学生的早读积分`);
      }
      fs.unlinkSync(OLD_FILE);
      console.log('🗑️ 已删除旧的 morning-reading.json');
    }
  } catch (err) {
    console.warn('迁移旧数据时出错 (可忽略):', err.message);
  }
})();

// ==================== GET ====================

/** 获取早读加分数据（学生列表 + 积分），数据来自 class-data.json */
router.get('/', (req, res) => {
  try {
    const students = DB.getStudents();
    const scoresMap = {};
    for (const s of students) {
      scoresMap[s.id] = s.reading_points || 0;
    }
    res.json({ students, scoresMap });
  } catch (err) {
    console.error('GET /api/morning-reading error:', err);
    res.status(500).json({ error: '获取早读数据失败' });
  }
});

// ==================== POST ====================

/** 保存早读加分数据（更新每个学生的 reading_points） */
router.post('/', (req, res) => {
  try {
    const { scoresMap } = req.body;
    if (!scoresMap || typeof scoresMap !== 'object') {
      return res.status(400).json({ error: '请提供有效的 scoresMap 数据' });
    }
    const count = DB.batchUpdateReadingPoints(scoresMap);
    res.json({ success: true, message: `保存成功 (${count} 人)` });
  } catch (err) {
    console.error('POST /api/morning-reading error:', err);
    res.status(500).json({ error: '保存早读数据失败' });
  }
});


module.exports = router;
