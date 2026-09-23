/**
 * 打包网页版静态站点到 dist-web/
 *
 * 用法：node tools/build-web.js
 *
 * 只输出网站真正需要的文件（约 250 KB / 9 个文件）：
 *   index.html + renderer/(3) + data/(5)
 * Electron 相关的 main.js / preload.js / package.json / tools/ 都不需要。
 *
 * 所有引用都是相对路径，所以放在域名根目录或子目录（如 GitHub Pages 的 /repo/）都能正常工作。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-web');

// 附加文件：不同托管平台需要的配置
const EXTRAS = {
  // Netlify / Cloudflare Pages 支持的响应头配置
  '_headers': `# 数据文件更新后要尽快生效，缓存设短一点
/data/*
  Cache-Control: public, max-age=600, must-revalidate

/renderer/*
  Cache-Control: public, max-age=3600

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`,
  'robots.txt': `User-agent: *
Allow: /
`,
  // 让 GitHub Pages 跳过 Jekyll 处理
  '.nojekyll': ''
};

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

  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(OUT, 'index.html'));
  copyDir(path.join(ROOT, 'renderer'), path.join(OUT, 'renderer'));
  copyDir(path.join(ROOT, 'data'), path.join(OUT, 'data'));
  for (const [name, content] of Object.entries(EXTRAS)) {
    fs.writeFileSync(path.join(OUT, name), content, 'utf-8');
  }

  // 统计
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
  const files = walk(OUT);
  const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);

  console.log(`已生成 ${path.relative(ROOT, OUT)}/`);
  for (const f of files) {
    console.log(`  ${String(fs.statSync(f).size).padStart(7)} B  ${path.relative(OUT, f).replace(/\\/g, '/')}`);
  }
  console.log(`共 ${files.length} 个文件，${(bytes / 1024).toFixed(1)} KB`);

  // 数据自检：确保院校数、字段没在打包环节丢
  const schools = [1, 2, 3, 4]
    .flatMap(i => JSON.parse(fs.readFileSync(path.join(OUT, 'data', `batch${i}.json`), 'utf-8')));
  const provs = new Set(schools.map(s => s.prov));
  const withLine = schools.filter(s => ['z', 'x'].some(k => s[k] && s[k].l && Object.keys(s[k].l).length));
  console.log(`数据自检：${schools.length} 所院校 / ${provs.size} 个省市 / ${withLine.length} 所含精确复试线`);
  if (schools.length === 0 || provs.size !== 31) {
    console.error('❌ 数据自检未通过');
    process.exit(1);
  }
}

main();
