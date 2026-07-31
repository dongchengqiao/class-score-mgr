const express = require('express');
const router = express.Router();
const DB = require('../json-db');

// ==================== GET ====================

/** 获取所有小组（含成员信息） */
router.get('/', (req, res) => {
  try {
    const groups = DB.getGroups();
    const result = groups.map(g => {
      const members = DB.getStudentsByGroup(g.id).map(s => ({
        ...s,
        history: DB.getHistory(s.id, 'ASC')
      }));
      return { ...g, students: members };
    });
    res.json(result);
  } catch (err) {
    console.error('GET /api/groups error:', err);
    res.status(500).json({ error: '获取小组列表失败' });
  }
});

// ==================== POST ====================

/** 创建小组 */
router.post('/', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '请输入小组名称' });
    }
    const id = DB.addGroup(name.trim());
    const group = DB.getGroup(id);
    res.status(201).json({ ...group, students: [] });
  } catch (err) {
    res.status(500).json({ error: '创建小组失败' });
  }
});

/** 添加学生到小组 */
router.post('/:id/students', (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const { studentIds } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: '请选择学生' });
    }
    for (const sid of studentIds) {
      DB.setStudentGroup(sid, groupId);
    }
    res.json({ success: true, message: `已添加 ${studentIds.length} 名学生到小组` });
  } catch (err) {
    res.status(500).json({ error: '添加学生到小组失败' });
  }
});

/** 小组内成员加减分 */
router.post('/:id/points', (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const { studentIds, points, reason } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: '请选择小组成员' });
    }
    if (typeof points !== 'number') {
      return res.status(400).json({ error: '请提供有效的分值' });
    }
    let count = 0;
    for (const id of studentIds) {
      const s = DB.getStudent(id);
      if (s && s.group_id === groupId) {
        s.total_points += points;
        DB.addHistory(id, points, `[小组操作] ${reason || '自定义'}`);
        count++;
      }
    }
    DB.flush();
    res.json({ success: true, appliedCount: count, message: `已为 ${count} 名成员操作` });
  } catch (err) {
    console.error('POST /api/groups/:id/points error:', err);
    res.status(500).json({ error: '小组积分操作失败' });
  }
});

// ==================== PUT ====================

/** 修改小组名称 */
router.put('/:id', (req, res) => {
  try {
    const group = DB.getGroup(parseInt(req.params.id));
    if (!group) return res.status(404).json({ error: '小组不存在' });
    const { name } = req.body;
    DB.updateGroup(group.id, name.trim());
    res.json(DB.getGroup(group.id));
  } catch (err) {
    res.status(500).json({ error: '修改小组名称失败' });
  }
});

// ==================== DELETE ====================

/** 删除小组（组内学生变为未分组） */
router.delete('/:id', (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    if (!DB.getGroup(groupId)) return res.status(404).json({ error: '小组不存在' });
    DB.deleteGroup(groupId);
    res.json({ success: true, message: '已删除小组' });
  } catch (err) {
    res.status(500).json({ error: '删除小组失败' });
  }
});

/** 从小组移除某个学生 */
router.delete('/:groupId/students/:studentId', (req, res) => {
  try {
    const { groupId, studentId } = req.params;
    const gid = parseInt(groupId), sid = parseInt(studentId);
    const student = DB.getStudent(sid);
    if (!student || student.group_id !== gid) {
      return res.status(404).json({ error: '该学生不在此小组' });
    }
    DB.setStudentGroup(sid, null);
    DB.addHistory(sid, 0, '从小组移除');
    DB.getStudents(); // ensure any pending ops done
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '移除学生失败' });
  }
});

module.exports = router;
