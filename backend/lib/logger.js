// ============================================================
// 结构化后端日志
//   每行记录：日期时间 | 级别 | 来源 IP | 操作 | 详情
//   - 输出到终端（由 log-tee 同步写入 logs/server.log）
//   - 同时追加到 logs/app.log（纯文本，便于排查与后台查看）
// ============================================================
const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.CSM_LOG_DIR || path.join(__dirname, '..', '..', 'logs');
const APP_LOG = path.join(LOG_DIR, 'app.log');
const MAX_BYTES = 5 * 1024 * 1024; // 单文件 5MB 后轮转

let stream = null;

/** 打开日志文件（超过 5MB 时轮转为 app.log.1） */
function getStream() {
  if (stream) return stream;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    try {
      const st = fs.statSync(APP_LOG);
      if (st.size > MAX_BYTES) {
        try { fs.renameSync(APP_LOG, APP_LOG + '.1'); } catch { /* 忽略轮转失败 */ }
      }
    } catch { /* 文件不存在，首次写入 */ }
    stream = fs.createWriteStream(APP_LOG, { flags: 'a' });
    stream.on('error', () => { stream = null; });
  } catch (err) {
    console.warn('无法写入应用日志文件，仅输出到终端:', err.message);
    return null;
  }
  return stream;
}

/** 两位补零 */
function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

/** 本地时间：YYYY-MM-DD HH:mm:ss */
function formatTime(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 归一化客户端 IP */
function normalizeIp(raw) {
  if (!raw) return '-';
  let ip = String(raw).trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip || '-';
}

/** 从请求中解析客户端 IP（兼容反向代理） */
function getClientIp(req) {
  if (!req) return '-';
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (forwarded) return normalizeIp(String(forwarded).split(',')[0]);
  const realIp = req.headers && req.headers['x-real-ip'];
  if (realIp) return normalizeIp(realIp);
  const socket = req.socket || req.connection || {};
  return normalizeIp(socket.remoteAddress);
}

/** 写入一行日志 */
function write(level, ip, operation, detail, extra) {
  const time = formatTime();
  const parts = [time, (level || 'INFO').toUpperCase().padEnd(5), ip, operation];
  if (detail) parts.push(detail);
  if (extra) parts.push(JSON.stringify(extra));
  const line = parts.join(' | ');

  const logger = level === 'error' ? console.error : console.log;
  logger(line);

  const s = getStream();
  if (s) {
    try { s.write(line + '\n'); } catch { /* 忽略写入失败 */ }
  }
  return line;
}

const info = (ip, operation, detail, extra) => write('info', ip, operation, detail, extra);
const warn = (ip, operation, detail, extra) => write('warn', ip, operation, detail, extra);
const error = (ip, operation, detail, extra) => write('error', ip, operation, detail, extra);

// ============================================================
// 请求 → 人类可读的操作描述
// ============================================================

/** 路径前缀 → 业务模块 */
const MODULES = [
  ['/api/auth', '登录认证'],
  ['/api/setup', '初始化向导'],
  ['/api/students', '学生'],
  ['/api/groups', '小组'],
  ['/api/rules', '积分规则'],
  ['/api/shop', '积分商店'],
  ['/api/morning-reading', '早读'],
  ['/api/data', '数据'],
  ['/api/admin', '管理后台'],
  ['/api/update', '版本更新']
];

function moduleOf(pathname) {
  for (const [prefix, label] of MODULES) {
    if (pathname.startsWith(prefix)) return label;
  }
  return '其他';
}

/** 从请求体提取安全的摘要信息（不记录密码等敏感字段） */
function summarizeBody(req) {
  const body = req.body;
  if (!body || typeof body !== 'object') return '';
  if (String(req.originalUrl || req.url || '').startsWith('/api/auth')) return '';

  const pick = [];
  if (typeof body.points === 'number') pick.push(`分值 ${body.points > 0 ? '+' : ''}${body.points}`);
  if (body.reason) pick.push(`原因「${body.reason}」`);
  if (Array.isArray(body.names)) pick.push(`${body.names.length} 人`);
  if (Array.isArray(body.studentIds)) pick.push(`${body.studentIds.length} 人`);
  if (body.name) pick.push(`名称「${body.name}」`);
  if (body.className) pick.push(`班级「${body.className}」`);
  if (body.port !== undefined && body.port !== '') pick.push(`端口 ${body.port}`);
  if (Array.isArray(body.students)) pick.push(`${body.students.length} 名学生`);
  if (Array.isArray(body.rules)) pick.push(`${body.rules.length} 条规则`);
  if (body.key) pick.push(`设置项 ${body.key}`);
  if (typeof body.password === 'string' || typeof body.newPassword === 'string') pick.push('密码已隐藏');
  return pick.join('，');
}

/** 根据方法 + 路径生成操作名 */
function operationOf(method, pathname) {
  const m = method.toUpperCase();
  const seg = pathname.split('/').filter(Boolean); // ['api', 'students', '12', 'points']
  const last = seg[seg.length - 1] || '';
  const hasId = seg.length > 2 && /^\d+$/.test(seg[2]);

  // 认证
  if (pathname === '/api/auth/verify') return '管理员登录';
  if (pathname === '/api/auth/verify-user') return '用户登录';
  if (pathname === '/api/auth/status') return '查询登录状态';
  if (pathname.includes('/password')) return m === 'POST' ? '设置/修改密码' : '密码操作';
  if (pathname === '/api/auth/logout') return '退出登录';

  // 初始化
  if (pathname === '/api/setup/status') return '查询初始化状态';
  if (pathname === '/api/setup/complete') return '完成初始化';
  if (pathname === '/api/setup/import') return '导入已有数据';

  // 学生
  if (pathname === '/api/students' && m === 'GET') return '查看学生列表';
  if (pathname === '/api/students' && m === 'POST') return '添加学生';
  if (pathname === '/api/students' && m === 'DELETE') return '清空学生';
  if (pathname === '/api/students/reset-points') return '重置所有积分';
  if (pathname === '/api/students/batch-points') return '批量加减分';
  if (last === 'points') return m === 'POST' ? '学生加减分' : '积分操作';
  if (last === 'revert') return '撤回积分记录';
  if (last === 'avatar') return '上传头像';
  if (hasId && m === 'PUT') return '修改学生信息';
  if (hasId && m === 'DELETE') return '删除学生';

  // 小组
  if (pathname === '/api/groups' && m === 'GET') return '查看小组';
  if (pathname === '/api/groups' && m === 'POST') return '创建小组';
  if (last === 'students' && m === 'POST') return '添加学生到小组';
  if (last === 'points') return '小组加减分';
  if (hasId && m === 'PUT') return '修改小组名称';
  if (hasId && m === 'DELETE') return '删除小组';

  // 规则
  if (pathname === '/api/rules' && m === 'GET') return '查看积分规则';
  if (pathname === '/api/rules' && m === 'POST') return '新增积分规则';
  if (pathname === '/api/rules/reorder') return '调整规则排序';
  if (hasId && m === 'PUT') return '修改积分规则';
  if (hasId && m === 'DELETE') return '删除积分规则';

  // 商店
  if (pathname === '/api/shop' && m === 'GET') return '查看商品';
  if (pathname === '/api/shop' && m === 'POST') return '新增商品';
  if (last === 'purchase') return '兑换商品';
  if (hasId && m === 'PUT') return '修改商品';
  if (hasId && m === 'DELETE') return '删除商品';

  // 早读
  if (pathname.startsWith('/api/morning-reading')) {
    if (m === 'GET') return '查看早读积分';
    return m === 'POST' ? '保存早读积分' : '早读操作';
  }

  // 数据
  if (pathname === '/api/data/export') return '导出数据';
  if (pathname === '/api/data/import') return '导入数据';
  if (pathname === '/api/data/settings') return '查看系统设置';
  if (pathname === '/api/data/export-report') return '导出学生报表';
  if (pathname === '/api/data/export-group-report') return '导出小组报表';

  // 管理后台
  if (pathname === '/api/admin/stats') return '查看统计信息';
  if (pathname === '/api/admin/settings' && m === 'GET') return '查看系统设置';
  if (pathname.startsWith('/api/admin/settings') && m !== 'GET') return '修改系统设置';
  if (pathname === '/api/admin/port' && m === 'GET') return '查看服务端口';
  if (pathname === '/api/admin/port' && m === 'PUT') return '修改服务端口';
  if (pathname === '/api/admin/history') return '查看历史记录';
  if (pathname === '/api/admin/students') return '查看学生简要列表';
  if (pathname === '/api/admin/logs') return '查看运行日志';

  // 更新
  if (pathname === '/api/update/latest') return '检查新版本';
  if (pathname === '/api/update/version') return '查询本地版本';
  if (pathname === '/api/update/apply') return '执行自动更新';
  if (pathname === '/api/update/restart') return '重启服务';
  if (pathname === '/api/update/status') return '查询更新状态';

  if (pathname === '/api/health') return '健康检查';
  return `${m} ${pathname}`;
}

/** Express 中间件：记录每一次 API 请求 */
function requestLogger(req, res, next) {
  const startedAt = Date.now();
  const ip = getClientIp(req);
  const pathname = (req.originalUrl || req.url || '').split('?')[0];
  const operation = operationOf(req.method, pathname);

  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    const role = (req.user && req.user.role) || 'guest';
    const detail = [`${req.method} ${pathname}`, `${res.statusCode}`, `${ms}ms`, `角色 ${role}`];
    const bodyInfo = summarizeBody(req);
    if (bodyInfo) detail.push(bodyInfo);

    const level = res.statusCode >= 500 ? 'error' : (res.statusCode >= 400 ? 'warn' : 'info');
    write(level, ip, operation, detail.join('，'), { ip, role, status: res.statusCode, ms, path: pathname });
  });

  next();
}

/** 读取日志文件末尾若干行（供管理后台查看） */
function tail(lines = 200) {
  const n = Math.min(2000, Math.max(1, parseInt(lines, 10) || 200));
  try {
    const content = fs.readFileSync(APP_LOG, 'utf-8');
    const all = content.split(/\r?\n/).filter(Boolean);
    return all.slice(-n);
  } catch (err) {
    return [];
  }
}

module.exports = {
  LOG_DIR,
  APP_LOG,
  formatTime,
  getClientIp,
  requestLogger,
  operationOf,
  tail,
  info,
  warn,
  error
};
