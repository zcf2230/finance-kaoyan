/**
 * 网页版（浏览器模式）回归测试
 *
 * 用法：node tools/test-web-mode.js
 *
 * 与 test-renderer.js 的区别：那边 mock 了 window.api（走 Electron 路径），
 * 这边**不提供 window.api**，逼 app.js 走浏览器兜底（fetch ../data/*.json + localStorage），
 * 正是网站上线后访客走的路径。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'renderer', 'index.html'), 'utf-8');
const dom = new JSDOM(html, {
  url: 'http://example.com/renderer/index.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;

// 浏览器模式靠 fetch 读同级的 ../data/*.json，这里接到真实文件上
window.fetch = async (u) => {
  const file = path.resolve(path.join(ROOT, 'renderer'), String(u));
  if (!fs.existsSync(file)) throw new Error('404 ' + u);
  const text = fs.readFileSync(file, 'utf-8');
  return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) };
};

// 注意：必须去掉 'use strict'，否则 eval 里的函数声明不会挂到 window 上
const appCode = fs.readFileSync(path.join(ROOT, 'renderer', 'app.js'), 'utf-8').replace("'use strict';", '');
window.eval(appCode);

const results = [];
const check = (name, cond) => results.push([cond ? 'PASS' : 'FAIL', name]);

const expectTotal = [1, 2, 3, 4]
  .flatMap(i => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `batch${i}.json`), 'utf-8'))).length;

(async () => {
  await new Promise(r => setTimeout(r, 600));

  // 注意：app.js 顶层的 let DATA / const WEB_MODE 在 eval 作用域里，不会挂到 window 上，
  // 所以这里断言"可观测的等价事实"——能渲染出数据就说明 fetch 兜底生效了。
  check('测试环境确实没有 window.api（强制走浏览器兜底）', typeof window.api === 'undefined');
  check(`渲染出 ${expectTotal} 所院校（即 fetch 兜底生效）`, window.document.querySelectorAll('.school').length === expectTotal);
  check('渲染出 31 个省份分组', window.document.querySelectorAll('.prov-head').length === 31);
  check('页面无 undefined / NaN', !/undefined|NaN/.test(window.document.body.textContent));
  check('body 已加 web-mode 类（说明 WEB_MODE 判定为真）', window.document.body.classList.contains('web-mode'));
  check('数据已缓存进 localStorage', !!window.localStorage.getItem('mock-kaoyan-data'));

  // 桌面应用专属按钮必须在网页版隐藏（靠 .web-hide + body.web-mode 的 CSS 规则）
  for (const id of ['btnImport', 'btnOpenDir']) {
    const el = window.document.querySelector('#' + id);
    check(`「${el.textContent.trim()}」按钮带 web-hide 类（网页版隐藏）`, el.classList.contains('web-hide'));
  }
  check('「导出备份」在网页版保留', !window.document.querySelector('#btnExport').classList.contains('web-hide'));
  check('存在网页版专属提示文案', !!window.document.querySelector('.web-only'));

  // 网页版必须能真正用起来：详情、筛选、对比
  window.openDetail('renda');
  const d = window.document.querySelector('#detailModal').textContent;
  check('网页版详情弹窗可打开且有内容', d.includes('中国人民大学') && d.includes('金融专硕'));
  window.closeModal('detailMask');

  const fm = window.document.querySelector('#fMath');
  fm.value = '396'; fm.dispatchEvent(new window.Event('change'));
  check('网页版 396 筛选可用', window.document.querySelectorAll('.school').length > 0);
  fm.value = ''; fm.dispatchEvent(new window.Event('change'));

  window.toggleCmp('renda'); window.toggleCmp('shangcai');
  check('网页版对比浮条可用', window.document.querySelector('#compareBar').style.display !== 'none');

  // 网页版的"编辑"只写本地 localStorage，不能影响别处
  const before = JSON.parse(window.localStorage.getItem('mock-kaoyan-data')).schools.length;
  window.openEditor('renda');
  window.document.querySelector('[data-p="z"][data-k="e"]').value = '网页版测试写入';
  window.saveEditor('renda');
  const after = JSON.parse(window.localStorage.getItem('mock-kaoyan-data')).schools.length;
  check('网页版编辑只改 localStorage，不增删院校', before === after);
  check('网页版编辑内容已落 localStorage',
    JSON.parse(window.localStorage.getItem('mock-kaoyan-data')).schools.find(s => s.id === 'renda').z.e === '网页版测试写入');

  const fails = results.filter(r => r[0] === 'FAIL');
  for (const [s, n] of results) console.log(s, '-', n);
  console.log(fails.length ? `\n${fails.length} 项失败` : '\n全部通过 ✔');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(2); });
