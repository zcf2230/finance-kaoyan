#!/usr/bin/env node
/**
 * 把 data/*.json 内联进 v2 预览模板，产出单文件 HTML。
 *
 *   node tools/build-preview.js
 *   → preview/金融考研择校通-v2预览.html
 *
 * 为什么单独做一个：大改版要在不改动 renderer/ 的前提下先给用户看效果，
 * 单文件双击即可打开（file:// 下也能跑，无需 fetch）。
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const national = read('data/national.json');
const schools = [1, 2, 3, 4].flatMap(i => read(`data/batch${i}.json`));
const pkg = read('package.json');

const data = { version: 'v' + pkg.version, national, schools };
const tpl = fs.readFileSync(path.join(root, 'preview/_template.html'), 'utf8');

// JSON 直接嵌进 <script>，转义 </script> 与 U+2028/2029，避免提前闭合或语法错误
const json = JSON.stringify(data)
  .replace(/<\/script/gi, '<\\/script')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const out = tpl.replace('__DATA_JSON__', () => json);
const outPath = path.join(root, 'preview', '金融考研择校通-v2预览.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out, 'utf8');

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(0);
console.log(`✓ ${path.relative(root, outPath)}  ${schools.length} 所院校 · ${kb} KB`);
