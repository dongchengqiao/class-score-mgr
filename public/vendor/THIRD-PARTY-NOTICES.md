# 第三方资源许可证说明 (THIRD-PARTY NOTICES)

本项目的 `public/vendor/` 目录下所有第三方资源均为**本地自托管**，不依赖任何外部 CDN。
以下是各资源的来源、许可证及本地许可证文件位置。

---

## 1. Font Awesome 6.4.0 (图标字体)

- **来源**: https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/
- **版权**: Copyright 2023 Fonticons, Inc.
- **许可证**: Font Awesome Free License（三重许可）
  - **图标 (SVG/JS)**: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
  - **字体 (Webfonts)**: [SIL OFL 1.1](https://scripts.sil.org/OFL)
  - **代码 (CSS)**: [MIT License](https://opensource.org/licenses/MIT)
- **本地许可证文件**: `public/vendor/font-awesome/LICENSE.txt`
- **本地文件**:
  - `css/all.min.css` — 样式表
  - `webfonts/` — 8 个字体文件 (woff2/ttf)
- **使用要求**: 免费使用，允许商用；若使用图标需保留 CC BY 4.0 署名（本页即署名来源）。

---

## 2. Google Fonts (网页字体)

### 2.1 Nunito
- **来源**: https://fonts.googleapis.com (google/fonts 仓库 `ofl/nunito`)
- **版权**: Copyright 2014 The Nunito Project Authors (https://github.com/googlefonts/nunito)
- **许可证**: [SIL Open Font License 1.1](https://scripts.sil.org/OFL)
- **本地许可证文件**: `public/vendor/fonts/licenses/OFL-Nunito.txt`

### 2.2 Quicksand
- **来源**: https://fonts.googleapis.com (google/fonts 仓库 `ofl/quicksand`)
- **许可证**: [SIL Open Font License 1.1](https://scripts.sil.org/OFL)
- **本地许可证文件**: `public/vendor/fonts/licenses/OFL-Quicksand.txt`

### 2.3 Comic Neue
- **来源**: https://fonts.googleapis.com (google/fonts 仓库 `ofl/comicneue`)
- **许可证**: [SIL Open Font License 1.1](https://scripts.sil.org/OFL)
- **本地许可证文件**: `public/vendor/fonts/licenses/OFL-ComicNeue.txt`

- **本地文件**:
  - `fonts.css` — @font-face 定义（含 unicode-range 分段）
  - `*.woff2` — 10 个字体文件
  - `licenses/` — 3 个 OFL 许可证

> **OFL 1.1 要点**: 允许免费使用、修改、再分发（含商用）；不能单独出售字体文件本身；若修改后重命名分发需保留版权声明。自托管使用完全合规。

---

## 3. SheetJS (xlsx) 0.20.3 — Excel 读写库

- **来源**: https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js
- **版权**: (C) 2013-present SheetJS -- http://sheetjs.com
- **许可证**: [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- **本地许可证文件**: `public/vendor/xlsx/LICENSE`
- **本地文件**: `xlsx.full.min.js`
- **使用要求**: Apache 2.0 允许自由使用、修改、再分发（含商用），修改后需保留版权声明与本许可证副本（已包含）。

---

## 汇总表

| 资源 | 版本 | 许可证 | 本地许可证路径 |
|------|------|--------|----------------|
| Font Awesome | 6.4.0 | CC BY 4.0 / SIL OFL 1.1 / MIT | `vendor/font-awesome/LICENSE.txt` |
| Nunito | v32 (可变) | SIL OFL 1.1 | `vendor/fonts/licenses/OFL-Nunito.txt` |
| Quicksand | v37 (可变) | SIL OFL 1.1 | `vendor/fonts/licenses/OFL-Quicksand.txt` |
| Comic Neue | v9 | SIL OFL 1.1 | `vendor/fonts/licenses/OFL-ComicNeue.txt` |
| SheetJS (xlsx) | 0.20.3 | Apache 2.0 | `vendor/xlsx/LICENSE` |

*最后更新: 2026-10-10*
