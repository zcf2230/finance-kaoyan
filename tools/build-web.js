/**
 * 打包网页版静态站点到 dist-web/
 *
 * 用法：node tools/build-web.js
 *
 * 输出**单文件版**：把 CSS、JS、数据全部内联进一个 index.html。
 *
 * 为什么是单文件：面向国内的境外托管（Cloudflare Pages 等）带宽不是瓶颈
 * （整站压缩后仅 ~46 KB），**延迟才是**——首屏原本要 9 个请求
 * （跳转页 → 页面 → JS/CSS → 5 个 JSON），每个都要绕到境外节点。
 * 内联后只剩 1 个请求，省掉 3 个来回。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-web');

// 让 GitHub Pages 跳过 Jekyll 处理；_headers 给 Netlify / Cloudflare Pages 用
const EXTRAS = {
  // 站点已加登录鉴权，属于私有内容：禁止收录、禁止共享缓存（避免 CDN 把页面发给未登录的人）
  '_headers': `/*
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/index.html
  Cache-Control: private, max-age=300, must-revalidate

/login.html
  Cache-Control: no-store
`,
  'robots.txt': `User-agent: *
Disallow: /
`,
  '.nojekyll': ''
};

function readData() {
  const national = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'national.json'), 'utf-8'));
  const schools = [1, 2, 3, 4]
    .flatMap(i => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `batch${i}.json`), 'utf-8')));
  return { version: 1, national, schools };
}

function buildSingleFile(data) {
  let html = fs.readFileSync(path.join(ROOT, 'renderer', 'index.html'), 'utf-8');
  const css = fs.readFileSync(path.join(ROOT, 'renderer', 'styles.css'), 'utf-8');
  const js = fs.readFileSync(path.join(ROOT, 'renderer', 'app.js'), 'utf-8');

  // JSON 里的 < 转义，避免出现 </script> 提前闭合脚本
  const dataJson = JSON.stringify(data).replace(/</g, '\\u003c');

  const linkTag = '<link rel="stylesheet" href="styles.css">';
  const scriptTag = '<script src="app.js"></script>';
  if (!html.includes(linkTag) || !html.includes(scriptTag)) {
    throw new Error('renderer/index.html 结构变了，找不到 styles.css / app.js 引用，请同步更新 build-web.js');
  }

  html = html
    .replace(linkTag, `<style>\n${css}\n</style>`)
    .replace(scriptTag, [
      `<script>window.__KAOYAN_DATA__=${dataJson};</script>`,
      `<script>\n${js.replace(/<\/script>/gi, '<\\/script>')}\n</script>`
    ].join('\n'));

  return html;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const data = readData();
  const html = buildSingleFile(data);
  fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf-8');
  for (const [name, content] of Object.entries(EXTRAS)) {
    fs.writeFileSync(path.join(OUT, name), content, 'utf-8');
  }

  // 登录页（自带样式，响应式）
  fs.copyFileSync(path.join(ROOT, 'renderer', 'login.html'), path.join(OUT, 'login.html'));

  // Cloudflare Pages Functions（服务端鉴权）。本地双击打开时用不到，部署后生效。
  const fnSrc = path.join(ROOT, 'cloudflare', 'functions');
  if (fs.existsSync(fnSrc)) copyDir(fnSrc, path.join(OUT, 'functions'));
  else console.warn('⚠️ 未找到 cloudflare/functions，部署后将没有登录鉴权');

  const raw = Buffer.byteLength(html, 'utf-8');
  const br = zlib.brotliCompressSync(Buffer.from(html, 'utf-8')).length;
  console.log(`已生成 ${path.relative(ROOT, OUT)}/`);
  console.log(`  index.html   ${(raw / 1024).toFixed(1)} KB（brotli 压缩后 ${(br / 1024).toFixed(1)} KB）`);
  console.log(`  login.html   登录页`);
  console.log(`  functions/   服务端鉴权（_middleware + api/login + api/logout）`);
  console.log(`  _headers / robots.txt / .nojekyll`);
  console.log(`  首屏请求数：1（原多文件版为 9）`);

  // 自检：内联数据必须完整
  const schools = data.schools;
  const provs = new Set(schools.map(s => s.prov));
  const withLine = schools.filter(s => ['z', 'x'].some(k => s[k] && s[k].l && Object.keys(s[k].l).length));
  console.log(`数据自检：${schools.length} 所院校 / ${provs.size} 个省市 / ${withLine.length} 所含精确复试线`);
  if (schools.length === 0 || provs.size !== 31) {
    console.error('❌ 数据自检未通过');
    process.exit(1);
  }
  if (!html.includes('window.__KAOYAN_DATA__=')) {
    console.error('❌ 数据未成功内联');
    process.exit(1);
  }
}

main();
