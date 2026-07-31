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

/** 检查是否已设置密码 */
router.get('/status', (req, res) => {
  try {
    const hash = DB.getSetting('app_password_hash');
    res.json({ hasPassword: !!hash });
  } catch (err) {
    res.status(500).json({ error: '获取状态失败' });
  }
});

// ==================== POST ====================

/** 验证密码 — 成功时返回 JWT Token */
router.post('/verify', (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: '请输入密码' });

    const inputHash = hashPassword(password);
    const storedHash = DB.getSetting('app_password_hash');

    if (!storedHash) {
      const token = generateToken('admin');
      return res.json({ success: true, isAdmin: false, token });
    }

    if (inputHash === storedHash) {
      const token = generateToken('admin');
      return res.json({ success: true, isAdmin: false, token });
    }

    res.status(401).json({ success: false, error: '密码错误' });
  } catch (err) {
    res.status(500).json({ error: '验证失败' });
  }
});

/** 获取访客 Token（无需密码） */
router.post('/guest-token', (req, res) => {
  try {
    const storedHash = DB.getSetting('app_password_hash');
    if (!storedHash) {
      return res.status(400).json({ error: '系统未设置密码，无需访客模式' });
    }
    const token = generateToken('guest');
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ error: '获取访客令牌失败' });
  }
});

/** 设置密码 — 成功后直接返回 Token */
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

/** 修改密码 */
router.post('/change-password', (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请填写所有字段' });
    }

    const oldHash = hashPassword(oldPassword);
    const storedHash = DB.getSetting('app_password_hash');

    if (oldHash !== storedHash) {
      return res.status(401).json({ error: '旧密码错误' });
    }

    DB.setSetting('app_password_hash', hashPassword(newPassword));
    res.json({ success: true, message: '密码修改成功' });
  } catch (err) {
    res.status(500).json({ error: '修改密码失败' });
  }
});

/** 取消密码 */
router.post('/cancel-password', (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: '请输入密码验证身份' });

    const inputHash = hashPassword(password);
    const storedHash = DB.getSetting('app_password_hash');

    if (inputHash !== storedHash) {
      return res.status(401).json({ error: '密码验证失败' });
    }

    DB.deleteSetting('app_password_hash');
    res.json({ success: true, message: '密码已取消' });
  } catch (err) {
    res.status(500).json({ error: '取消密码失败' });
  }
});

module.exports = router;
