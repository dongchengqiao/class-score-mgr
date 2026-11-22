// ============================================================
// 运行时生命周期：进程启动时间、HTTP Server 注册、自重启
//   - STARTED_AT 用于前端判断「服务是否已重启」
//   - register(server) 由 server.js 在监听成功后调用
//   - restart() 关闭旧进程并派生一个全新的 node 进程（detached）
// ============================================================
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 本进程启动时间（新进程会重新计算，前端据此判断重启完成）
const STARTED_AT = new Date().toISOString();

const BACKEND_DIR = path.join(__dirname, '..');
const SERVER_ENTRY = path.join(BACKEND_DIR, 'server.js');
// 新进程的日志目录（脱离终端后仍可查看输出）
const LOG_DIR = path.join(BACKEND_DIR, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

let server = null;

/** 注册正在监听的 HTTP Server 实例 */
function register(srv) {
  server = srv;
}

/**
 * 启动一个全新的后端进程
 * - detached：脱离父进程，父进程退出后仍存活
 * - stdio 写入日志文件：不绑定终端，避免终端关闭导致子进程被回收
 */
function spawnNewProcess() {
  let stdio = ['ignore', 'ignore', 'ignore'];
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const fd = fs.openSync(LOG_FILE, 'a');
    stdio = ['ignore', fd, fd];
  } catch (err) {
    console.warn('无法打开重启日志文件，改为静默模式:', err.message);
  }

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: BACKEND_DIR,
    detached: true,
    stdio,
    env: { ...process.env, CSM_RESPAWNED: '1' }
  });
  child.unref();
  return child.pid;
}

/**
 * 重启后端服务
 * 策略：先让旧进程停止接收新连接（释放端口）→ 派生新进程 → 旧进程退出
 * 若新进程因端口占用失败，会由 /status 轮询发现并提示手动重启。
 * @param {number} delay 延迟毫秒，留给 HTTP 响应刷盘
 */
function restart(delay = 600) {
  return new Promise(resolve => {
    setTimeout(() => {
      let spawned = false;
      const doSpawn = () => {
        if (spawned) return;
        spawned = true;
        let pid = null;
        try {
          pid = spawnNewProcess();
          console.log(`🔄 已启动新进程（PID ${pid}），旧进程即将退出`);
        } catch (err) {
          console.error('🔄 重启失败，请手动重启服务:', err.message);
        }
        resolve({ restarted: !!pid, pid });
        // 给新进程一点时间完成 listen 前的初始化，再退出旧进程
        setTimeout(() => process.exit(0), 400);
      };

      if (server && typeof server.close === 'function') {
        // server.close 会停止接受新连接并等待现存连接结束
        server.close(() => doSpawn());
        // 兜底：长连接一直不释放时，强制断开后继续重启
        setTimeout(() => {
          try {
            if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
            if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
          } catch { /* ignore */ }
          doSpawn();
        }, 2000);
      } else {
        doSpawn();
      }
    }, delay);
  });
}

module.exports = { STARTED_AT, register, restart };
