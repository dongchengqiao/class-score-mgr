// ============================================================
// 运行时生命周期：进程启动时间、HTTP Server 注册、自重启
//   - STARTED_AT 用于前端判断「服务是否已重启」
//   - register(server) 由 server.js 在监听成功后调用
//   - restart() 关闭旧进程并派生一个全新的 node 进程（detached）
//     若当前进程挂在终端上，新进程会继承 stdio，输出继续显示在原终端窗口
// ============================================================
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 本进程启动时间（新进程会重新计算，前端据此判断重启完成）
const STARTED_AT = new Date().toISOString();

const BACKEND_DIR = path.join(__dirname, '..');
const SERVER_ENTRY = path.join(BACKEND_DIR, 'server.js');
// 脱离终端时的日志文件（终端关闭后仍可查看输出）
const LOG_DIR = path.join(BACKEND_DIR, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

// 是否让新进程沿用当前终端窗口（默认开启；CSM_TERMINAL=0 可关闭，改为写日志文件）
const PREFER_TERMINAL = process.env.CSM_TERMINAL !== '0';
// 当前进程是否有可用终端（终端窗口被关闭后这个标记可能仍为 true，故需失败回退）
const HAS_TTY = !!(process.stdout && process.stdout.isTTY);
const TERMINAL_INHERIT = PREFER_TERMINAL && HAS_TTY;

let server = null;

/** 注册正在监听的 HTTP Server 实例 */
function register(srv) {
  server = srv;
}

/**
 * 启动一个全新的后端进程
 * - detached：脱离父进程，父进程退出后仍存活
 * - inherit 模式：继承父进程 stdout/stderr，输出继续显示在原终端窗口（同时写入日志文件）
 * - log 模式：stdio 重定向到日志文件，脱离终端也能留下完整输出
 * @param {number|null} port 新进程监听端口
 * @param {'auto'|'inherit'|'log'} [mode] stdio 模式，auto 时按是否有终端决定
 * @returns {import('child_process').ChildProcess}
 */
function spawnNewProcess(port, mode = 'auto') {
  const inherit = mode === 'auto' ? TERMINAL_INHERIT : mode === 'inherit';
  const env = { ...process.env, CSM_RESPAWNED: '1' };
  // 端口切换：必须覆盖继承来的 PORT，否则新进程仍会去监听旧端口
  if (Number.isFinite(port)) {
    env.PORT = String(port);
    // 标记：这个 PORT 来自配置文件（非用户外部指定的启动参数）
    env.CSM_PORT_FROM_CONFIG = '1';
  }

  let stdio;
  if (inherit) {
    // 沿用原终端窗口：继承父进程的 stdio，并让新进程自己再 tee 一份到日志文件
    env.CSM_LOG_TEE = '1';
    stdio = ['ignore', 'inherit', 'inherit'];
  } else {
    // 日志文件模式：不再 tee（避免重复写入同一个文件）
    delete env.CSM_LOG_TEE;
    stdio = ['ignore', 'ignore', 'ignore'];
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      const fd = fs.openSync(LOG_FILE, 'a');
      stdio = ['ignore', fd, fd];
    } catch (err) {
      console.warn('无法打开重启日志文件，改为静默模式:', err.message);
    }
  }

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: BACKEND_DIR,
    detached: true,
    stdio,
    env
  });
  // 派生失败时给出提示而不是抛出未捕获错误
  child.on('error', err => console.error('派生新进程失败:', err.message));
  child.unref();
  return child;
}

/**
 * 重启后端服务
 * 策略：先让旧进程停止接收新连接（释放端口）→ 派生新进程 → 旧进程退出
 * 若新进程因端口占用失败，会由 /status 轮询发现并提示手动重启。
 * @param {number} delay 延迟毫秒，留给 HTTP 响应刷盘
 * @param {{port?: number}} [options] port 指定新进程监听端口（用于初始化向导切换端口）
 */
function restart(delay = 600, options = {}) {
  const port = Number.isFinite(options && options.port) ? options.port : null;
  return new Promise(resolve => {
    setTimeout(() => {
      let spawned = false;
      let exiting = false;
      const doSpawn = () => {
        if (spawned) return;
        spawned = true;
        let child = null;
        try {
          child = spawnNewProcess(port, 'auto');
        } catch (err) {
          console.error('🔄 重启失败，请手动重启服务:', err.message);
        }
        const pid = child ? child.pid : null;
        if (pid) {
          console.log(`🔄 已启动新进程（PID ${pid}${port ? `，端口 ${port}` : ''}），旧进程即将退出`);
        }
        resolve({ restarted: !!pid, pid });

        // 兜底：终端窗口被关闭后，继承的 stdout 写入失败会让新进程直接退出
        // 发现新进程异常退出时，改用「日志文件」模式再启动一次，保证服务不中断
        if (child && TERMINAL_INHERIT) {
          const spawnedAt = Date.now();
          child.once('exit', code => {
            if (exiting) return;
            if (code === 0 || Date.now() - spawnedAt > 5000) return;
            console.warn('⚠️ 新进程启动失败（原终端可能已关闭），改用日志文件模式重启');
            try {
              const fallback = spawnNewProcess(port, 'log');
              if (fallback && fallback.pid) {
                console.log(`🔄 已改用后台日志模式启动（PID ${fallback.pid}），输出见 logs/server.log`);
              }
            } catch (err) {
              console.error('🔄 回退启动也失败，请手动重启服务:', err.message);
            }
          });
        }

        // 给新进程一点时间完成 listen 前的初始化，再退出旧进程
        setTimeout(() => {
          exiting = true;
          process.exit(0);
        }, 900);
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
