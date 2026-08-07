# 703班 · 班级积分管理系统

基于 **Node.js + Express + JSON 文件存储** 的班级积分管理应用，前后端分离，纯原生前端（无框架），开箱即用。

## ✨ 功能总览

| 功能 | 说明 |
|------|------|
| 👥 学生管理 | 学生增删改查、批量添加、头像上传、按姓名搜索 |
| ➕➖ 积分管理 | 学生加减分（含原因）、批量加减分、小组操作、撤回记录 |
| 🎤 语音加分 | Web Speech API 语音识别，智能匹配学生姓名（支持拼音/同音字/模糊匹配），确认后提交 |
| 📖 早读加分 | 独立早读评分页面，一键批量保存积分 |
| 🛍️ 积分商城 | 商品兑换、库存管理、积分扣减与兑换记录 |
| 👥 小组管理 | 分组、组内积分操作 |
| 📊 管理后台 | 系统统计（人数/积分/规则/历史）、密码管理、数据导入导出、Excel 报表 |
| 🔐 权限控制 | 管理员密码登录（JWT 7 天有效），访客只读模式 |

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
│   ├── middleware/
│   │   └── auth.js           # JWT 认证中间件
│   ├── routes/
│   │   ├── auth.js           # 登录/密码验证/访客 token
│   │   ├── students.js       # 学生 CRUD + 加减分 + 撤回
│   │   ├── groups.js         # 小组管理
│   │   ├── rules.js          # 积分规则
│   │   ├── shop.js           # 积分商城
│   │   ├── data.js           # 数据导入导出 / Excel 报表
│   │   ├── morning-reading.js# 早读加分
│   │   └── admin.js          # 统计 / 设置
│   └── data/
│       ├── class-data.json   # 主数据文件（学生/规则/设置/序列）
│       └── pinyinmap.json    # 汉字→拼音映射（879 条，语音匹配用）
├── public/                   # 前端（纯原生 HTML/CSS/JS）
│   ├── index.html            # 主页面
│   ├── admin.html            # 管理后台
│   ├── login.html            # 登录页
│   ├── voice.html            # 语音加分独立页
│   ├── zaodu.html            # 早读加分页
│   ├── css/                  # 样式
│   ├── js/
│   │   ├── api.js            # API 客户端（封装 fetch + token）
│   │   ├── app.js            # 主页面逻辑
│   │   ├── voice.js          # 语音识别 + 姓名匹配引擎
│   │   ├── zaodu.js          # 早读加分逻辑
│   │   ├── admin.js          # 管理后台逻辑
│   │   └── ui.js / features.js
│   └── uploads/              # 头像上传目录
├── package.json              # 根脚本（install:all / start / dev）
└── start.sh                  # 一键启动脚本
```

> 根目录下的 `班级积分管理.html` / `早读加分.html` 为早期的单文件版本，已被 `.gitignore` 忽略，正式版本以 `public/` 下页面为准。

## 🧠 数据存储设计

- 所有数据存于 `backend/data/class-data.json`，**无数据库依赖**，直接可读可备份
- 写入采用原子操作（写 `.tmp` 后 rename），避免中途断电损坏文件
- `_sequences` 自动递增序列：`students` / `groups` / `rules` / `shopItems` 用于生成实体 ID
- `_sequences.history` 语义为 **历史记录总条数**（统计展示用），每次 `save()` 自动校准
- 每个学生的历史记录 ID **独立从 1 开始**递增，学生之间互不干扰，撤回时按「学生 ID + 历史 ID」精确定位
- 启动时自动执行迁移：顶层 `history` → 学生内部数组、默认规则插入、自增序列校准、历史 ID 重编号

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

## 🔒 权限模型

- **管理员**：密码登录（SHA-256 校验）→ 获得 admin JWT（7 天），可写操作
- **访客**：无需密码，只读浏览
- 所有写接口（POST/PUT/DELETE）由 `middleware/auth.js` 拦截，仅 admin token 可通过

## 🛠️ 开发命令

```bash
npm run dev       # 后端热重载（node --watch）
npm run install:all  # 安装后端依赖
```

## 📌 注意事项

- 语音识别需使用 **Chrome / Edge** 浏览器（Web Speech API）
- 前后端端口固定 4000，可通过环境变量 `PORT` 修改
- 备份数据只需拷贝 `backend/data/class-data.json`