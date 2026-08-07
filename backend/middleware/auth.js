// ============================================================
// JWT 认证中间件
// ============================================================
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'class-points-jwt-secret-2024';
const TOKEN_EXPIRY = '7d';

/**
 * 生成 JWT Token
 * @param {'admin'|'user'|'guest'} role
 * @returns {string} JWT token
 */
function generateToken(role) {
  return jwt.sign({ role }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * 认证中间件 — 验证请求携带有效的 JWT Token
 * - 无 Token：视为访客，仅允许 GET（只读浏览）
 * - GET 请求：admin / user / guest / 无 token 均可
 * - POST/PUT/DELETE 请求：需要 admin 或 user 权限
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  // 无 token → 访客（仅允许 GET）
  if (!token) {
    if (req.method === 'GET') {
      req.user = { role: 'guest' };
      return next();
    }
    return res.status(401).json({ error: '请先登录', code: 'AUTH_REQUIRED' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    // 写操作需要 admin 或 user 权限
    if (req.method !== 'GET' && !['admin', 'user'].includes(decoded.role)) {
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

/**
 * 管理员权限中间件 — 仅管理员可访问（用于 /api/admin 路由）
 * 需在 authenticate 之后使用
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限', code: 'ADMIN_REQUIRED' });
  }
  next();
}

module.exports = { generateToken, authenticate, requireAdmin };
