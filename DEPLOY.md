# 网页版部署说明

## 〇、当前状态：已下线（2026-09-24）

**网站已于 2026-09-24 从 Cloudflare Pages 删除，公网已无法访问**
（`jinrong-kaoyan.pages.dev` DNS 解析返回 `Non-existent domain`，部署子域名同样失效）。

原因：凡宝要求下线，改为只有自己使用。

### 现在怎么用

**方式一（推荐）：桌面应用**
桌面快捷方式「金融考研择校通」→ v1.3.0，内置同样的 211 所院校数据，功能更全
（多了「导入备份」「打开数据文件夹」）。

**方式二：双击单文件网页**
`dist-web/index.html` —— 这是自包含单文件（CSS/JS/数据全内联），
**双击用浏览器打开即可，不需要任何服务器**（已在 `file://` 协议下实测：211 所院校正常渲染）。
可以随便复制到别的位置或发给别人。

### 如果要重新上线

```bash
npm run build:web
npx wrangler pages project create jinrong-kaoyan --production-branch=main
npx wrangler pages deploy dist-web --project-name=jinrong-kaoyan --branch=main --commit-dirty=true
```

两条命令，约 30 秒。

### 如果要「在线但只有自己能看」

用 **Cloudflare Access**（Zero Trust，免费额度 50 个用户）给 Pages 项目加访问策略，
只有指定邮箱能进，访问时会要求邮箱验证码。适合需要在手机/多设备上看的场景。
入口：Cloudflare 后台 → Zero Trust → Access → Applications → Add an application → Self-hosted。

---

## 一、打包产物

```bash
npm run build:web      # 或 node tools/build-web.js
```

输出到 `dist-web/`，**1 个页面文件**：

```
index.html   223.5 KB（brotli 压缩后 48.7 KB）—— CSS、JS、211 所院校数据全部内联
_headers     缓存策略（Netlify / Cloudflare Pages 自动识别）
robots.txt   允许搜索引擎收录
.nojekyll    给 GitHub Pages 用，跳过 Jekyll 处理
```

### 为什么是单文件（2026-09-23 的优化）

初版是多文件（`renderer/` + `data/` 共 12 个文件）。实测发现**慢的原因不是带宽**——
整站 brotli 压缩后只有 46 KB——**而是请求数**：首屏要发 9 个请求
（跳转页 → 页面 → JS/CSS → 5 个 JSON），每个都得绕到境外节点，延迟层层叠加。

改成单文件后首屏只需 **1 个请求**，压缩后约 48.7 KB（比多文件版还小，因为省掉了 8 份响应头）。
代价是页面不再分级缓存，所以 `_headers` 把缓存压到 5 分钟，保证数据更新能及时生效。

打包时会自动做数据自检（院校数、省市数、内联是否成功），不通过会直接报错退出。

> 单文件版的路径无关紧要（没有任何外部引用），放根目录或子目录都一样。

---

## 二、先选路线：要不要备案

| | 免备案路线 | 备案路线 |
|---|---|---|
| 平台 | Cloudflare Pages / Vercel / GitHub Pages | 阿里云 OSS / 腾讯云 COS + CDN |
| 费用 | 免费 | 域名 ~¥40/年 + 存储流量约 ¥1-5/月 |
| 上线时间 | **10 分钟** | **2-4 周**（卡在备案审核） |
| 国内访问速度 | ⚠️ 不稳定，可能较慢甚至打不开 | ✅ 快且稳定 |
| 域名 | 用平台送的二级域名，或自己绑域名（不用备案） | 必须用已备案的域名 |

**我的建议**：先走免备案路线，10 分钟上线，把链接发给几个同学实测。如果大家都反馈慢，再花钱花时间去备案——别在没人用之前先等 4 周。

---

## 三、路线 A：免备案（推荐先做）

### A1. Cloudflare Pages（最省事）

1. 打开 https://dash.cloudflare.com/ → 注册/登录
2. 左侧 **Workers & Pages** → **Create** → **Pages** → **Upload assets**
3. 项目名填 `jinrong-kaoyan`（会变成 `jinrong-kaoyan.pages.dev`）
4. 把 **`dist-web/` 里的全部文件**拖进去（注意：拖的是文件夹里的内容，不是文件夹本身）
5. 点 **Deploy**，几十秒后拿到链接

以后更新数据：进项目 → **Create new deployment** → 重新拖一次新的 `dist-web/` 内容。

### A2. Vercel

1. https://vercel.com/ → 登录
2. **Add New** → **Project** → 选 **Deploy from a template** 不方便的话，用 CLI 更直接：
   ```bash
   npx vercel deploy --prod dist-web
   ```
   （首次会让你登录授权，然后自动上传）
3. 拿到 `xxx.vercel.app` 链接

### A3. GitHub Pages

1. 建一个仓库，把 `dist-web/` 里的内容推到 `main` 分支根目录
2. 仓库 **Settings** → **Pages** → Source 选 `Deploy from a branch` → `main` / `/ (root)`
3. 拿到 `你的用户名.github.io/仓库名/` 链接（**这是子目录部署**，本项目已验证支持）

---

## 四、路线 B：备案（国内访问快）

适合确定要长期做、且在意国内访问体验的情况。

### B1. 准备

1. **域名**：在阿里云/腾讯云买（`.com` 约 ¥60/年，`.cn` 约 ¥30/年）
2. **云服务**：阿里云 OSS 或腾讯云 COS（静态网站托管），或一台轻量应用服务器
3. **备案**：在云服务商的备案系统提交，需要身份证、手机号、以及服务商提供的备案服务号

### B2. 备案注意事项（容易踩的坑）

- 个人备案**网站名称不要出现「教育」「培训」「学院」「考研辅导」**等词，容易被驳回或要求提供资质。建议用中性名称，如「金融择校数据参考」。
- 备案期间网站**不能对外访问**（云服务商会拦截未备案域名的 80/443）。
- 备案通过后，网站底部要放备案号并链接到 `beian.miit.gov.cn`。
- 内容是公开数据整理，**必须保留免责声明**（应用内「使用说明」页已有）。

### B3. 部署

1. OSS/COS 建 Bucket，开启**静态网站托管**，默认首页设为 `index.html`
2. 把 `dist-web/` 里的文件全部上传
3. 绑定已备案域名，开 CDN 加速
4. **注意**：`_headers` 文件只在 Netlify/Cloudflare Pages 生效，OSS/COS 需要在控制台手动配置缓存规则（建议 `data/*` 缓存 10 分钟，`renderer/*` 缓存 1 小时）

---

## 五、以后更新数据怎么办

1. 改 `data/batch*.json` 或 `data/national.json`（编辑器的「导出备份」也能拿到整份 JSON）
2. 跑 `npm test` 确认没改坏（54 项测试）
3. 跑 `node tools/build-web.js` 重新打包
4. 把新的 `dist-web/` 重新上传/部署

桌面应用那边不用管，两边共用同一份 `data/`。

---

## 六、当前网页版的已知限制

- **桌面优先设计**：没有做移动端适配，手机上会是缩小版的桌面布局。要做移动端需要给 `styles.css` 加响应式断点。
- **SEO 偏弱**：内容是 JS 渲染的，搜索引擎对这类页面的收录和排名不理想。想被搜到需要预渲染成静态 HTML。
- **数据编辑只存本机**：访客在「数据管理」页的修改只写进他自己的浏览器，不影响其他人。
