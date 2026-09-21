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

const TOTAL = schools.length;   // 由数据文件动态决定，避免每次加院校都要改测试
const PROV_CNT = new Set(schools.map(s => s.prov)).size;
const WITH_LINE = schools.filter(s => ['z', 'x'].some(k => s[k] && s[k].l && Object.keys(s[k].l).length)).length;

(async () => {
  await new Promise(r => setTimeout(r, 300));

  // 1. 列表渲染
  check(`初始渲染出 ${TOTAL} 所院校卡片`, window.document.querySelectorAll('.school').length === TOTAL);
  check(`侧栏统计 ${TOTAL}/${PROV_CNT} 省市`, window.document.querySelector('#statLine').textContent.includes(String(TOTAL)));
  check('覆盖全部 31 个省市', PROV_CNT === 31);

  // 2. 数据完整性（防止误改数据导致字段丢失）
  check('含精确复试线的院校 ≥100 所', WITH_LINE >= 100);
  check('每所院校都有专业数据', schools.every(s => s.z || s.x));
  check('无重复 id', new Set(schools.map(s => s.id)).size === TOTAL);

  // 3. 搜索
  window.document.querySelector('#fSearch').value = '财经';
  window.document.querySelector('#fSearch').dispatchEvent(new window.Event('input'));
  const searchCnt = window.document.querySelectorAll('.school').length;
  check('搜索"财经"命中（≥15 所）', searchCnt >= 15);

  // 4. 396 筛选
  window.document.querySelector('#fSearch').value = '';
  window.document.querySelector('#fMath').value = '396';
  window.document.querySelector('#fMath').dispatchEvent(new window.Event('change'));
  const m396 = [...window.document.querySelectorAll('.school-name')].map(e => e.textContent);
  check('396 筛选含人大/央财/贸大', ['中国人民大学', '中央财经大学', '对外经济贸易大学'].every(n => m396.includes(n)));
  check('396 筛选不含清华', !m396.includes('清华大学'));

  // 5. 详情弹窗
  window.document.querySelector('#fMath').value = '';
  window.document.querySelector('#fMath').dispatchEvent(new window.Event('change'));
  window.openDetail('renda');
  const detail = window.document.querySelector('#detailModal').textContent;
  check('人大详情含金融专硕/396/431', detail.includes('金融专硕') && detail.includes('396') && detail.includes('431'));
  check('人大详情含 2026 年复试线', detail.includes('2026'));
  check('详情展示数据核实来源', detail.includes('数据核实来源'));
  window.closeModal('detailMask');

  // 6. 收藏
  window.toggleFav({ stopPropagation() {} }, 'sjm');
  check('收藏后写入 localStorage', (window.localStorage.getItem('fav') || '').includes('sjm'));

  // 7. 对比
  window.toggleCmp('renda'); window.toggleCmp('yangcai'); window.toggleCmp('shangcai');
  check('对比浮条显示 3 所', window.document.querySelector('#compareList').textContent.includes('中央财经大学'));
  window.openCompare();
  const cmp = window.document.querySelector('#compareModal').textContent;
  check('对比表含三校与复试线', cmp.includes('中国人民大学') && cmp.includes('上海财经大学') && cmp.includes('复试线'));
  check('对比表含就业/口碑行', cmp.includes('就业'));
  window.closeModal('compareMask');

  // 8. 国家线
  window.document.querySelectorAll('.nav-btn')[1].click();
  check('国家线表含 2026/324', window.document.querySelector('#nationalTable').textContent.includes('324'));

  // 9. 编辑器：添加新院校
  window.document.querySelectorAll('.nav-btn')[2].click();
  window.openEditor(null);
  const newId = 'test-' + Date.now();
  window.document.querySelector('#eName').value = '测试大学';
  window.document.querySelector('[data-p="z"][data-k="m"]').value = '396经济类综合';
  window.document.querySelector('[data-p="z"][data-k="l_2026"]').value = '355';
  check('编辑器含参考书目输入框', !!window.document.querySelector('[data-p="z"][data-k="bk"]'));
  check('编辑器含就业方向输入框', !!window.document.querySelector('[data-p="z"][data-k="emp"]'));
  check('编辑器含 2027 年复试线输入框（跨年预留）', !!window.document.querySelector('[data-p="z"][data-k="l_2027"]'));
  window.document.querySelector('[data-p="z"][data-k="bk"]').value = '《公司理财》罗斯';
  window.saveEditor(newId);
  const added = schools.find(s => s.name === '测试大学');
  check('编辑器新增院校并持久化', !!added && added.z.m === '396经济类综合' && added.z.l['2026'] === 355);
  check('编辑器保存参考书目字段', !!added && added.z.bk === '《公司理财》罗斯');

  // 10. 编辑已有院校
  window.openEditor('renda');
  window.document.querySelector('[data-p="z"][data-k="e"]').value = '2026年录取约72人';
  window.saveEditor('renda');
  const rd = schools.find(s => s.id === 'renda');
  check('编辑已有院校录取人数字段', (rd.z.e || '').includes('72'));

  // 11. 排序（复试线高→低）
  window.document.querySelectorAll('.nav-btn')[0].click();
  window.document.querySelector('#fSort').value = 'line';
  window.document.querySelector('#fSort').dispatchEvent(new window.Event('change'));
  const firstName = window.document.querySelector('.school-name').textContent;
  check('按复试线排序第一名是南京大学或清华大学', ['南京大学', '清华大学'].includes(firstName));

  const fails = results.filter(r => r[0] === 'FAIL');
  for (const [s, n] of results) console.log(s, '-', n);
  console.log(fails.length ? `\n${fails.length} 项失败` : '\n全部通过 ✔');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(2); });
