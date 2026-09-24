const express = require('express');
const router = express.Router();
const DB = require('../json-db');

function nowISO() {
  return new Date().toISOString();
}

// ==================== GET ====================

/** 获取系统设置（含班级名称） */
router.get('/settings', (req, res) => {
  try {
    const settings = DB.getAllSettings();
    res.json({ settings });
  } catch (err) {
    console.error('GET /api/data/settings error:', err);
    res.status(500).json({ error: '获取设置失败' });
  }
});

/** 导出所有数据 */
router.get('/export', (req, res) => {
  try {
    const exported = DB.exportAll();
    res.json({
      exportDate: nowISO(),
      students: exported.students,
      groups: exported.groups,
      rules: exported.rules,
      shopItems: exported.shopItems,
      history: exported.history
    });
  } catch (err) {
    console.error('GET /api/data/export error:', err);
    res.status(500).json({ error: '导出失败' });
  }
});

// ==================== POST ====================

/** 导入所有数据 */
router.post('/import', (req, res) => {
  try {
    DB.importAll(req.body);
    res.json({ success: true, message: '数据导入成功' });
  } catch (err) {
    console.error('POST /api/data/import error:', err);
    res.status(500).json({ error: '导入失败: ' + err.message });
  }
});

/** 生成 Excel 报表数据 */
router.post('/export-report', (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: '请提供日期范围' });
    }

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    const students = DB.getStudents();
    const groups = DB.getGroups();

    // 计算每个学生在时间范围内的积分
    const studentStats = students.map(student => {
      const history = DB.getHistoryInRange(student.id, startISO, endISO);

      let netPoints = 0;
      let positivePoints = 0;
      let negativePoints = 0;

      history.forEach(h => {
        netPoints += h.points;
        if (h.points > 0) positivePoints += h.points;
        else negativePoints += h.points;
      });

      return {
        id: student.id,
        name: student.name,
        groupId: student.group_id,
        netPoints,
        positivePoints,
        negativePoints,
        history
      };
    }).filter(s => s.history.length > 0);

    // 按净得分排序
    studentStats.sort((a, b) => b.netPoints - a.netPoints);

    // 小组统计
    const groupStats = groups.map(group => {
      let groupNetPoints = 0;
      const members = [];

      studentStats.forEach(s => {
        if (s.groupId === group.id) {
          groupNetPoints += s.netPoints;
          members.push({ name: s.name, netPoints: s.netPoints });
        }
      });

      return {
        id: group.id,
        name: group.name,
        netPoints: groupNetPoints,
        members
      };
    }).filter(g => g.members.length > 0);

    groupStats.sort((a, b) => b.netPoints - a.netPoints);

    // 整体统计
    const totalPositive = studentStats.reduce((sum, s) => sum + s.positivePoints, 0);
    const totalNegative = studentStats.reduce((sum, s) => sum + s.negativePoints, 0);
    const totalNet = studentStats.reduce((sum, s) => sum + s.netPoints, 0);

    res.json({
      startDate,
      endDate,
      totalStudents: studentStats.length,
      totalPositive,
      totalNegative,
      totalNet,
      studentStats,
      groupStats
    });
  } catch (err) {
    console.error('POST /api/data/export-report error:', err);
    res.status(500).json({ error: '生成报表失败' });
  }
});

/** 生成小组一周积分详情报表数据 */
router.post('/export-group-report', (req, res) => {
  try {
    const { startDate, endDate, groupIds } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: '请提供日期范围' });
    }

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    const groups = DB.getGroups();
    // 默认全选；若传入了 groupIds 则只导出选中的小组
    const selectedGroups = Array.isArray(groupIds) && groupIds.length > 0
      ? groups.filter(g => groupIds.includes(g.id))
      : groups;

    const result = selectedGroups.map(group => {
      const members = DB.getStudentsByGroup(group.id);
      // 每个成员在时间范围内的积分记录（排除兑换记录）
      const memberStats = members.map(m => {
        const history = DB.getHistoryInRange(m.id, startISO, endISO);
        const delta = history.reduce((sum, h) => sum + h.points, 0);
        return { studentId: m.id, name: m.name, delta, history };
      });

      // 小组开始时间分数 = 时间区间开始前所有成员的累计积分
      const startScore = members.reduce((sum, m) => {
        const before = DB.getHistoryInRange(m.id, '0000-01-01T00:00:00', startISO);
        return sum + before.reduce((s, h) => s + h.points, 0);
      }, 0);

      // 小组结束时间分数 = 开始分数 + 区间内净得分
      const endScore = startScore + memberStats.reduce((sum, m) => sum + m.delta, 0);
      const delta = endScore - startScore;

      return {
        id: group.id,
        name: group.name,
        startScore,
        endScore,
        delta,
        members: memberStats
      };
    });

    // 按区间净得分排序，计算排名
    result.sort((a, b) => b.delta - a.delta);
    result.forEach((g, i) => { g.rank = i + 1; });

    res.json({ startDate, endDate, groups: result });
  } catch (err) {
    console.error('POST /api/data/export-group-report error:', err);
    res.status(500).json({ error: '生成小组报表失败' });
  }
});

module.exports = router;
