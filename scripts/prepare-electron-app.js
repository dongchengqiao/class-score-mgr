// ============================================================
// 桌面版打包准备脚本
//   把运行所需的「后端 + 前端 + 依赖」整理到 electron/stage/，
//   electron-builder 以 stage 作为 app 目录打包。
//
//   stage/
//     main.js            ← Electron 主进程
//     preload.js
//     connect.html       ← 选择运行模式（离线 / 连接已有服务器）
//     package.json       ← 版本号取根目录 package.json，依赖取 backend/package.json
//     node_modules/      ← 从 backend/node_modules 复制（纯 JS 依赖，无需编译）
//     app/               ← 后端运行时目录（CSM_APP_ROOT）
//       backend/         ← 后端代码（不含 node_modules）
//       public/          ← 前端静态文件
//       package.json     ← 提供版本号给「检查更新」使用
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STAGE = path.join(ROOT, 'electron', 'stage');
const BACKEND = path.join(ROOT, 'backend');

const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const backendPkg = JSON.parse(fs.readFileSync(path.join(BACKEND, 'package.json'), 'utf8'));
const electronPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'electron', 'package.json'), 'utf8'));

function log(msg) {
  console.log(`[prepare] ${msg}`);
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

/** 递归复制目录，可排除指定子路径 */
function copyDir(src, dest, exclude = []) {
  const skipNames = new Set(exclude);
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipNames.has(entry.name) || entry.name === '.DS_Store') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to, []);
    else if (entry.isSymbolicLink()) fs.copyFileSync(fs.realpathSync(from), to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// ---- 1. 清空并重建 stage ----
log(`重建 ${STAGE}`);
rmrf(STAGE);
fs.mkdirSync(STAGE, { recursive: true });

// ---- 2. Electron 主进程文件 ----
for (const f of ['main.js', 'preload.js', 'connect.html']) {
  copyFile(path.join(ROOT, 'electron', f), path.join(STAGE, f));
  log(`复制 ${f}`);
}

// ---- 3. 后端运行时目录 app/ ----
const APP = path.join(STAGE, 'app');
copyDir(path.join(BACKEND), path.join(APP, 'backend'), ['node_modules']);
log('复制 backend/（不含 node_modules）');
copyDir(path.join(ROOT, 'public'), path.join(APP, 'public'), ['uploads']);
log('复制 public/（不含 uploads）');

// app/package.json：只保留版本信息（setup-state / update 会读取它）
fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify({
  name: rootPkg.name,
  version: rootPkg.version,
  description: rootPkg.description
}, null, 2) + '\n');
log(`写入 app/package.json（version ${rootPkg.version}）`);

// ---- 4. 运行依赖 ----
// 优先在 stage 内执行 npm install（会一并安装 electron-updater 等桌面运行时依赖）；
// 无网络时退化为直接复制 backend/node_modules（离线也能打包）
const STAGE_PKG = {
  name: electronPkg.name,
  productName: electronPkg.productName,
  version: rootPkg.version,
  description: electronPkg.description,
  main: 'main.js',
  author: electronPkg.author,
  license: electronPkg.license,
  dependencies: {
    ...(backendPkg.dependencies || {}),
    ...(electronPkg.dependencies || {})
  },
  devDependencies: electronPkg.devDependencies || {}
};
fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify(STAGE_PKG, null, 2) + '\n');
log(`写入 stage/package.json（version ${rootPkg.version}）`);

const backendModules = path.join(BACKEND, 'node_modules');
const electronModules = path.join(ROOT, 'electron', 'node_modules');
const stageModules = path.join(STAGE, 'node_modules');

function copyRuntimeModules() {
  if (!fs.existsSync(backendModules)) return false;
  copyDir(backendModules, stageModules);
  log('复制 backend/node_modules（后端运行时依赖）');

  // electron-updater 等桌面运行时依赖若已在 electron/node_modules 中，一并复制
  const extra = Object.keys(electronPkg.dependencies || {});
  for (const name of extra) {
    const src = path.join(electronModules, name);
    if (!fs.existsSync(src)) {
      log(`⚠ 未找到 ${name}（electron/node_modules），请先执行：cd electron && npm install`);
      continue;
    }
    copyDir(src, path.join(stageModules, name));
    log(`复制 ${name}`);
  }
  return true;
}

let installed = false;
try {
  const { spawnSync } = require('child_process');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  log('在 stage 中安装运行时依赖（npm install --omit=dev）…');
  const res = spawnSync(npmCmd, ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: STAGE,
    stdio: 'inherit'
  });
  installed = res.status === 0 && fs.existsSync(stageModules);
  if (!installed) log('⚠ npm install 失败，改为复制已有依赖目录');
} catch (err) {
  log('⚠ 无法执行 npm install（' + err.message + '），改为复制已有依赖目录');
}

if (!installed) {
  if (!copyRuntimeModules()) {
    console.error('[prepare] 找不到可用的依赖目录，请先执行：cd backend && npm install && cd ../electron && npm install');
    process.exit(1);
  }
}

log(`依赖就绪（${installed ? 'npm install' : '本地复制'}），可以执行 electron-builder 打包`);
