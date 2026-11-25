// ============================================================
// 班级积分管理 · 桌面版主进程（Electron）
//
// 两种运行模式：
//   1. 离线模式：App 内部直接启动后端服务（数据保存在本机 App 数据目录）
//   2. 连接模式：不启动后端，窗口直接连到已有的服务器地址
//
// 首次启动会展示模式选择页（connect.html），选择后记住配置，
// 以后可直接进入，也可通过菜单「文件 → 切换运行模式」重新选择。
// ============================================================
const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');

// 单实例：重复启动时聚焦已有窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Windows 任务栏/通知使用的应用标识
  app.setAppUserModelId('com.dongchengqiao.classscore');
}

// 打包后的 app 运行时根目录（含 backend/ 与 public/）
const APP_DIR = path.join(__dirname, 'app');
// 配置保存在用户目录，卸载/升级都不会丢
const CONFIG_FILE = path.join(app.getPath('userData'), 'desktop-config.json');

let mainWindow = null;
let localPort = null;
let serverStarted = false;
let showingChooser = false;
// 当前模式：'offline' | 'remote'
let currentMode = null;

/** 读取桌面版配置 */
function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const cfg = JSON.parse(raw);
    if (cfg && (cfg.mode === 'offline' || cfg.mode === 'remote')) return cfg;
  } catch { /* 首次启动没有配置文件 */ }
  return null;
}

/** 保存桌面版配置 */
function writeConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    console.error('保存桌面版配置失败:', err.message);
  }
}

/** 检查端口是否可用 */
function isPortFree(port) {
  return new Promise(resolve => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, '127.0.0.1');
  });
}

/** 从起始端口开始找一个可用端口 */
async function findFreePort(start) {
  for (let port = start; port < start + 30; port++) {
    if (await isPortFree(port)) return port;
  }
  return start;
}

/** 探测本地服务是否已就绪 */
function checkHealth(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 1200 }, res => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

/** 本地服务地址 */
function localUrl(port) {
  return `http://127.0.0.1:${port}/`;
}

/**
 * 启动内嵌后端服务（在当前主进程中运行）
 * 数据目录放在 userData 下，保证打包后依然可写。
 */
async function startLocalServer() {
  if (serverStarted) return localPort;

  const dataDir = path.join(app.getPath('userData'), 'data');
  const logDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  localPort = await findFreePort(4000);

  process.env.CSM_DATA_DIR = dataDir;
  process.env.CSM_LOG_DIR = logDir;
  process.env.CSM_UPLOADS_DIR = path.join(dataDir, 'uploads');
  process.env.CSM_APP_ROOT = APP_DIR;
  process.env.CSM_DESKTOP = '1';
  process.env.PORT = String(localPort);

  // 服务原地重启（切换端口）后，把窗口指向新端口
  global.__CSM_DESKTOP_ON_RESTART = port => {
    localPort = port;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(localUrl(port)).catch(() => { /* 忽略瞬时失败 */ });
    }
  };

  try {
    require(path.join(APP_DIR, 'backend', 'server.js'));
    serverStarted = true;
    console.log(`[desktop] 本地服务已启动，端口 ${localPort}，数据目录 ${dataDir}`);
  } catch (err) {
    console.error('[desktop] 启动本地服务失败:', err);
    dialog.showErrorBox('启动失败', `内置服务无法启动：${err.message}\n\n可尝试「切换运行模式」连接已有服务器。`);
    throw err;
  }

  // 等待端口就绪
  for (let i = 0; i < 60; i++) {
    if (await checkHealth(localPort)) break;
    await new Promise(r => setTimeout(r, 250));
  }
  return localPort;
}

/** 加载地址（失败自动重试，等待服务起来） */
async function loadWithRetry(win, url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      await win.loadURL(url);
      return true;
    } catch (err) {
      await new Promise(r => setTimeout(r, 400));
    }
  }
  return false;
}

/** 规范化用户输入的服务器地址 */
function normalizeServerUrl(input) {
  let url = String(input || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return null;
    // 缺省端口时补 4000（系统默认端口）
    if (!parsed.port) parsed.port = '4000';
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port}`;
  } catch {
    return null;
  }
}

/** 创建主窗口 */
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f6f7fb',
    title: '班级积分管理',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  win.once('ready-to-show', () => win.show());

  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow = win;
  return win;
}

/** 展示模式选择页 */
async function showChooser(win) {
  showingChooser = true;
  currentMode = null;
  try {
    await win.loadFile(path.join(__dirname, 'connect.html'));
  } catch (err) {
    console.error('加载模式选择页失败:', err);
  }
  win.setTitle('班级积分管理 · 选择运行方式');
  showingChooser = false;
}

/** 按配置进入主界面 */
async function enterMode(win, cfg) {
  currentMode = cfg.mode;
  if (cfg.mode === 'offline') {
    win.setTitle('班级积分管理（离线）');
    const port = await startLocalServer();
    const ok = await loadWithRetry(win, localUrl(port));
    if (!ok) {
      dialog.showErrorBox('无法打开页面', '内置服务未能及时就绪，请尝试切换运行模式或重启 App。');
    }
    return { ok: true, mode: 'offline', url: localUrl(port) };
  }

  const url = normalizeServerUrl(cfg.serverUrl);
  if (!url) return { ok: false, error: '服务器地址无效' };
  win.setTitle('班级积分管理');
  await loadWithRetry(win, url + '/');
  return { ok: true, mode: 'remote', url };
}

// ============================================================
// 自动更新（App 版）
//   打包后通过 electron-builder 生成的 latest*.yml 检查新版本
// ============================================================
let updater = null;
let updateReady = false;

function getUpdater() {
  if (updater) return updater;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', err => {
      dialog.showMessageBox({
        type: 'error',
        title: '检查更新失败',
        message: '无法检查更新',
        detail: (err && err.message) || '未知错误'
      });
    });
    autoUpdater.on('update-not-available', () => {
      dialog.showMessageBox({
        type: 'info',
        title: '检查更新',
        message: '已是最新版本',
        detail: `当前版本 v${app.getVersion()}`
      });
    });
    autoUpdater.on('update-available', info => {
      dialog.showMessageBox({
        type: 'question',
        title: '发现新版本',
        message: `发现新版本 v${info.version}`,
        detail: '是否现在下载更新？下载完成后会提示重启安装。',
        buttons: ['立即下载', '稍后'],
        defaultId: 0,
        cancelId: 1
      }).then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate().catch(() => { /* 错误已由 error 事件处理 */ });
      });
    });
    autoUpdater.on('download-progress', progress => {
      const percent = Math.round(progress.percent || 0);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setProgressBar(percent / 100);
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setTitle(`班级积分管理 · 下载更新 ${percent}%`);
      }
    });
    autoUpdater.on('update-downloaded', info => {
      updateReady = true;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setProgressBar(-1);
        mainWindow.setTitle('班级积分管理');
      }
      dialog.showMessageBox({
        type: 'question',
        title: '更新已下载',
        message: `新版本 v${info.version} 已下载完成`,
        detail: '重启 App 即可完成安装，是否现在重启？',
        buttons: ['立即重启', '稍后'],
        defaultId: 0,
        cancelId: 1
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
    });
    updater = autoUpdater;
  } catch (err) {
    console.warn('electron-updater 不可用:', err.message);
    updater = null;
  }
  return updater;
}

/** 检查更新（仅在打包后的 App 中有效） */
async function checkUpdate() {
  if (!app.isPackaged) {
    dialog.showMessageBox({
      type: 'info',
      title: '检查更新',
      message: '开发模式不检查更新',
      detail: '打包后的 App 才会从 GitHub Releases 获取最新版本。'
    });
    return { ok: false, reason: 'dev' };
  }
  const up = getUpdater();
  if (!up) {
    dialog.showMessageBox({
      type: 'warning',
      title: '检查更新',
      message: '更新组件不可用',
      detail: '当前安装包未包含 electron-updater，请手动下载最新安装包。'
    });
    return { ok: false, reason: 'no-updater' };
  }
  try {
    await up.checkForUpdates();
    return { ok: true };
  } catch {
    return { ok: false, reason: 'check-failed' };
  }
}

// ============================================================
// 菜单
// ============================================================
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [];

  if (isMac) {
    template.push({
      label: app.getName(),
      submenu: [
        { role: 'about', label: '关于 班级积分管理' },
        { type: 'separator' },
        { label: '检查更新…', click: () => checkUpdate() },
        { type: 'separator' },
        { role: 'hide', label: '隐藏' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    });
  }

  template.push({
    label: '文件',
    submenu: [
      {
        label: '切换运行方式…',
        accelerator: 'CmdOrCtrl+Shift+M',
        click: async () => {
          const win = mainWindow;
          if (!win) return;
          const { response } = await dialog.showMessageBox(win, {
            type: 'question',
            title: '切换运行方式',
            message: '要切换到哪种运行方式？',
            detail: '离线模式使用本机数据；连接模式需要输入已有服务器的地址。',
            buttons: ['离线模式', '连接已有服务器', '取消'],
            defaultId: 2,
            cancelId: 2
          });
          if (response === 2) return;
          if (response === 0) {
            writeConfig({ mode: 'offline' });
            await enterMode(win, { mode: 'offline' });
          } else {
            await showChooser(win);
          }
        }
      },
      { type: 'separator' },
      isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' }
    ]
  });

  template.push({
    label: '视图',
    submenu: [
      { role: 'reload', label: '重新加载' },
      { role: 'forceReload', label: '强制重新加载' },
      { role: 'toggleDevTools', label: '开发者工具' },
      { type: 'separator' },
      { role: 'resetZoom', label: '实际大小' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '全屏' }
    ]
  });

  template.push({
    label: '帮助',
    submenu: [
      ...(isMac ? [] : [{ label: '检查更新…', click: () => checkUpdate() }, { type: 'separator' }]),
      {
        label: '项目主页',
        click: () => shell.openExternal('https://github.com/dongchengqiao/class-score-mgr')
      },
      {
        label: '查看本地日志目录',
        click: async () => {
          const dir = path.join(app.getPath('userData'), 'logs');
          fs.mkdirSync(dir, { recursive: true });
          shell.openPath(dir);
        }
      },
      {
        label: '关于',
        click: () => {
          dialog.showMessageBox({
            type: 'info',
            title: '关于',
            message: '班级积分管理 · 桌面版',
            detail: `版本 v${app.getVersion()}\n运行方式：${currentMode === 'remote' ? '连接已有服务器' : '离线（内置服务）'}\n数据目录：${path.join(app.getPath('userData'), 'data')}`
          });
        }
      }
    ]
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ============================================================
// IPC（供模式选择页与页面内调用）
// ============================================================
function registerIpc() {
  ipcMain.handle('desktop:get-config', () => ({
    config: readConfig(),
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged,
    dataDir: path.join(app.getPath('userData'), 'data')
  }));

  ipcMain.handle('desktop:start-offline', async () => {
    if (!mainWindow) return { ok: false, error: '窗口不存在' };
    writeConfig({ mode: 'offline' });
    return enterMode(mainWindow, { mode: 'offline' });
  });

  ipcMain.handle('desktop:connect-remote', async (_e, serverUrl) => {
    if (!mainWindow) return { ok: false, error: '窗口不存在' };
    const url = normalizeServerUrl(serverUrl);
    if (!url) return { ok: false, error: '请填写形如 http://192.168.1.10:4000 的地址' };
    writeConfig({ mode: 'remote', serverUrl: url });
    return enterMode(mainWindow, { mode: 'remote', serverUrl: url });
  });

  ipcMain.handle('desktop:switch-mode', async () => {
    if (!mainWindow) return { ok: false };
    await showChooser(mainWindow);
    return { ok: true };
  });

  ipcMain.handle('desktop:check-update', () => checkUpdate());
  ipcMain.handle('desktop:install-update', () => {
    if (updateReady && updater) updater.quitAndInstall();
    return { ok: updateReady };
  });
}

// ============================================================
// 启动流程
// ============================================================
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  registerIpc();
  buildMenu();
  const win = createWindow();

  const cfg = readConfig();
  if (cfg) {
    const result = await enterMode(win, cfg).catch(err => ({ ok: false, error: err.message }));
    if (!result || !result.ok) await showChooser(win);
  } else {
    await showChooser(win);
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const next = createWindow();
      const nextCfg = readConfig();
      if (nextCfg) await enterMode(next, nextCfg).catch(() => showChooser(next));
      else await showChooser(next);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 退出前把进度条/标题复位，避免残留
app.on('before-quit', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);
});
