const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const DB = require('../json-db');
const { generateToken } = require('../middleware/auth');

/** 计算 SHA-256 哈希 */
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ==================== GET ====================

/** 检查密码设置状态（管理员密码 + 用户密码） */
router.get('/status', (req, res) => {
  try {
    const adminHash = DB.getSetting('app_password_hash');
    const userHash = DB.getSetting('user_password_hash');
    res.json({
      hasPassword: !!adminHash,
      hasAdminPassword: !!adminHash,
      hasUserPassword: !!userHash
    });
  } catch (err) {
    res.status(500).json({ error: '获取状态失败' });
  }
});

// ==================== POST ====================

/** 验证管理员密码 — 成功时返回 admin Token */
router.post('/verify', (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: '请输入密码' });

    const inputHash = hashPassword(password);
    const storedHash = DB.getSetting('app_password_hash');

    if (!storedHash) {
      const token = generateToken('admin');
      return res.json({ success: true, role: 'admin', token });
    }

    if (inputHash === storedHash) {
      const token = generateToken('admin');
      return res.json({ success: true, role: 'admin', token });
    }

    res.status(401).json({ success: false, error: '管理员密码错误' });
  } catch (err) {
    res.status(500).json({ error: '验证失败' });
  }
});

/** 验证用户密码 — 成功时返回 user Token（可加减分，不可访问管理后台） */
router.post('/verify-user', (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: '请输入密码' });

    const inputHash = hashPassword(password);
    const storedHash = DB.getSetting('user_password_hash');

    if (!storedHash) {
      return res.status(400).json({ success: false, error: '系统未设置用户密码，请联系管理员设置' });
    }

    if (inputHash === storedHash) {
      const token = generateToken('user');
      return res.json({ success: true, role: 'user', token });
    }

    res.status(401).json({ success: false, error: '用户密码错误' });
  } catch (err) {
    res.status(500).json({ error: '验证失败' });
  }
});

/** 设置用户密码 — 成功后直接返回 user Token */
router.post('/set-user-password', (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 1) {
      return res.status(400).json({ error: '密码不能为空' });
    }
    DB.setSetting('user_password_hash', hashPassword(password));
    const token = generateToken('user');
    res.json({ success: true, message: '用户密码设置成功', token });
  } catch (err) {
    res.status(500).json({ error: '设置用户密码失败' });
  }
});

/** 修改用户密码（无需旧密码，依赖管理员 token 身份） */
router.post('/change-user-password', (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 1) {
      return res.status(400).json({ error: '新密码不能为空' });
    }

    DB.setSetting('user_password_hash', hashPassword(newPassword));
    res.json({ success: true, message: '用户密码修改成功' });
  } catch (err) {
    res.status(500).json({ error: '修改用户密码失败' });
  }
});

/** 取消用户密码（依赖管理员 token 身份） */
router.post('/cancel-user-password', (req, res) => {
  try {
    DB.deleteSetting('user_password_hash');
    res.json({ success: true, message: '用户密码已取消' });
  } catch (err) {
    res.status(500).json({ error: '取消用户密码失败' });
  }
});

/** 设置管理员密码 — 成功后直接返回 admin Token */
router.post('/set-password', (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 1) {
      return res.status(400).json({ error: '密码不能为空' });
    }
    DB.setSetting('app_password_hash', hashPassword(password));
    const token = generateToken('admin');
    res.json({ success: true, message: '密码设置成功', token });
  } catch (err) {
    res.status(500).json({ error: '设置密码失败' });
  }
});

/** 修改管理员密码（无需旧密码，依赖 admin token 身份） */
router.post('/change-password', (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 1) {
      return res.status(400).json({ error: '新密码不能为空' });
    }

    DB.setSetting('app_password_hash', hashPassword(newPassword));
    res.json({ success: true, message: '密码修改成功' });
  } catch (err) {
    res.status(500).json({ error: '修改密码失败' });
  }
});

/** 取消管理员密码（依赖 admin token 身份） */
router.post('/cancel-password', (req, res) => {
  try {
    DB.deleteSetting('app_password_hash');
    res.json({ success: true, message: '密码已取消' });
  } catch (err) {
    res.status(500).json({ error: '取消密码失败' });
  }
});

module.exports = router;
