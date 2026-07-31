// ============================================================
// JWT 认证中间件
// ============================================================
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'class-points-jwt-secret-2024';
const TOKEN_EXPIRY = '7d';

/**
 * 生成 JWT Token
 * @param {'admin'|'guest'} role
 * @returns {string} JWT token
 */
function generateToken(role) {
  return jwt.sign({ role }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * 认证中间件 — 验证请求携带有效的 JWT Token
 * - GET 请求：admin 或 guest 均可
 * - POST/PUT/DELETE 请求：仅 admin 可操作
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录', code: 'AUTH_REQUIRED' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    // 写操作需要管理员权限
    if (req.method !== 'GET' && decoded.role !== 'admin') {
      return res.status(403).json({ error: '访客模式不能执行此操作', code: 'GUEST_FORBIDDEN' });
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '登录已过期，请重新登录', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: '无效的认证令牌', code: 'TOKEN_INVALID' });
  }
}

module.exports = { generateToken, authenticate };
