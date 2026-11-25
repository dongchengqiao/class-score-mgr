// ============================================================
// 初始化状态 & 端口配置
//   - 判断系统是否已完成初始化（data/ 不存在或为空 → 需要初始化）
//   - 读取自定义端口（保存在 data/config.json 的 port 字段）
//   - 本模块必须在 require('./json-db') 之前加载：
//     json-db 会自动创建 data/ 并写入默认规则，
//     所以必须在它运行前把「启动瞬间的状态」快照下来。
// ============================================================
const fs = require('fs');
const path = require('path');

const APP_ROOT = process.env.CSM_APP_ROOT
  ? path.resolve(process.env.CSM_APP_ROOT)
  : path.join(__dirname, '..', '..');
const DEFAULT_PORT = 4000;
// 数据目录：默认项目根目录下的 data/，可由环境变量 CSM_DATA_DIR 覆盖
const DATA_DIR = process.env.CSM_DATA_DIR
  ? path.resolve(process.env.CSM_DATA_DIR)
  : path.join(APP_ROOT, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
// 实体数据文件：任意一个存在即说明是「已有数据的安装」
const ENTITY_FILES = ['student.json', 'group.json', 'rule.json', 'shouItems.json'];

/** 读取 config.json（失败返回 null） */
function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (err) {
    return null;
  }
}

/** 读取 config.json 中的端口（无有效值返回 null） */
function readConfigPort() {
  const cfg = readConfig();
  const n = cfg ? parseInt(cfg.port, 10) : NaN;
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : null;
}

/** 端口是否来自启动参数 PORT（被配置覆盖时视为否） */
function hasEnvPort() {
  if (process.env.CSM_PORT_FROM_CONFIG === '1') return false;
  const n = parseInt(process.env.PORT, 10);
  return Number.isFinite(n) && n > 0 && n < 65536;
}

/**
 * 读取服务端口
 * 优先级：环境变量 PORT（非配置覆盖的） > data/config.json 的 port > 默认 4000
 */
function readPort() {
  if (hasEnvPort()) return parseInt(process.env.PORT, 10);
  const cfgPort = readConfigPort();
  return cfgPort !== null ? cfgPort : DEFAULT_PORT;
}

/** data 目录是否不存在或为空 */
function dataDirEmpty() {
  try {
    if (!fs.existsSync(DATA_DIR)) return true;
    return fs.readdirSync(DATA_DIR).filter(n => !n.startsWith('.')).length === 0;
  } catch (err) {
    return true;
  }
}

/**
 * 计算「当前是否需要初始化」
 * 1. data/ 不存在或为空 → 是
 * 2. config.json 标记 setup_completed === true → 否
 * 3. 存在任一实体数据文件（旧版本安装）→ 否
 * 4. 其余情况（仅有 config.json 但无数据且未标记）→ 是
 */
function computeNeedsSetup() {
  if (dataDirEmpty()) return true;
  const cfg = readConfig();
  if (cfg && cfg.setup_completed === true) return false;
  return !ENTITY_FILES.some(f => fs.existsSync(path.join(DATA_DIR, f)));
}

// ---- 启动瞬间快照（必须在 json-db 之前求值）----
const NEEDS_SETUP_AT_BOOT = computeNeedsSetup();
// 本次进程内完成初始化后直接标记，无需回读文件
let completedInMemory = false;

/** 是否需要进入初始化向导 */
function needsSetup() {
  if (completedInMemory) return false;
  return NEEDS_SETUP_AT_BOOT;
}

/** 标记已完成初始化（由 /api/setup/complete 调用） */
function markCompleted() {
  completedInMemory = true;
}

/** 读取当前程序版本号 */
function getVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch (err) {
    return '0.0.0';
  }
}

module.exports = {
  APP_ROOT,
  DEFAULT_PORT,
  DATA_DIR,
  CONFIG_FILE,
  NEEDS_SETUP_AT_BOOT,
  ENTITY_FILES,
  readConfig,
  readPort,
  readConfigPort,
  hasEnvPort,
  needsSetup,
  markCompleted,
  getVersion
};
