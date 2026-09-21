/* 渲染逻辑功能测试（jsdom） */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf-8');
const dom = new JSDOM(html, { url: 'http://localhost/renderer/index.html', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

// mock localStorage / api
const store = {};
window.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
const national = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'national.json'), 'utf-8'));
let schools = [].concat(
  ...[1, 2, 3, 4].map(i => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'batch' + i + '.json'), 'utf-8')))
);
window.api = {
  loadData: async () => ({ version: 1, national, schools }),
  saveData: async d => { schools = d.schools; return true; },
  resetData: async () => ({ version: 1, national, schools }),
  exportData: async () => 'ok', importData: async () => null, openDataDir: async () => {}
};

const appCode = fs.readFileSync(path.join(__dirname, 'renderer', 'app.js'), 'utf-8').replace("'use strict';", '');
window.eval(appCode);

const results = [];
const check = (name, cond) => { results.push([cond ? 'PASS' : 'FAIL', name]); };

(async () => {
  await new Promise(r => setTimeout(r, 300));

  // 1. 列表渲染
  check('初始渲染出 126 所院校卡片', window.document.querySelectorAll('.school').length === 126);
  check('侧栏统计 126/31 省市', window.document.querySelector('#statLine').textContent.includes('126'));

  // 2. 搜索
  window.document.querySelector('#fSearch').value = '财经';
  window.document.querySelector('#fSearch').dispatchEvent(new window.Event('input'));
  const searchCnt = window.document.querySelectorAll('.school').length;
  check('搜索"财经"命中（≥15 所）', searchCnt >= 15);

  // 3. 396 筛选
  window.document.querySelector('#fSearch').value = '';
  window.document.querySelector('#fMath').value = '396';
  window.document.querySelector('#fMath').dispatchEvent(new window.Event('change'));
  const m396 = [...window.document.querySelectorAll('.school-name')].map(e => e.textContent);
  check('396 筛选含人大/央财/贸大', ['中国人民大学', '中央财经大学', '对外经济贸易大学'].every(n => m396.includes(n)));
  check('396 筛选不含清华', !m396.includes('清华大学'));

  // 4. 详情弹窗
  window.document.querySelector('#fMath').value = '';
  window.document.querySelector('#fMath').dispatchEvent(new window.Event('change'));
  window.openDetail('renda');
  const detail = window.document.querySelector('#detailModal').textContent;
  check('人大详情含金融专硕/396/431', detail.includes('金融专硕') && detail.includes('396') && detail.includes('431'));
  window.closeModal('detailMask');

  // 5. 收藏
  window.toggleFav({ stopPropagation() {} }, 'sjm');
  check('收藏后写入 localStorage', (window.localStorage.getItem('fav') || '').includes('sjm'));

  // 6. 对比
  window.toggleCmp('renda'); window.toggleCmp('yangcai'); window.toggleCmp('shangcai');
  check('对比浮条显示 3 所', window.document.querySelector('#compareList').textContent.includes('中央财经大学'));
  window.openCompare();
  const cmp = window.document.querySelector('#compareModal').textContent;
  check('对比表含三校与复试线', cmp.includes('中国人民大学') && cmp.includes('上海财经大学') && cmp.includes('复试线'));

  // 7. 国家线
  window.document.querySelectorAll('.nav-btn')[1].click();
  check('国家线表含 2026/324', window.document.querySelector('#nationalTable').textContent.includes('324'));

  // 8. 编辑器：添加新院校
  window.document.querySelectorAll('.nav-btn')[2].click();
  window.openEditor(null);
  const newId = 'test-' + Date.now();
  window.document.querySelector('#eName').value = '测试大学';
  window.document.querySelector('[data-p="z"][data-k="m"]').value = '396经济类综合';
  window.document.querySelector('[data-p="z"][data-k="l_2025"]').value = '355';
  window.saveEditor(newId);
  const added = schools.find(s => s.name === '测试大学');
  check('编辑器新增院校并持久化', !!added && added.z.m === '396经济类综合' && added.z.l['2025'] === 355);

  // 9. 编辑已有院校
  window.openEditor('renda');
  window.document.querySelector('[data-p="z"][data-k="e"]').value = '2024年录取约90人';
  window.saveEditor('renda');
  const rd = schools.find(s => s.id === 'renda');
  check('编辑已有院校录取人数字段', (rd.z.e || '').includes('90'));

  // 10. 排序（复试线高→低）
  window.document.querySelectorAll('.nav-btn')[0].click();
  window.document.querySelector('#fSort').value = 'line';
  window.document.querySelector('#fSort').dispatchEvent(new window.Event('change'));
  const firstName = window.document.querySelector('.school-name').textContent;
  check('按复试线排序第一名是清华或北大', ['清华大学', '北京大学'].includes(firstName));

  const fails = results.filter(r => r[0] === 'FAIL');
  for (const [s, n] of results) console.log(s, '-', n);
  console.log(fails.length ? `\n${fails.length} 项失败` : '\n全部通过 ✔');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(2); });
