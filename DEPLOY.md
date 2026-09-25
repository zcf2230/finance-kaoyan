# 网页版部署说明

## 〇、当前状态：已重新上线 + 登录鉴权 + 移动端适配（2026-09-25）

- **线上地址**：https://jinrong-kaoyan.pages.dev
- **登录**：账号 `ZCF`（密码见 Cloudflare 密钥，不在代码与文档里）
- **平台**：Cloudflare Pages + Pages Functions（免费额度足够）
- **账号**：zcf2230@gmail.com（Account ID `195f61883161e7da9de43293f7643f93`）
- **已实测**：未登录 → 302 跳登录页；密码错 → 401；密码对 → 下发 HttpOnly Cookie 并可访问应用；
  手机 375px 与电脑 1200px 均正常渲染、零横向溢出。

### 鉴权是怎么做的（不是前端假校验）

纯前端 JS 校验密码 = 假安全，按 F12 就能在源码里看到密码。这里用 **Cloudflare Pages Functions**
做服务端校验：

```
cloudflare/functions/_middleware.js   所有请求先过这里；无有效 Cookie 就跳登录页
cloudflare/functions/api/login.js     POST 比对服务端密钥，通过后下发签名 Cookie
cloudflare/functions/api/logout.js    清 Cookie 回登录页
```

- 账号密码存在 **Cloudflare 项目环境变量**（`USER` / `PASS` / `SESSION_SECRET`），浏览器拿不到；
- 会话令牌 = `HMAC-SHA256(SESSION_SECRET, 固定串)`，不知道密钥无法伪造；
- Cookie 带 `HttpOnly; Secure; SameSite=Lax`，有效期 30 天；
- **改 `SESSION_SECRET` 可让所有已登录设备立即失效**；
- 密码错误与账号错误返回同样的提示，不泄露哪个错了。

### ⚠️ 部署时的一个坑

`wrangler pages deploy dist-web` **不会**读取 `dist-web/functions/`——它只从**当前工作目录**找 `functions/`。
第一次部署时输出里没有 `Compiled Worker successfully`，线上首页仍是 200（没鉴权）。
正确写法（`--cwd` 指到产物目录，让 `functions/` 被探测到）：

```bash
npm run build:web
npx wrangler pages deploy . --cwd dist-web --project-name=jinrong-kaoyan --branch=main --commit-dirty=true
```

看到 **`Compiled Worker successfully` + `Uploading Functions bundle`** 才算把鉴权部署上去了。

### ⚠️⚠️ 另一个更隐蔽的坑：clean URLs 导致无限重定向

**症状**：浏览器打开站点报 `ERR_TOO_MANY_REDIRECTS`，停在 `/login.html` 上。

**原因**：Cloudflare Pages 有 **clean URLs** 特性，会把 `/login.html` **308 重定向到 `/login`**。
如果中间件的放行名单里只写了 `/login.html`，就会死循环：

```
/            → 中间件无 Cookie → 302 → /login.html
/login.html  → Pages clean URLs → 308 → /login
/login       → 中间件：/login 不在放行名单 → 302 → /login.html   ← 回到第二步，死循环
```

**修法**：放行名单**同时包含 `/login` 和 `/login.html`**，并且跳转目标用 canonical 的 `/login`（少一次 308）。

**⚠️ 这个坑 curl 测不出来**——curl 默认不跟随跳转，只会看到那个 302，以为一切正常。
必须用 `curl -L` 或真实浏览器才能暴露：

```bash
curl -s -L --max-redirs 8 -o /dev/null -w "最终 %{http_code}  跳转 %{num_redirects} 次  落点 %{url_effective}\n" \
  https://jinrong-kaoyan.pages.dev/
# 正常应输出：最终 200  跳转 1 次  落点 .../login
```

`tools/test-auth.js` 里也补了对应断言（`/login` 与 `/login.html` 都放行 + 模拟完整跳转链路不循环）。

### ⚠️⚠️⚠️ 第三个坑：`npx wrangler@latest` 会卡住不输出

**症状**：`npx --yes wrangler@latest pages deploy ...` 挂住，日志 0 字节，连 `WRANGLER_LOG=debug` 都没有任何输出，最后超时被杀。看起来像 wrangler 卡了，其实是 **npx 在「检查有没有新版本」这一步就卡住了**（走代理时容易发生）。

**判断方法**：日志文件**完全为空**（连 wrangler 的横幅都没有）→ 问题在 npx，不在 wrangler。

**修法**：绕开 npx，直接用本地缓存里的 wrangler：

```bash
# 先找到缓存路径（npx 之前跑成功过就会留下）
ls -d "$LOCALAPPDATA/npm-cache/_npx/"*/node_modules/wrangler/bin/wrangler.js

# 直接用 node 跑它
node "$LOCALAPPDATA/npm-cache/_npx/<hash>/node_modules/wrangler/bin/wrangler.js" \
  pages deploy . --cwd dist-web --project-name=jinrong-kaoyan --branch=main --commit-dirty=true
```

（用托管 Node 时把 `node` 换成完整路径。）这样输出正常，秒级完成。



### 更新线上内容

```bash
npm run build:web
npx wrangler pages deploy . --cwd dist-web --project-name=jinrong-kaoyan --branch=main --commit-dirty=true
npm run verify:build      # 核验产物与源码一致
```

### 改账号密码

Cloudflare 后台 → Workers & Pages → jinrong-kaoyan → Settings → Variables and Secrets，
改 `USER` / `PASS`；改完建议同时改 `SESSION_SECRET`（让旧会话失效）。改完重新部署一次生效。

也可以用 API 直接改（需要 API 令牌）：

```bash
curl -X PATCH "https://api.cloudflare.com/client/v4/accounts/<AccountID>/pages/projects/jinrong-kaoyan" \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"deployment_configs":{"production":{"env_vars":{"USER":{"value":"新账号"},"PASS":{"value":"新密码"}}}}}'
```

### 其他用法（不受影响）

- **桌面应用**：桌面快捷方式「金融考研择校通」，功能最全（多了「导入备份」「打开数据文件夹」）
- **离线单文件**：`dist-web/index.html` 双击即可用，不需要服务器（登录只对线上生效）

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
