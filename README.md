# 金融考研择校通（Electron 桌面应用）

金融专业考研择校参考工具：收录全国 **31 个省市 211 所**一本及以上院校的金融学硕（0202）与金融专硕（0251）招生信息，包括复试线、录取人数、报名人数/报录比、学费、学制、初试科目、参考书目、就业口碑等，支持筛选、搜索、收藏、对比，并内置**可视化数据编辑器**，方便每年自行更新数据。

当前版本：**v1.4.0**（数据参考年份 2026）。

## 主要功能

| 功能 | 说明 |
|---|---|
| 院校查询 | 按省份 / 层次 / 数学科目 / 资料完整度筛选，支持搜索、收藏、4 所并排对比 |
| **按分数匹配** | 填预估总分，每所院校标注「保底 / 稳妥 / 冲刺 / 差距大」（按与复试线相差 15 分划档），可「只看能上的」 |
| 国家线参考 | 经济学门类 2022–2026 国家线（A/B 区总分与单科） |
| 数据管理 | 212 行表格带搜索与「完整度」列；可增删改院校、导出/导入备份 |
| 导出 | 当前筛选结果导出 CSV（带 BOM，Excel 中文不乱码）；对比表导出 CSV / 打印存 PDF |
| 外观 | 深色模式（跟随系统）、打印样式、三档缓存策略 |
| **移动端** | 窄屏（≤900px）侧栏变顶部横向导航、卡片 4 列→2 列→1 列、弹窗全屏、宽表格横向滚动；375px 实测零横向溢出 |
| **登录鉴权** | 网页版由 Cloudflare Pages Functions 做**服务端**校验（账号密码存在服务端密钥里，前端拿不到），30 天会话，可退出登录 |

## 开发与运行

```bash
npm install        # 安装依赖
npm start          # 启动应用（开发模式）
npm test           # 运行全部测试（渲染 72 + 迁移 15 + 网页版 15 + 鉴权 23 = 125 项）
npm run dist       # 打包 Windows 安装包（输出到 dist/）
npm run verify:build  # 打包后核验三份产物与源码一致（防中途失败的"漂移"）
```

## 网页版（同一套代码，无需改动即可上线）

渲染层是纯 HTML/CSS/JS，**对 Electron 的依赖只有一处**（`app.js` 的 `getApi()`），没有 Electron 桥时自动切到浏览器模式。
**桌面端与移动端都适配**（≤900px 侧栏变顶部导航、卡片降列、弹窗全屏）。

```bash
npm run build:web   # 输出 dist-web/
```

产物结构：

```
index.html          自包含单文件应用（CSS/JS/数据全内联，首屏 1 个请求）
login.html          登录页（自带样式，响应式）
functions/          服务端鉴权（_middleware + api/login + api/logout）
_headers / robots.txt / .nojekyll
```

`dist-web/index.html` **双击即可用，不需要任何服务器**（已在 `file://` 协议下实测）；
登录鉴权只在部署到 Cloudflare Pages 后生效。

> ⚠️ 部署时注意：`wrangler pages deploy dist-web` 不会读取 `dist-web/functions/`，
> 必须用 `npx wrangler pages deploy . --cwd dist-web ...`，看到 `Compiled Worker successfully` 才算带上鉴权。
> 详见 [`DEPLOY.md`](./DEPLOY.md)。

**详细的托管、鉴权与备案说明见 [`DEPLOY.md`](./DEPLOY.md)。**

更推荐用打包脚本生成只含必要文件的产物：

```bash
npm run build:web      # 输出 dist-web/（12 个文件 / 约 220 KB，含 _headers、robots.txt）
```

**详细的托管与备案说明见 [`DEPLOY.md`](./DEPLOY.md)。**

浏览器模式与桌面版的差异（由 `body.web-mode` 控制）：

| 功能 | 桌面版 | 网页版 |
|---|---|---|
| 院校查询 / 国家线 / 使用说明 | ✅ | ✅ |
| 收藏、对比（localStorage） | ✅ | ✅ |
| 数据编辑 | 写入本机数据文件 | 只写访客自己的浏览器，不影响他人 |
| 导出备份 | 保存到磁盘 | 浏览器下载 |
| 导入备份 / 打开数据文件夹 | ✅ | 隐藏（浏览器做不到） |

> 网页版是**桌面优先**设计（固定侧栏 + 多列网格），没有做移动端适配；超宽屏（≥1680px）下内容会自动限宽居中。

打包（国内镜像）：

```bash
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/" \
npx electron-builder --win nsis
```

## 数据说明（重要）

- 内置数据整理自公开资料（研招网、各校研究生院官网、当年招生简章等），**仅供参考，报考前务必以研招网（yz.chsi.com.cn）和目标院校当年招生简章为准**。
- 每条数据标有参考年份；写「约」「需核实」的字段为网络资料整理值；空缺字段表示公开渠道无可靠数据。
- **不编造数字**：查不到就留空，空缺本身是有效信息。报名人数绝大多数院校不公开，因此大量留空属正常。
- 历年国家线（经济学门类，学硕/金专共用）内置在「国家线参考」页。
- 有官方出处的院校在详情弹窗底部列出「数据核实来源」链接。

## 数据维护

- **应用内**：「数据管理」页可添加/编辑/删除院校，保存后自动写入本机数据文件。
- **数据文件位置**：`C:\Users\<用户名>\AppData\Roaming\finance-kaoyan-app\data.json`（安装版）。
- **备份/迁移**：「导出备份」生成 JSON；「导入备份」在新电脑恢复。
- **恢复出厂**：「恢复内置数据」可重置（会先自动备份，但会覆盖自定义修改，建议先手动导出）。
- **修改内置默认数据**：直接编辑 `data/batch1-4.json`（省份分组）和 `data/national.json`（国家线），重新打包即生效。

### 批量合并调研数据（tools/merge-research.js）

把调研结果按 `.research/region-*.json`（整校记录）、`.research/sparse-fix.json`（补稀疏院校）和
`.research/bk-emp*.json`（字段补丁）放好，然后：

```bash
node tools/merge-research.js --dry   # 只看统计，不写入
node tools/merge-research.js         # 写入 data/batch*.json
```

合并是**幂等**的（重复跑不会重复拼接文本），且安全优先：只在新值非空时覆盖，文本字段新旧不同则用「｜」拼接、两边信息都不丢；拿到精确复试线后自动删掉约数 `la`。

### 人工校正表（tools/data-corrections.json）

合并时 `tags` 是**取并集**——只会加不会减。所以「调研把某校错标成自划线」这类错误，
靠重新合并是消不掉的，必须在 `data-corrections.json` 里显式声明：

```json
{
  "deleteSchools": ["重复的 id"],
  "removeTags": { "院校id": ["自划线"] },
  "appendNote": { "院校id": "要追加的说明" }
}
```

每次 `merge-research.js` 跑完会自动应用这张表，保证反复合并结果一致。
**目前表里记录的是**：删除重复的 `tianjingongye`；摘掉中央民族大学、华东师范大学、中国海洋大学
被误标的 `自划线`（这三所是 985 但不在 34 所自主划线名单内）。

### 年度更新流程

1. 每年 9-10 月各校发布下一年简章后，把新数据合并进 `data/batch*.json`（可用 `tools/merge-research.js`，见下）。
2. 在 `renderer/app.js` 顶部把 `YEARS` 加上新年份、删掉最老年份（决定编辑器里的复试线输入框和列表展示年份）。
3. 更新 `data/national.json` 的国家线。
4. 修改 `main.js` 顶部的 `DATA_VERSION` 加 1 —— **安装版下次启动会自动把新数据迁移过去**：
   - 用户从未改过数据 → 整体替换为最新内置数据；
   - 用户改过数据 → 保守合并，只补入新增院校，不覆盖用户修改；
   - 两种情况都会先在数据目录写一份 `data.backup-<时间戳>.json`。
5. 改 `package.json` 的 `version`，重新打包。

### 批量合并调研数据（tools/merge-research.js）

把调研结果按 `.research/region-*.json`（整校记录）和 `.research/bk-emp.json`（字段补丁）放好，然后：

```bash
node tools/merge-research.js --dry   # 只看统计，不写入
node tools/merge-research.js         # 写入 data/batch*.json
```

合并是**幂等**的（重复跑不会重复拼接文本），且安全优先：只在新值非空时覆盖，文本字段新旧不同则用「｜」拼接、两边信息都不丢；拿到精确复试线后自动删掉约数 `la`。

## 项目结构

```
main.js            Electron 主进程（窗口、数据读写、导入导出、数据版本迁移）
preload.js         安全桥接（contextBridge）
renderer/
  index.html       界面结构（四个视图 + 弹窗）
  styles.css       样式
  app.js           全部交互逻辑（筛选/详情/对比/编辑器）
data/
  national.json    历年国家线
  batch1-4.json    院校数据（华北东北 / 华东 / 中南 / 西南西北）
tools/
  merge-research.js  调研结果批量合并工具
test-renderer.js   jsdom 功能测试（24 项）
```

## 数据字段约定

院校对象：`id` / `name` / `prov` / `city` / `tags`（只用 985、211、双一流、财经类、自划线）/ `y` / `x`（学硕）/ `z`（专硕）/ `note` / `sources`（可选，核实来源链接）

program（x / z）字段：

| 字段 | 含义 |
|------|------|
| `m` | 初试数学（303数学三 / 396经济类综合 / 数三或396（分学院）/ 不考数学 / 待核实） |
| `j` | 专业课初试科目（如 431金融学综合） |
| `f` | 学费 |
| `d` | 学制 |
| `l` | 各年复试线（对象，键为年份字符串，**只填有公开出处的精确值**） |
| `la` | 复试线约数（无确切公开值时，如 `"360-380"`） |
| `e` / `a` | 录取人数 / 报名人数 |
| `bk` | 专业课参考书目（仅官方指定/大纲书目） |
| `emp` | 就业方向与口碑（一句话） |
| `nt` | 备注（分学院划线、推免比例、改考 396 等） |
