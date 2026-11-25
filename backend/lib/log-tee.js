// ============================================================
// 日志分流：把控制台输出同时写入 logs/server.log
//   - 仅在 CSM_LOG_TEE=1 时启用（由 runtime 在「沿用原终端窗口」重启时注入）
//   - 终端里照常看到输出，同时日志文件里保留完整记录
//   - 必须在 server.js 的最前面 require，才能捕获到启动 banner
// ============================================================
const fs = require('fs');
const path = require('path');

// 日志目录：默认项目根目录下的 logs/，可由环境变量 CSM_LOG_DIR 覆盖
// （Electron 打包后应用目录可能不可写，需要写到 userData 目录）
const LOG_DIR = process.env.CSM_LOG_DIR || path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

let enabled = false;

/** 启用日志分流（重复调用无副作用） */
function setupLogTee() {
  if (enabled) return;
  if (process.env.CSM_LOG_TEE !== '1') return;

  let stream;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  } catch (err) {
    // 打不开日志文件也不影响主线运行
    console.warn('无法写入日志文件，仅输出到终端:', err.message);
    return;
  }

  enabled = true;
  stream.write(`\n===== 新进程启动 ${new Date().toLocaleString('zh-CN')}（PID ${process.pid}） =====\n`);

  // 包装 write：先写日志，再照常输出到终端
  // 终端窗口关闭后写入会抛 EIO / ERR_STREAM_DESTROYED，
  // 此时不能把异常抛出去（会让整个服务崩掉），只保留日志文件输出即可。
  const wrap = writer => function (chunk, encoding, callback) {
    try { stream.write(chunk); } catch { /* 忽略日志写入失败 */ }
    try {
      return writer(chunk, encoding, callback);
    } catch {
      if (typeof callback === 'function') callback();
      return false;
    }
  };

  process.stdout.write = wrap(process.stdout.write.bind(process.stdout));
  process.stderr.write = wrap(process.stderr.write.bind(process.stderr));

  // 终端关闭（pty 消失）后写入会报错，忽略即可，日志文件里仍有完整记录
  process.stdout.on('error', () => { /* ignore */ });
  process.stderr.on('error', () => { /* ignore */ });
  stream.on('error', () => { /* 忽略磁盘写入错误，避免进程崩溃 */ });
}

module.exports = { setupLogTee, LOG_FILE };
