// 日志分流：重启后沿用原终端时，输出同时写入 logs/server.log（须最先加载）
require('./lib/log-tee').setupLogTee();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// ⚠️ 必须最先加载：json-db 会自动创建 data/ 并写入默认数据，
//    初始化状态的判断必须在它运行前完成快照。
const setupState = require('./lib/setup-state');

const studentsRouter = require('./routes/students');
const groupsRouter = require('./routes/groups');
const rulesRouter = require('./routes/rules');
const shopRouter = require('./routes/shop');
const authRouter = require('./routes/auth');
const dataRouter = require('./routes/data');
const morningReadingRouter = require('./routes/morning-reading');
const adminRouter = require('./routes/admin');
const updateRouter = require('./routes/update');
const setupRouter = require('./routes/setup');
const runtime = require('./lib/runtime');
const logger = require('./lib/logger');
const realtime = require('./lib/realtime');
const DB = require('./json-db');
const { authenticate, requireAdmin } = require('./middleware/auth');

const app = express();
// 端口优先级：环境变量 PORT > data/config.json 的 port > 默认 4000
const PORT = setupState.readPort();

// 端口号持久化到 data/config.json，方便直接查看/修改
// 仅在「不是首次安装」且配置里没有 port、也没用 PORT 启动参数指定时补写
// （首次安装不能写，否则 save() 会提前生成实体数据文件，导致向导被跳过）
if (!setupState.needsSetup() && setupState.readConfigPort() === null && !setupState.hasEnvPort()) {
  DB.setSetting('port', PORT);
}

// 需要初始化时重定向到向导页的页面
const GUARDED_PAGES = ['/index.html', '/admin.html', '/login.html', '/zaodu.html', '/voice.html'];
const SETUP_PAGE = '/setup.html';

// ============================================================
// 中间件
// ============================================================

// 位于反向代理之后时，正确解析真实客户端 IP（影响日志中的 IP 记录）
app.set('trust proxy', true);

// CORS - 允许前后端分离开发
app.use(cors());

// 解析 JSON 请求体 (限制 50MB 以支持 base64 图片)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 请求日志：日期时间 | 级别 | 来源 IP | 操作 | 方法路径/状态码/耗时/角色/参数
app.use(logger.requestLogger);

// 写操作成功后通过 WebSocket 广播，客户端自动刷新
app.use(realtime.broadcastMiddleware);

// ============================================================
// 初始化守卫
// ============================================================

// 未完成初始化时，所有业务页面重定向到 /setup.html
// 必须放在 express.static 之前，否则已存在的静态文件会直接返回
app.use((req, res, next) => {
  if (!setupState.needsSetup()) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const urlPath = req.path;
  if (urlPath === SETUP_PAGE || urlPath.startsWith('/api/')) return next();
  // 仅拦截页面请求：根路径、无扩展名路径、.html 页面
  const isPage = urlPath === '/' || !path.extname(urlPath) || urlPath.endsWith('.html');
  if (!isPage) return next();
  if (urlPath === '/' || GUARDED_PAGES.includes(urlPath) || urlPath.endsWith('.html')) {
    return res.redirect(302, SETUP_PAGE);
  }
  return next();
});

// ============================================================
// 静态文件服务
// ============================================================

// 提供前端静态文件
app.use(express.static(path.join(__dirname, '..', 'public')));

// 头像目录：可用 CSM_UPLOADS_DIR 覆盖（Electron 打包后写到用户目录）
if (process.env.CSM_UPLOADS_DIR) {
  app.use('/uploads', express.static(path.resolve(process.env.CSM_UPLOADS_DIR)));
}

// ============================================================
// API 路由
// ============================================================

// 公开路由（无需 Token）
app.use('/api/auth', authRouter);
// 初始化向导（公开）
app.use('/api/setup', setupRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    startedAt: runtime.STARTED_AT
  });
});

// 受保护路由（需要 JWT Token）
app.use('/api/students', authenticate, studentsRouter);
app.use('/api/groups', authenticate, groupsRouter);
app.use('/api/rules', authenticate, rulesRouter);
app.use('/api/shop', authenticate, shopRouter);
app.use('/api/data', authenticate, dataRouter);
app.use('/api/morning-reading', authenticate, morningReadingRouter);
// 版本更新：查询 GitHub 最新发行版（仅管理员可见）
app.use('/api/update', authenticate, requireAdmin, updateRouter);
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

const server = app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║        📚 班级积分管理系统 - 后端服务        ║
║──────────────────────────────────────────────║
║  地址: http://localhost:${PORT}                 ║
║  API:  http://localhost:${PORT}/api             ║
║  管理: http://localhost:${PORT}/index.html      ║
║  早读: http://localhost:${PORT}/zaodu.html      ║
║  管理: http://localhost:${PORT}/admin.html      ║
║  实时: ws://localhost:${PORT}/ws                ║
╚══════════════════════════════════════════════╝
  `);
  realtime.attach(server);
  logger.info('系统', '服务启动', `监听端口 ${PORT}，数据目录 ${DB.DATA_DIR || '默认'}`);

  // 桌面版：写出 PID 文件，App 退出时据此结束内置服务
  if (process.env.CSM_DESKTOP === '1' && DB.DATA_DIR) {
    try {
      fs.writeFileSync(path.join(DB.DATA_DIR, 'server.pid'), String(process.pid), 'utf-8');
    } catch { /* 忽略 */ }
  }
});

// 端口被占用时（如自动重启瞬间的交接期）自动重试，而不是直接崩溃
let portRetry = 0;
server.on('error', err => {
  if (err.code === 'EADDRINUSE' && portRetry < 12) {
    portRetry++;
    const wait = 800;
    console.warn(`⚠️ 端口 ${PORT} 被占用，${wait}ms 后重试（第 ${portRetry} 次）...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT);
    }, wait);
    return;
  }
  console.error('❌ 服务器启动失败:', err);
  process.exit(1);
});

// 注册实例，供自动更新后自我重启使用
runtime.register(server);

// 桌面版（Electron）：外部进程就是 App 本身，退出进程会连带关闭窗口，
// 因此端口变更时改为「原地重新监听」，而不是 spawn 新进程再 exit。
if (process.env.CSM_DESKTOP === '1') {
  runtime.setDesktopRestartHandler((newPort, delay) => new Promise(resolve => {
    const targetPort = Number.isFinite(newPort) ? newPort : PORT;
    setTimeout(() => {
      try { realtime.shutdown(); } catch { /* 忽略 */ }
      try { server.close(); } catch { /* 忽略 */ }
      setTimeout(() => {
        server.listen(targetPort, () => {
          try { realtime.attach(server); } catch { /* 忽略 */ }
          logger.info('系统', '服务重启', `已在端口 ${targetPort} 重新监听（桌面版原地重启）`);
          // 通知桌面版主进程把窗口指向新端口
          try {
            if (typeof global.__CSM_DESKTOP_ON_RESTART === 'function') global.__CSM_DESKTOP_ON_RESTART(targetPort);
          } catch { /* 忽略 */ }
          resolve({ restarted: true, port: targetPort });
        });
        server.once('error', err => resolve({ restarted: false, port: targetPort, error: err.message }));
      }, 300);
    }, Math.max(0, delay || 0));
  }));
}

// 退出前关闭 WebSocket 连接，避免重启时被长连接卡住
process.on('exit', () => {
  try { realtime.shutdown(); } catch { /* 忽略 */ }
});
