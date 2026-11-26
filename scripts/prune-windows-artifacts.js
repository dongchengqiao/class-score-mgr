#!/usr/bin/env node
/**
 * 清理 Windows「双架构合并包」，并同步精简 latest.yml 的自动更新清单。
 *
 * ## 背景：合并包是怎么来的
 * electron-builder 在一次 `--win --x64 --arm64` 构建中，除按架构分别产出
 *   class-score-mgr-<ver>-x64-setup.exe / -arm64-setup.exe
 * 还会额外生成一份文件名**不带架构后缀**的合并安装包
 *   class-score-mgr-<ver>-setup.exe（约 164MB，≈两个安装包之和）
 * 成因见 app-builder-lib/out/targets/nsis/NsisTarget.js:122：
 *   `primaryArch = archs.size === 1 ? arch : null`，
 * 多架构合并构建时 primaryArch 为 null，展开 artifactName 时 `${arch}` 被丢弃。
 *
 * ## 为什么删除合并包不会影响自动更新
 * electron-updater 的 Provider.findFile()（out/providers/Provider.js）先从
 * latest.yml 的 files 里挑 URL 含当前 process.arch 的条目，命中即用：
 *   files.find(it => [it.url.pathname, it.info.url].some(n => n.includes(process.arch))
 *                    ?? files.shift()
 * 因此 files 中只要保留 x64 / arm64 条目，两类用户都会下载各自的小包；
 * 顶层 path / sha512 仅在 files 为空时才回退使用（getFileList），
 * 这里同步改写 path / sha512，保证两种读法结果一致。
 *
 * ## 执行顺序与安全措施
 * 1. 先改写 latest.yml 并重新解析校验（files 条目数、条目内容、path 指向）；
 * 2. 校验通过才真正删除合并包；校验失败则回滚 latest.yml、保留全部产物，
 *    并以非 0 退出，避免发布「清单里指向已删除文件」的坏配置。
 *
 * ## 用法
 *   node scripts/prune-windows-artifacts.js           # CI / 默认：electron/dist
 *   CSM_DIST_DIR=/tmp/xxx node scripts/prune-...js   # 本地自测指定目录
 */
const fs = require('fs');
const path = require('path');

// CSM_DIST_DIR 仅用于本地自测；CI 中不设置，默认指向 electron/dist
const DIST_DIR = process.env.CSM_DIST_DIR
  ? path.resolve(process.env.CSM_DIST_DIR)
  : path.resolve(__dirname, '..', 'electron', 'dist');
const YML_PATH = path.join(DIST_DIR, 'latest.yml');

/** 视为「分架构产物」的命名，如 `-x64-setup.exe` / `-arm64-portable.exe` */
const ARCH_TAG = /-(x64|arm64)(-|\.)/i;

const log = (msg) => console.log(`[prune-windows-artifacts] ${msg}`);

/** 收集不带架构后缀的 Windows 合并产物（分架构 exe、dmg、zip、latest*.yml 均不在其中） */
function collectMergedArtifacts() {
  if (!fs.existsSync(DIST_DIR)) {
    log(`产物目录不存在，跳过：${DIST_DIR}`);
    return [];
  }
  const list = [];
  for (const name of fs.readdirSync(DIST_DIR)) {
    if (!name.toLowerCase().endsWith('.exe')) continue;
    if (ARCH_TAG.test(name)) continue; // 分架构产物：保留
    list.push(name);
  }
  return list;
}

/**
 * 解析 latest.yml 中的 files 条目。
 * latest.yml 由 js-yaml 按固定格式输出（files 为顶层键，条目缩进 2 空格，
 * 属性缩进 4 空格），故此处逐行处理，避免在 CI 里额外安装 YAML 依赖。
 * 返回 { filesIdx, blocks, endIdx }，无法识别时返回 null。
 */
function parseFiles(lines) {
  const filesIdx = lines.findIndex((l) => /^files:\s*$/.test(l));
  if (filesIdx === -1) return null;

  const blocks = [];
  let i = filesIdx + 1;
  while (i < lines.length && /^\s*-\s+\S/.test(lines[i])) {
    const start = i++;
    while (i < lines.length && /^\s+\S/.test(lines[i]) && !/^\s*-\s+\S/.test(lines[i])) i++;
    const text = lines.slice(start, i).join('\n');
    // 条目块是多行文本，正则必须带 m 标志，否则 `^` 只匹配块首
    const url = (text.match(/^\s*-\s*url:\s*(\S+)/m) || [])[1] || '';
    const sha512 = (text.match(/^\s*sha512:\s*(\S+)/m) || [])[1] || '';
    if (!url) return null;
    blocks.push({ text, url, sha512 });
  }
  return { filesIdx, blocks, endIdx: i };
}

/** 校验改写结果：条目数量与内容一致、顶层 path 指向保留条目 */
function verifyOutput(lines, expectedUrls) {
  const parsed = parseFiles(lines);
  if (!parsed) return '缺少可解析的 files 列表';
  const urls = parsed.blocks.map((b) => b.url);
  if (urls.length !== expectedUrls.length) {
    return `files 条目数不符（期望 ${expectedUrls.length}，实际 ${urls.length}）`;
  }
  if (urls.join('|') !== expectedUrls.join('|')) {
    return `files 条目内容不符：${urls.join(', ')}`;
  }
  const pathLine = lines.find((l) => /^path:/.test(l));
  if (!pathLine) return '缺少顶层 path';
  const pathValue = pathLine.slice('path:'.length).trim();
  if (!expectedUrls.includes(pathValue)) return `顶层 path (${pathValue}) 不在 files 中`;
  return null;
}

/**
 * 精简 latest.yml：files 只保留分架构条目，顶层 path / sha512 指向第一个保留条目。
 * @returns {boolean} 是否成功（无需改写也算成功）
 */
function pruneLatestYml() {
  if (!fs.existsSync(YML_PATH)) {
    log('未找到 latest.yml（非 Windows 构建），跳过');
    return true;
  }
  const original = fs.readFileSync(YML_PATH, 'utf8');
  const lines = original.split(/\r?\n/);

  const parsed = parseFiles(lines);
  if (!parsed) {
    log('latest.yml 中没有可识别的 files 列表，保持原样');
    return true;
  }
  const { filesIdx, blocks, endIdx } = parsed;

  const kept = blocks.filter((b) => ARCH_TAG.test(b.url));
  if (kept.length === 0) {
    log('files 中没有带架构后缀的条目，保持原样');
    return true;
  }

  const first = kept[0];
  const pathLine = lines.find((l) => /^path:/.test(l));
  const pathValue = pathLine ? pathLine.slice('path:'.length).trim() : null;

  // 需要改写的两种情况：①files 里混有合并包条目；②顶层 path 指向合并包（
  // 否则删掉合并包后会留下悬空 path，虽然 files 非空时该字段不被使用）
  const needPrune = kept.length !== blocks.length;
  const needPathFix = pathValue !== null && !kept.some((b) => b.url === pathValue);

  if (!needPrune && !needPathFix) {
    log('latest.yml 已只含分架构条目且 path 正确，无需改写');
    return true;
  }

  const tail = lines.slice(endIdx).map((line) => {
    if (/^path:/.test(line)) return `path: ${first.url}`;
    if (/^sha512:/.test(line)) return `sha512: ${first.sha512}`;
    return line;
  });

  const output = [...lines.slice(0, filesIdx + 1), ...kept.map((b) => b.text), ...tail].join('\n');
  const problem = verifyOutput(output.split(/\r?\n/), kept.map((b) => b.url));
  if (problem) {
    fs.writeFileSync(YML_PATH, original, 'utf8');
    log(`改写结果校验失败（${problem}），已回滚 latest.yml`);
    return false;
  }

  fs.writeFileSync(YML_PATH, output, 'utf8');
  if (needPrune) {
    log(`latest.yml 已精简：移除 ${blocks.length - kept.length} 个合并包条目，保留 ${kept.length} 个`);
  }
  if (needPathFix) {
    log(`latest.yml 的 path 已修正：${pathValue} -> ${first.url}`);
  }
  log(`自动更新入口 path -> ${first.url}`);
  return true;
}

const merged = collectMergedArtifacts();
const ok = pruneLatestYml();

if (!ok) {
  log('保留全部产物（未删除合并包），请人工检查 latest.yml');
  process.exit(1);
}

if (merged.length === 0) {
  log('未发现双架构合并包');
} else {
  for (const name of merged) {
    fs.unlinkSync(path.join(DIST_DIR, name));
    log(`已删除合并包：${name}`);
  }
}

log('完成');
