// ============================================================
// WebSocket 实时推送
//   - 服务端在 /ws 上提供 WebSocket 连接
//   - 任一写操作成功后广播 { type:'update', resource, action, at }
//   - 前端收到后局部刷新数据，无需轮询
// ============================================================
const logger = require('./logger');

let wss = null;
let clientSeq = 0;

/** 路径 → 受影响资源 */
function resourceOf(pathname, method) {
  if (pathname === '/api/data/import' || pathname.startsWith('/api/setup')) return 'all';
  if (pathname.startsWith('/api/students')) return 'students';
  if (pathname.startsWith('/api/morning-reading')) return 'students';
  if (pathname.startsWith('/api/groups')) return 'groups';
  if (pathname.startsWith('/api/rules')) return 'rules';
  if (pathname.startsWith('/api/shop')) return 'shop';
  if (pathname.startsWith('/api/admin/settings')) return 'settings';
  if (pathname === '/api/admin/port') return 'settings';
  return method === 'GET' ? null : 'all';
}

/** 广播一条更新事件 */
function broadcast(event) {
  if (!wss) return 0;
  const payload = JSON.stringify({ type: 'update', at: new Date().toISOString(), ...event });
  let sent = 0;
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      try { client.send(payload); sent++; } catch { /* 忽略单连接失败 */ }
    }
  });
  return sent;
}

/** 中间件：写操作成功后广播 */
function broadcastMiddleware(req, res, next) {
  const pathname = (req.originalUrl || req.url || '').split('?')[0];
  if (req.method === 'GET' || req.method === 'HEAD') return next();

  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const resource = resourceOf(pathname, req.method);
    if (!resource) return;
    const sent = broadcast({
      resource,
      action: `${req.method} ${pathname}`,
      by: (req.user && req.user.role) || 'guest'
    });
    if (sent > 0) {
      logger.info(logger.getClientIp(req), '实时推送', `广播 ${resource} 更新给 ${sent} 个客户端`);
    }
  });

  next();
}

/** 挂载 WebSocket 服务到已有的 HTTP Server */
function attach(server) {
  let WebSocketServer;
  try {
    ({ WebSocketServer } = require('ws'));
  } catch (err) {
    console.warn('⚠️ 未安装 ws 依赖，实时推送已禁用（执行 cd backend && npm install ws）');
    return null;
  }

  try {
    wss = new WebSocketServer({ server, path: '/ws' });
  } catch (err) {
    console.warn('⚠️ WebSocket 服务启动失败，实时推送已禁用:', err.message);
    return null;
  }

  wss.on('connection', (socket, req) => {
    clientSeq++;
    socket.clientId = `c${clientSeq}`;
    const ip = logger.getClientIp(req);
    logger.info(ip, 'WebSocket 连接', `客户端 ${socket.clientId} 已连接（当前 ${wss.clients.size} 个）`);

    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });

    try {
      socket.send(JSON.stringify({
        type: 'welcome',
        clientId: socket.clientId,
        at: new Date().toISOString()
      }));
    } catch { /* 忽略 */ }

    socket.on('message', raw => {
      let msg = null;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg && msg.type === 'ping') {
        try { socket.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() })); } catch { /* 忽略 */ }
      }
      if (msg && msg.type === 'resync') {
        socket.refreshAll = true;
      }
    });

    socket.on('close', () => {
      logger.info(ip, 'WebSocket 断开', `客户端 ${socket.clientId} 已断开（剩余 ${Math.max(0, wss.clients.size - 1)} 个）`);
    });
    socket.on('error', () => { /* 忽略单连接错误 */ });
  });

  // 心跳：30s 清理死连接
  const heartbeat = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach(socket => {
      if (socket.isAlive === false) { try { socket.terminate(); } catch { /* 忽略 */ } return; }
      socket.isAlive = false;
      try { socket.ping(); } catch { /* 忽略 */ }
    });
  }, 30000);
  heartbeat.unref?.();
  server.on('close', () => clearInterval(heartbeat));

  console.log('🔌 实时推送已启用：ws://<host>/ws');
  return wss;
}

/** 关闭所有连接（重启前调用，避免 server.close() 被长连接卡住） */
function shutdown() {
  if (!wss) return;
  try {
    wss.clients.forEach(socket => { try { socket.terminate(); } catch { /* 忽略 */ } });
    wss.close();
  } catch { /* 忽略 */ }
  wss = null;
}

module.exports = { attach, broadcast, broadcastMiddleware, resourceOf, shutdown };
