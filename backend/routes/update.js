// ============================================================
// 版本更新接口 — 从 GitHub Releases 获取并安装最新发行版
//   GET  /api/update/version  本地版本号
//   GET  /api/update/latest   查询最新发行版（含更新日志与下载地址）
//   POST /api/update/apply    下载并自动覆盖代码（保留 data/ 等用户数据）
// ============================================================
const express = require('express');
const router = express.Router();
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { URL } = require('url');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const runtime = require('../lib/runtime');

// GitHub 仓库（可用环境变量 GITHUB_REPO 覆盖，格式 owner/repo）
const REPO = process.env.GITHUB_REPO || 'dongchengqiao/class-score-mgr';
// gh-proxy 加速前缀
const GH_PROXY = 'https://gh-proxy.org/';
// GitHub API
const API_BASE = 'https://api.github.com';
// 应用根目录（项目根；桌面版由 CSM_APP_ROOT 指向打包的运行时目录）
const APP_ROOT = process.env.CSM_APP_ROOT
  ? path.resolve(process.env.CSM_APP_ROOT)
  : path.join(__dirname, '..', '..');
// 请求超时（毫秒）
const TIMEOUT = 15000;
// 下载超时（毫秒）
const DOWNLOAD_TIMEOUT = 120000;
// 结果缓存时长（毫秒），避免频繁触发 GitHub 限流
const CACHE_TTL = 5 * 60 * 1000;

/**
 * 升级时绝对不能覆盖的路径（相对项目根，正斜杠分隔）
 * data/ 存放全部业务数据；uploads 存放头像；node_modules 为本地依赖
 */
const PROTECTED_PATHS = [
  'data',
  'backend/node_modules',
  'node_modules',
  'uploads',
  'public/uploads',
  'nogit',
  '.git',
  '.github',
  'class-data.json',
  'class-data.json.bak'
];

let cache = { at: 0, data: null };
let applying = false;
// 记录最近一次更新的结果（供 /status 查询，判断是否已重启生效）
let lastApply = null;
// 是否在更新后自动重启服务（可用环境变量 AUTO_RESTART=0 关闭）
const AUTO_RESTART = process.env.AUTO_RESTART !== '0';
let autoRestart = AUTO_RESTART;

/** 读取本地版本号（根目录 package.json） */
function getLocalVersion() {
  try {
    const pkgPath = path.join(APP_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || '0.0.0';
  } catch (err) {
    return '0.0.0';
  }
}

/** 判断相对路径是否属于受保护路径（升级时不覆盖） */
function isProtected(relPath) {
  const p = String(relPath).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!p) return true;
  if (p.split('/').some(seg => seg === '..')) return true;
  return PROTECTED_PATHS.some(prot => p === prot || p.startsWith(prot + '/'));
}

/** 把 "v1.2.3" 之类的标签规范化为 "1.2.3" */
function normalizeVersion(tag) {
  if (!tag) return '';
  return String(tag).trim().replace(/^v/i, '');
}

/** 把版本号按数字段比较，返回 a>b → 1, a<b → -1, 相等 → 0 */
function compareVersion(a, b) {
  const pa = normalizeVersion(a).split(/[.\-+]/).map(x => parseInt(x, 10) || 0);
  const pb = normalizeVersion(b).split(/[.\-+]/).map(x => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** 为下载地址生成 gh-proxy 加速地址 */
function withProxy(url) {
  if (!url) return '';
  return GH_PROXY + url;
}

/** 用 node:https 直接请求（用于 fetch 因证书链问题失败时的兜底）
 *  insecure=true 时跳过证书校验（部分 macOS / 内网环境缺少根证书） */
function httpsGetJson(url, insecure) {
  const https = require('https');
  const { URL } = require('url');
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request({
      hostname: target.hostname,
      path: target.pathname + target.search,
      method: 'GET',
      timeout: TIMEOUT,
      rejectUnauthorized: !insecure,
      headers: {
        'User-Agent': 'class-score-mgr-updater',
        'Accept': 'application/vnd.github+json'
      }
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = body ? JSON.parse(body) : null; } catch { json = null; }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json, text: body });
      });
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    req.end();
  });
}

/** 带超时的 fetch，返回 { ok, status, json }
 *  证书链异常（如 UNABLE_TO_GET_ISSUER_CERT_LOCALLY）时自动降级重试 */
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'class-score-mgr-updater',
        'Accept': 'application/vnd.github+json'
      }
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: res.ok, status: res.status, json, text };
  } catch (err) {
    const code = (err && err.cause && err.cause.code) || '';
    const certIssue = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code + (err && err.message ? err.message : ''));
    if (!certIssue) throw err;
    // 证书校验失败 → 跳过校验重试一次（仅访问 GitHub API）
    console.warn('GitHub API 证书校验失败，降级为跳过校验重试:', code || err.message);
    return httpsGetJson(url, true);
  } finally {
    clearTimeout(timer);
  }
}

/** 下载文件到本地（自动跟随重定向，证书异常时降级重试） */
function downloadFile(url, destPath, insecure, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('重定向次数过多'));
    const target = new URL(url);
    const req = https.request({
      hostname: target.hostname,
      path: target.pathname + target.search,
      method: 'GET',
      timeout: DOWNLOAD_TIMEOUT,
      rejectUnauthorized: !insecure,
      headers: { 'User-Agent': 'class-score-mgr-updater' }
    }, res => {
      // 跟随重定向（GitHub Release 资源会 302 到 CDN）
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(downloadFile(next, destPath, insecure, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`下载失败（HTTP ${res.statusCode}）`));
      }
      const out = fs.createWriteStream(destPath);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(destPath)));
      out.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('下载超时')));
    req.on('error', err => {
      const code = err.code || '';
      if (!insecure && /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ISSUER/i.test(code + err.message)) {
        console.warn('下载证书校验失败，降级为跳过校验重试:', code || err.message);
        return downloadFile(url, destPath, true, redirects);
      }
      reject(err);
    });
    req.end();
  });
}

/** 在解压目录中找到真正的项目根（处理 class-score-mgr/ 外层目录） */
function findSourceRoot(extractDir) {
  const entries = fs.readdirSync(extractDir, { withFileTypes: true })
    .filter(e => !e.name.startsWith('__MACOSX') && e.name !== '.DS_Store');
  // 形如 class-score-mgr/ 的单层包装目录
  if (entries.length === 1 && entries[0].isDirectory()) {
    return path.join(extractDir, entries[0].name);
  }
  return extractDir;
}

/** 收集源目录下需要覆盖的文件（排除受保护路径） */
function collectFiles(srcRoot) {
  const files = [];
  (function walk(dir, relBase) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.DS_Store' || entry.name === '__MACOSX') continue;
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (isProtected(rel)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.isFile()) {
        files.push({ absPath: abs, relPath: rel });
      }
    }
  })(srcRoot, '');
  return files;
}

/** 安全读取 JSON 文件 */
function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** 在指定目录执行 npm install（带超时；有 devDependencies 时一并安装） */
function runNpmInstall(cwd, pkg) {
  return new Promise(resolve => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const hasDevDeps = !!(pkg && pkg.devDependencies && Object.keys(pkg.devDependencies).length);
    const args = hasDevDeps
      ? ['install', '--no-audit', '--no-fund']
      : ['install', '--omit=dev', '--no-audit', '--no-fund'];
    let output = '';
    let child;
    const startedAt = Date.now();
    try {
      child = spawn(npmCmd, args, { cwd, env: process.env });
    } catch (err) {
      return resolve({ success: false, error: err.message, durationMs: 0 });
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }, 5 * 60 * 1000);

    child.stdout.on('data', d => { output += d.toString(); });
    child.stderr.on('data', d => { output += d.toString(); });
    child.on('error', err => {
      clearTimeout(timer);
      resolve({ success: false, error: err.message, durationMs: Date.now() - startedAt });
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({
        success: code === 0,
        exitCode: code,
        durationMs: Date.now() - startedAt,
        message: code === 0 ? '依赖安装完成' : '依赖安装失败，可手动在该目录执行 npm install',
        output: output.slice(-2000)
      });
    });
  });
}

/** 把 GitHub Release 转换为前端易用的结构 */
function mapRelease(release, localVersion) {
  const tag = release.tag_name || release.name || '';
  const version = normalizeVersion(tag);
  const assets = (release.assets || []).map(asset => ({
    name: asset.name,
    size: asset.size,
    contentType: asset.content_type,
    downloadUrl: asset.browser_download_url,
    proxyUrl: withProxy(asset.browser_download_url),
    downloadCount: asset.download_count
  }));

  return {
    tag,
    version,
    name: release.name || tag,
    body: release.body || '',
    publishedAt: release.published_at || release.created_at || null,
    htmlUrl: release.html_url || '',
    prerelease: !!release.prerelease,
    draft: !!release.draft,
    assets,
    // 主下载包（优先取 zip）
    primaryAsset: assets.find(a => /\.zip$/i.test(a.name)) || assets[0] || null,
    localVersion,
    hasUpdate: compareVersion(version, localVersion) > 0,
    repo: REPO,
    proxyPrefix: GH_PROXY,
    protectedPaths: PROTECTED_PATHS
  };
}

/** 获取最新发行版数据（带缓存，force=true 强制刷新） */
async function getLatestRelease(force, useProxy) {
  const localVersion = getLocalVersion();
  if (!force && cache.data && Date.now() - cache.at < CACHE_TTL) {
    return { cached: true, data: cache.data };
  }

  const { ok, status, json } = await fetchJson(`${API_BASE}/repos/${REPO}/releases/latest`);
  if (!ok || !json) {
    const err = new Error(status === 404
      ? '该仓库尚未发布任何发行版'
      : (status === 403 || status === 429)
        ? 'GitHub API 访问频率受限，请稍后再试'
        : `GitHub 接口返回异常（HTTP ${status}）`);
    err.status = status;
    throw err;
  }

  const data = mapRelease(json, localVersion);
  const pick = a => (useProxy ? a.proxyUrl : a.downloadUrl);
  data.assets = data.assets.map(a => ({ ...a, preferredUrl: pick(a) }));
  if (data.primaryAsset) {
    data.primaryAsset = { ...data.primaryAsset, preferredUrl: pick(data.primaryAsset) };
  }

  cache = { at: Date.now(), data };
  return { cached: false, data };
}

// ==================== GET ====================

/** 本地版本 */
router.get('/version', (req, res) => {
  res.json({
    version: getLocalVersion(),
    repo: REPO,
    proxyPrefix: GH_PROXY,
    protectedPaths: PROTECTED_PATHS,
    autoRestart: AUTO_RESTART,
    startedAt: runtime.STARTED_AT
  });
});

/** 最新发行版（refresh=1 强制刷新，proxy=1 优先返回加速地址） */
router.get('/latest', async (req, res) => {
  const localVersion = getLocalVersion();
  const force = req.query.refresh === '1' || req.query.refresh === 'true';
  const useProxy = req.query.proxy === '1' || req.query.proxy === 'true';

  try {
    const { cached, data } = await getLatestRelease(force, useProxy);
    res.json({ success: true, cached, ...data });
  } catch (err) {
    const reason = err && err.name === 'AbortError'
      ? '连接 GitHub 超时，请检查网络后重试'
      : (err.message || '无法连接 GitHub，请检查服务器网络或稍后重试');
    console.error('GET /api/update/latest error:', err);
    res.status(err.status === 404 ? 404 : 502).json({
      success: false,
      error: reason,
      localVersion,
      repo: REPO
    });
  }
});

// ==================== POST ====================

/**
 * 下载并安装最新发行版（自动覆盖旧代码，保留 data/ 等用户数据）
 * body: { useProxy?: boolean, assetName?: string }
 */
router.post('/apply', async (req, res) => {
  if (applying) {
    return res.status(409).json({ success: false, error: '已有更新正在进行，请稍候' });
  }
  applying = true;

  const useProxy = !!(req.body && req.body.useProxy);
  const assetName = req.body && req.body.assetName;
  // 前端可显式指定是否自动重启（环境变量 AUTO_RESTART=0 可全局关闭）
  autoRestart = AUTO_RESTART && !(req.body && req.body.autoRestart === false);
  let tmpDir = null;

  try {
    // 1. 获取最新发行版信息（强制刷新）
    const { data } = await getLatestRelease(true, useProxy);

    // 2. 选择安装包（优先 zip）
    const assets = data.assets || [];
    const asset = assetName
      ? assets.find(a => a.name === assetName)
      : (assets.find(a => /\.zip$/i.test(a.name)) || assets[0]);
    if (!asset) {
      return res.status(400).json({ success: false, error: '该发行版没有可安装的安装包' });
    }
    if (!/\.zip$/i.test(asset.name)) {
      return res.status(400).json({ success: false, error: '仅支持从 zip 安装包自动更新' });
    }

    // 3. 下载（按勾选情况优先直连或 gh-proxy，失败自动切换备用地址）
    const primary = useProxy ? (asset.proxyUrl || asset.downloadUrl) : asset.downloadUrl;
    const secondary = useProxy ? asset.downloadUrl : asset.proxyUrl;
    const urls = [primary];
    if (secondary && secondary !== primary) urls.push(secondary);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csm-update-'));
    const zipPath = path.join(tmpDir, asset.name);

    let lastErr = null;
    let usedUrl = '';
    for (const url of urls) {
      try {
        await downloadFile(url, zipPath, false);
        usedUrl = url;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        console.warn('下载失败，尝试备用地址:', url, err.message);
      }
    }
    if (lastErr) throw lastErr;

    // 4. 解压到临时目录
    const extractDir = path.join(tmpDir, 'extract');
    fs.mkdirSync(extractDir, { recursive: true });
    new AdmZip(zipPath).extractAllTo(extractDir, true);

    const srcRoot = findSourceRoot(extractDir);
    const files = collectFiles(srcRoot);
    if (!files.length) {
      throw new Error('安装包内容为空或结构异常');
    }

    // 5. 记录旧版本与旧依赖（判断是否需要重装依赖）
    const oldPkg = readJsonSafe(path.join(APP_ROOT, 'package.json'));
    const oldBackendPkg = readJsonSafe(path.join(APP_ROOT, 'backend', 'package.json'));

    // 6. 逐文件覆盖（受保护路径已由 collectFiles 排除，此处再兜底一次）
    let written = 0;
    const writtenFiles = [];
    const skipped = [];
    for (const f of files) {
      if (isProtected(f.relPath)) { skipped.push(f.relPath); continue; }
      const dest = path.join(APP_ROOT, f.relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, fs.readFileSync(f.absPath));
      written++;
      if (writtenFiles.length < 200) writtenFiles.push(f.relPath);
    }

    // 7. 依赖有变化时自动 npm install（失败不阻断更新，仅提示）
    const newPkg = readJsonSafe(path.join(APP_ROOT, 'package.json'));
    const newBackendPkg = readJsonSafe(path.join(APP_ROOT, 'backend', 'package.json'));

    const depsChanged = (before, after) => {
      const a = before || {};
      const b = after || {};
      return JSON.stringify(a.dependencies) !== JSON.stringify(b.dependencies) ||
        JSON.stringify(a.devDependencies) !== JSON.stringify(b.devDependencies);
    };

    const npmResults = [];
    // 后端依赖（生产依赖）
    if (depsChanged(oldBackendPkg, newBackendPkg)) {
      npmResults.push({
        target: 'backend',
        ...(await runNpmInstall(path.join(APP_ROOT, 'backend'), newBackendPkg))
      });
    } else if (!fs.existsSync(path.join(APP_ROOT, 'backend', 'node_modules'))) {
      // 依赖目录缺失（如全新部署）也要装
      npmResults.push({
        target: 'backend',
        ...(await runNpmInstall(path.join(APP_ROOT, 'backend'), newBackendPkg))
      });
    }
    // 根目录依赖（若有）
    const rootHasDeps = newPkg && (
      Object.keys(newPkg.dependencies || {}).length ||
      Object.keys(newPkg.devDependencies || {}).length
    );
    if (rootHasDeps && depsChanged(oldPkg, newPkg)) {
      npmResults.push({
        target: 'root',
        ...(await runNpmInstall(APP_ROOT, newPkg))
      });
    }

    const npmFailed = npmResults.filter(r => !r.success);

    // 8. 清理缓存 + 记录本次更新结果
    cache = { at: 0, data: null };
    lastApply = {
      at: new Date().toISOString(),
      fromVersion: (oldPkg && oldPkg.version) || null,
      toVersion: (newPkg && newPkg.version) || data.version,
      tag: data.tag,
      filesWritten: written,
      npmResults,
      restartPending: true
    };

    res.json({
      success: true,
      message: `已更新到 v${lastApply.toVersion}`,
      fromVersion: lastApply.fromVersion,
      toVersion: lastApply.toVersion,
      tag: data.tag,
      asset: asset.name,
      downloadUrl: usedUrl,
      usedProxy: useProxy,
      filesWritten: written,
      filesSkipped: skipped.length,
      filesSample: writtenFiles,
      preservedPaths: PROTECTED_PATHS,
      dependenciesInstalled: npmResults,
      npmFailed: npmFailed.map(r => r.target),
      needsRestart: true,
      autoRestart: autoRestart,
      restartHint: autoRestart
        ? '正在自动重启服务，页面将在几秒后自动刷新...'
        : '请重启后端服务使新版本生效（在项目根目录运行 ./start.sh）'
    });

    // 9. 自动重启（响应已发出，延迟执行保证数据刷出）
    if (autoRestart) {
      runtime.restart(800).catch(err => console.error('自动重启失败:', err));
    }
  } catch (err) {
    console.error('POST /api/update/apply error:', err);
    // GitHub 返回的业务错误（如暂无发行版）保留其状态码
    const code = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
    res.status(code).json({
      success: false,
      error: err.message || '自动更新失败',
      detail: err.code || undefined
    });
  } finally {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    applying = false;
  }
});

/** 手动重启服务（供前端在自动重启失败时重试） */
router.post('/restart', (req, res) => {
  res.json({ success: true, message: '服务正在重启...', startedAt: runtime.STARTED_AT });
  runtime.restart(300).catch(err => console.error('手动重启失败:', err));
});

/** 运行状态：用于前端判断服务是否已重启完成 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    version: getLocalVersion(),
    startedAt: runtime.STARTED_AT,
    lastApply,
    restartPending: !!(lastApply && lastApply.restartPending)
  });
});

module.exports = router;
