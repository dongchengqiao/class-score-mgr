const express = require('express');
const cors = require('cors');
const path = require('path');

const studentsRouter = require('./routes/students');
const groupsRouter = require('./routes/groups');
const rulesRouter = require('./routes/rules');
const shopRouter = require('./routes/shop');
const authRouter = require('./routes/auth');
const dataRouter = require('./routes/data');
const morningReadingRouter = require('./routes/morning-reading');
const adminRouter = require('./routes/admin');
const { authenticate, requireAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 4000;

// ============================================================
// 中间件
// ============================================================

// CORS - 允许前后端分离开发
app.use(cors());

// 解析 JSON 请求体 (限制 50MB 以支持 base64 图片)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 请求日志
app.use((req, res, next) => {
  const timestamp = new Date().toLocaleString('zh-CN');
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// ============================================================
// 静态文件服务
// ============================================================

// 提供前端静态文件
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============================================================
// API 路由
// ============================================================

// 公开路由（无需 Token）
app.use('/api/auth', authRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 受保护路由（需要 JWT Token）
app.use('/api/students', authenticate, studentsRouter);
app.use('/api/groups', authenticate, groupsRouter);
app.use('/api/rules', authenticate, rulesRouter);
app.use('/api/shop', authenticate, shopRouter);
app.use('/api/data', authenticate, dataRouter);
app.use('/api/morning-reading', authenticate, morningReadingRouter);
// 管理后台路由：需要 admin 角色（user / guest / 无 token 均不可访问）
app.use('/api/admin', authenticate, requireAdmin, adminRouter);

// ============================================================
// 错误处理
// ============================================================

// 404 - 未找到
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// ============================================================
// 启动服务器
// ============================================================

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║        📚 班级积分管理系统 - 后端服务        ║
║──────────────────────────────────────────────║
║  地址: http://localhost:${PORT}                 ║
║  API:  http://localhost:${PORT}/api             ║
║  管理: http://localhost:${PORT}/index.html      ║
║  早读: http://localhost:${PORT}/zaodu.html      ║
║  管理: http://localhost:${PORT}/admin.html      ║
╚══════════════════════════════════════════════╝
  `);
});
