# 金融考研择校通（Electron 桌面应用）

金融专业考研择校参考工具：收录全国 **31 个省市 212 所**一本及以上院校的金融学硕（0202）与金融专硕（0251）招生信息，包括复试线、录取人数、报名人数/报录比、学费、学制、初试科目、参考书目、就业口碑等，支持筛选、搜索、收藏、对比，并内置**可视化数据编辑器**，方便每年自行更新数据。

当前版本：**v1.1.0**（数据参考年份 2026）。

## 开发与运行

```bash
npm install        # 安装依赖
npm start          # 启动应用（开发模式）
node test-renderer.js   # 运行功能测试（24 项）
npm run dist       # 打包 Windows 安装包（输出到 dist/）
```

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
