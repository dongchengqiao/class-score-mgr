# 班级积分管理系统

基于 **Node.js + Express + JSON 文件存储** 的班级积分管理应用，前后端分离，纯原生前端（无框架），开箱即用。

## ✨ 功能总览

| 功能 | 说明 |
|------|------|
| 👥 学生管理 | 学生增删改查、批量添加、头像上传、按姓名搜索、多选批量操作 |
| ➕➖ 积分管理 | 学生加减分（合并按钮，含原因）、批量加减分（合并）、小组操作、撤回记录 |
| 🎤 语音加分 | Web Speech API 语音识别，智能匹配学生姓名（支持拼音/同音字/模糊匹配），确认后提交 |
| 📖 早读加分 | 独立早读评分页面，一键批量保存积分 |
| 🛍️ 积分商城 | 商品兑换、库存管理、积分扣减与兑换记录 |
| 👥 小组管理 | 分组、组内积分操作、小组一周积分详情导出 |
| 📊 管理后台 | 系统统计（人数/积分/规则/历史）、密码管理、数据导入导出、Excel 报表、小组管理、规则管理 |
| 🔐 权限控制 | 三级权限：管理员 / 用户（可加减分）/ 访客（只读），JWT 7 天有效 |
| ⚡ 实时同步 | 通过 WebSocket（`/ws`）推送变更，多端页面自动刷新，无需手动重载 |
| 🧾 运行日志 | 结构化日志写入 `logs/app.log`（时间 / IP / 操作 / 详情），支持后台接口查看 |
| 💻 桌面版 | Electron App，可离线使用（内置服务）也可连接已有服务器，支持自动更新 |

## 🚀 快速启动

```bash
# 安装依赖（首次）
cd backend && npm install

# 启动服务（根目录）
npm start
# 或直接运行
./start.sh
```

服务默认运行在 **http://localhost:4000**

| 页面 | 地址 |
|------|------|
| 主页面（学生积分） | `http://localhost:4000/index.html` |
| 语音加分（独立页） | `http://localhost:4000/voice.html` |
| 早读加分 | `http://localhost:4000/zaodu.html` |
| 管理后台 | `http://localhost:4000/admin.html` |
| 登录页 | `http://localhost:4000/login.html` |

## 📁 项目结构

```
班级积分管理/
├── backend/                  # 后端服务
│   ├── server.js             # Express 入口（端口 4000）
│   ├── json-db.js            # JSON 数据引擎（存储/迁移/CRUD）
│   ├── lib/
│   │   ├── logger.js         # 结构化日志（时间/IP/操作/详情，5MB 轮转）
│   │   ├── realtime.js       # WebSocket 实时推送（/ws，心跳 + 写操作广播）
│   │   ├── runtime.js        # 重启逻辑（Web 版重启进程 / 桌面版原地重启）
│   │   ├── setup-state.js    # 初始化状态（needsSetup / 版本 / 数据目录）
│   │   └── log-tee.js        # 终端输出与日志文件同步
│   ├── middleware/
│   │   └── auth.js           # JWT 认证中间件（admin/user/guest 三角色）
│   ├── routes/
│   │   ├── auth.js           # 登录/密码验证/用户密码管理
│   │   ├── students.js       # 学生 CRUD + 加减分 + 撤回
│   │   ├── groups.js         # 小组管理
│   │   ├── rules.js          # 积分规则
│   │   ├── shop.js           # 积分商城
│   │   ├── data.js           # 数据导入导出 / Excel 报表
│   │   ├── morning-reading.js# 早读加分
│   │   ├── setup.js          # 初始化向导 + 向导页数据导入
│   │   └── admin.js          # 统计 / 设置 / 端口 / 运行日志
├── data/                     # 数据目录（项目根目录，已被 .gitignore 忽略，不纳入版本管理）
│   ├── config.json           # 设置（settings）+ 自增序列（_sequences）
│   ├── student.json          # 学生（students，含各自 history）
│   ├── group.json            # 小组（groups）
│   ├── rule.json             # 规则（rules，含 add / minus）
│   └── shouItems.json        # 售卖物品（shopItems）
├── public/                   # 前端（纯原生 HTML/CSS/JS）
│   ├── data/
│   │   └── pinyinmap.json    # 汉字→拼音映射（879 条，语音匹配用，静态资源）
│   ├── index.html            # 主页面
│   ├── admin.html            # 管理后台
│   ├── login.html            # 登录页
│   ├── voice.html            # 语音加分独立页
│   ├── zaodu.html            # 早读加分页
│   ├── css/                  # 样式
│   ├── js/
│   │   ├── api.js            # API 客户端（封装 fetch + token）
│   │   ├── app.js            # 主页面逻辑
│   │   ├── realtime.js       # WebSocket 客户端（自动重连 + 状态指示）
│   │   ├── voice.js          # 语音识别 + 姓名匹配引擎
│   │   ├── zaodu.js          # 早读加分逻辑
│   │   ├── setup.js          # 初始化向导逻辑（含导入数据）
│   │   ├── admin.js          # 管理后台逻辑
│   │   └── ui.js / features.js
│   └── uploads/              # 头像上传目录
├── electron/                 # 桌面版（Electron）
│   ├── main.js               # 主进程：启动内置服务 / 连接服务器 / 自动更新 / 菜单
│   ├── preload.js            # 预加载脚本（contextBridge 暴露 desktop API）
│   ├── connect.html          # 「选择运行方式」页面（离线 / 连接已有服务器）
│   ├── electron-builder.yml  # 打包配置（Win x64+ARM 安装包/单文件、macOS x64+ARM）
│   └── stage/                # 打包用临时目录（由脚本生成，已 .gitignore）
├── scripts/
│   ├── prepare-electron-app.js # 生成 electron/stage（复制前后端 + 安装运行时依赖）
│   └── prune-windows-artifacts.js # 构建后清理 Windows 双架构合并包 + 精简 latest.yml
├── package.json              # 根脚本（install:all / start / dev / desktop:*）
└── start.sh                  # 一键启动脚本
```

> 根目录下的 `班级积分管理.html` / `早读加分.html` 为早期的单文件版本，已被 `.gitignore` 忽略，正式版本以 `public/` 下页面为准。

## 🧠 数据存储设计

- 数据按实体拆分存储于项目根目录 `data/` 下的多个 JSON 文件，**无数据库依赖**，直接可读可备份：
  - `config.json` — 设置 + 自增序列
  - `student.json` — 学生
  - `group.json` — 小组
  - `rule.json` — 规则
  - `shouItems.json` — 售卖物品
- 写入采用原子操作（写 `.tmp` 后 rename），避免中途断电损坏文件
- `_sequences` 自动递增序列：`students` / `groups` / `rules` / `shopItems` 用于生成实体 ID
- `_sequences.history` 语义为 **历史记录总条数**（统计展示用），每次 `save()` 自动校准
- 每个学生的历史记录 ID **独立从 1 开始**递增，学生之间互不干扰，撤回时按「学生 ID + 历史 ID」精确定位
- 启动时自动执行迁移：顶层 `history` → 学生内部数组、默认规则插入、自增序列校准、历史 ID 重编号

### 积分规则存储（`rules`）

规则按 **加分 / 减分** 分区存储，便于管理后台分区展示与前端按符号过滤：

```json
"rules": {
  "add":   [ { "id": 1, "name": "回答问题正确", "points": 1, "sort_order": 1 }, ... ],
  "minus": [ { "id": 2, "name": "上课讲话", "points": -2, "sort_order": 1 }, ... ]
}
```

- 加分规则 `points > 0` 存于 `add`，减分规则 `points < 0` 存于 `minus`
- 后端 `getRules()` 返回**扁平合并数组**（按 `sort_order` 排序），前端无需感知分区
- 修改规则分值导致符号变化时，后端自动将其迁移到对应分区
- 旧版扁平数组格式在启动时自动迁移为 `{ add, minus }` 结构

## 🎤 语音匹配策略

`voice.js` 按优先级依次尝试（支持同音字/模糊）：

1. 精确子串匹配
2. 按序包含匹配
3. 字符编辑距离
4. 拼音子串（标准 / 归一化）
5. 给定名匹配（2/3/4 字名）
6. 给定名拼音子串（编辑距离 ≤ 2）
7. 首尾字匹配
8. 拼音编辑距离（阈值 0.75）

`normalizePinyin` 处理特殊韵母规则（ün → iong/ong、vn → iong 等）。

## 🔒 权限模型（三级）

系统采用 **三级权限**，通过 JWT（7 天有效）区分身份：

| 身份 | 凭据 | Token | 权限范围 |
|------|------|-------|---------|
| **管理员** | 管理员密码（`settings.app_password_hash`，SHA-256 校验） | admin token | 全部功能：加减分、语音/早读加分、**管理后台**（admin.html）、密码管理、数据导入导出 |
| **用户** | 用户密码（`settings.user_password_hash`，由管理员在后台设置） | user token | 可加减分、语音/早读加分；**不可访问管理后台**。主页显示"用管理员密码登录"按钮；直接进入 admin.html 会提示"登录管理员账号"并跳回登录页 |
| **访客** | 无 | 无 token | 仅浏览（GET 公开），任何写操作返回 401 |

### 认证流程

- 登录页（`login.html`）提供 **管理员 / 用户** 两个 Tab，分别调用 `/api/auth/verify` 与 `/api/auth/verify-user` 验证密码
- 登录成功后 token 存入 `localStorage.auth_token`；访客模式直接清除 token 进入主页（仅浏览）
- `middleware/auth.js` 拦截规则：
  - **无 token**：GET 请求以 `guest` 身份放行（只读）；写请求返回 `401 AUTH_REQUIRED`
  - **有 token**：校验 JWT 签名与有效期（过期返回 `401 TOKEN_EXPIRED`，无效返回 `401 TOKEN_INVALID`）
  - 写操作（POST/PUT/DELETE）仅允许 `admin` / `user` 角色，其余返回 `403 GUEST_FORBIDDEN`
  - `/api/admin/*` 额外挂载 `requireAdmin` 中间件，仅 `admin` 角色可访问，其余返回 `403 ADMIN_REQUIRED`

### 密码管理

- **管理员密码**：管理员登录后进入管理后台 → 密码管理区（设置 / 修改 / 取消）
- **用户密码**：由管理员在管理后台密码管理区设置，用户凭此密码登录（与管理员密码相互独立）
- **修改 / 取消密码无需输入旧密码**：登录状态下凭 token 身份即可直接修改或取消（密码管理接口均在 `requireAdmin` 保护下，仅管理员可操作）

### 认证相关接口

| 接口 | 说明 |
|------|------|
| `GET /api/auth/status` | 查询密码设置状态（`hasPassword` / `hasAdminPassword` / `hasUserPassword`） |
| `POST /api/auth/verify` | 管理员密码登录 → 返回 admin token |
| `POST /api/auth/verify-user` | 用户密码登录 → 返回 user token |
| `POST /api/auth/set-user-password` | 管理员设置用户密码（返回 user token） |
| `POST /api/auth/change-user-password` | 修改用户密码，仅需 `newPassword`，凭 admin token 即可 |
| `POST /api/auth/cancel-user-password` | 取消用户密码，凭 admin token 即可 |
| `POST /api/auth/set-password` | 首次设置管理员密码（返回 admin token） |
| `POST /api/auth/change-password` | 修改管理员密码，仅需 `newPassword`，凭 admin token 即可 |
| `POST /api/auth/cancel-password` | 取消管理员密码，凭 admin token 即可 |

## 🎨 前端交互设计

- **统一样式弹窗**：所有确认 / 提示框均使用网页自定义模态框（`UI.confirm` / `UI.alert`），替代原生 `confirm()` / `alert()`，与整体主题风格一致
- **合并加减分按钮**：学生卡片上的「加分」「减分」合并为一个「加减分」按钮，点击后弹出同时包含加分与减分规则的统一弹窗（自定义分数支持正数加分、负数减分）
- **批量操作**：进入「批量操作」模式后可多选学生，通过「批量加减分」按钮统一为选中学生加减分（规则分区展示，自定义分数同样支持正负）
- **小组一周积分导出**：支持导出小组一周积分详情（Excel 报表）

## 🛠️ 开发命令

```bash
npm run dev          # 后端热重载（node --watch）
npm run install:all  # 安装后端依赖

# 桌面版
npm run desktop:prepare   # 生成 electron/stage（含前后端与运行时依赖）
npm run desktop:start     # 本地运行桌面版
npm run desktop:dist      # 打包当前平台
npm run desktop:dist:mac  # 打包 macOS（x64 + arm64）
npm run desktop:dist:win  # 打包 Windows（x64 + arm64）
```

## ⚡ 实时同步与运行日志

- **WebSocket**：服务端在 `/ws` 提供长连接（30 秒心跳、断线自动重连）。任一客户端写入成功后，服务端广播 `{resource, action, by}`，主页 / 管理后台 / 早读页收到后自动刷新对应数据，右上角状态灯显示连接状态。
- **运行日志**：`logs/app.log` 每行包含日期时间、级别、执行 IP、中文操作名与详情，超过 5MB 自动轮转为 `app.log.1`。
- **查看日志**：管理员可调用 `GET /api/admin/logs?lines=200` 拉取最近日志行。

## 💻 桌面版（Electron）

桌面版首次启动会显示「选择运行方式」页面：

| 模式 | 说明 |
|------|------|
| **离线使用** | App 自带内置服务，数据保存在系统应用数据目录，无需安装 Node.js 或单独服务器 |
| **连接已有服务器** | 填写已有服务地址（如 `http://192.168.1.10:4000`）作为客户端使用，与网页版共享同一份数据 |

- 运行中可通过菜单 **文件 → 切换运行方式**（`Cmd/Ctrl + Shift + M`）随时切换模式。
- 离线模式下可在管理后台修改端口，服务会在 **同一进程内原地重启**，窗口自动跳转新端口，App 不会退出。
- **自动更新**：内置 `electron-updater`，菜单「帮助 → 检查更新」或启动后静默检查，下载完成后可立即安装。
- 默认端口若被占用，会自动向后寻找空闲端口。

### 更新包与架构

Release 中的桌面版产物按架构命名，`electron-updater` 会按当前机器的 `process.arch` **自动选择对应架构的小包**（Windows 约 80~90MB），不会下载体积翻倍的双架构合并包：

| 产物 | 用途 |
|------|------|
| `*-x64-setup.exe` / `*-arm64-setup.exe` | 分架构安装包，自动更新实际下载的文件 |
| `*-x64-portable.exe` / `*-arm64-portable.exe` | 分架构免安装单文件版（手动下载用） |
| `*-x64.dmg` / `*-arm64.dmg`、`*-x64.zip` / `*-arm64.zip` | macOS 分架构产物（zip 为自动更新用） |

> `electron-builder` 一次构建两种架构时会额外产生文件名**不带架构后缀**的合并安装包（`*-setup.exe` / `*-portable.exe`，约 164MB）。CI 与本地 `npm run dist:win` 构建结束后会执行 `scripts/prune-windows-artifacts.js` 将其删除，并同步精简 `latest.yml`（`files` 只保留分架构条目、顶层 `path`/`sha512` 指向第一个分架构包），因此 Release 不再包含冗余大包。

### 桌面版数据与日志位置

| 系统 | 数据目录 |
|------|----------|
| macOS | `~/Library/Application Support/班级积分管理/` |
| Windows | `%APPDATA%\班级积分管理\` |

其中 `data/` 为业务数据（含 `uploads/` 头像），`logs/` 为运行日志，`desktop-config.json` 记录当前运行方式。

### 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 服务监听端口 | `4000`（`data/config.json` 的 `port` 优先于默认值） |
| `CSM_DATA_DIR` | 数据目录 | `<项目根>/data` |
| `CSM_LOG_DIR` | 日志目录 | `<项目根>/logs` |
| `CSM_UPLOADS_DIR` | 头像上传目录 | `<数据目录>/uploads` |
| `CSM_APP_ROOT` | 应用根目录（读取 `public/`、`package.json`） | 自动推断 |
| `CSM_DESKTOP` | 设为 `1` 表示桌面版（原地重启、写 PID 文件） | 未设置 |
| `CSM_TERMINAL` | 设为 `0` 关闭重启时沿用终端 | 沿用终端 |

## 📌 注意事项

- 语音识别需使用 **Chrome / Edge** 浏览器（Web Speech API）
- 前后端默认端口 4000，可通过环境变量 `PORT` 或管理后台的「服务端口」修改
- 桌面版未签名，首次打开需在系统设置中允许运行（macOS：右键「打开」；Windows：SmartScreen「仍要运行」）
- 备份数据只需拷贝整个 `data/` 目录（或其中的 `config.json` / `student.json` / `group.json` / `rule.json` / `shouItems.json`）