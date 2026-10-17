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

  // 4b. 数三筛选 —— 这里曾经有个从 v1.0.0 起就存在的严重 bug：
  //     判据写成 m.includes('数三')，但值是「303数学三」（数+学+三），不含连续子串「数三」，
  //     导致「考数学三」筛选命中 0 所（应为 113 所）。必须守住这条断言。
  window.document.querySelector('#fMath').value = '数三';
  window.document.querySelector('#fMath').dispatchEvent(new window.Event('change'));
  const mMath3 = [...window.document.querySelectorAll('.school-name')].map(e => e.textContent);
  check('「考数学三」筛选有结果（曾错误地命中 0 所）', mMath3.length > 50);
  check('数三筛选含清华/北大', ['清华大学', '北京大学'].every(n => mMath3.includes(n)));
  check('数三筛选不含人大（人大专硕考 396）', !mMath3.includes('中国人民大学'));

  // 4b-2. 复合值「数三或396（分学院）」应该两个筛选都能命中
  //       （当前数据里没有这种值，所以临时造一所来守这条规则）
  window.openEditor(null);
  const compId = 'test-comp-' + Date.now();
  window.document.querySelector('#eName').value = '测试复合数学';
  window.document.querySelector('[data-p="z"][data-k="m"]').value = '数三或396（分学院）';
  window.saveEditor(compId);
  for (const [val, label] of [['数三', '考数学三'], ['396', '考396']]) {
    window.document.querySelector('#fMath').value = val;
    window.document.querySelector('#fMath').dispatchEvent(new window.Event('change'));
    const names = [...window.document.querySelectorAll('.school-name')].map(e => e.textContent);
    check(`复合值「数三或396（分学院）」能被「${label}」筛选命中`, names.includes('测试复合数学'));
  }
  window.document.querySelector('#fMath').value = '';
  window.document.querySelector('#fMath').dispatchEvent(new window.Event('change'));

  // 4c. PDF/官方公告里补的数据要守住
  const hb = schools.find(s => s.name === '华北电力大学');
  check('华北电力大学已补 2026 专硕复试线 356', !!hb && hb.z.l && hb.z.l['2026'] === 356);
  check('华北电力大学已补 2026 学硕复试线 351', !!hb && hb.x && hb.x.l && hb.x.l['2026'] === 351);
  const bs = schools.find(s => s.name === '北京师范大学');
  check('北京师范大学学费已补（7万/全程）', !!bs && bs.z.f === '7万/全程');
  const hd = schools.find(s => s.name === '华东师范大学');
  check('华东师范大学初试数学已更正为 396', !!hd && hd.z.m === '396经济类综合');

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
  check('对比弹窗含五维雷达图', !!window.document.querySelector('#compareModal svg polygon') && cmp.includes('上岸友好') && cmp.includes('学费友好'));
  window.closeModal('compareMask');

  // 8. 国家线
  window.document.querySelector('.nav-btn[data-view="national"]').click();
  check('国家线表含 2026/324', window.document.querySelector('#nationalTable').textContent.includes('324'));

  // 9. 编辑器：添加新院校
  window.document.querySelector('.nav-btn[data-view="manage"]').click();
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

  // 11. 分数匹配
  const $sel = s => window.document.querySelector(s);
  window.document.querySelector('.nav-btn[data-view="query"]').click();
  $sel('#fSort').value = 'default'; $sel('#fSort').dispatchEvent(new window.Event('change'));
  $sel('#fScore').value = '370';
  $sel('#fScore').dispatchEvent(new window.Event('input'));
  check('填预估分后出现冲/稳/保标注', window.document.querySelectorAll('#results .match-badge').length > 0);
  check('排序自动切到「按分差」', $sel('#fSort').value === 'diff');
  const firstBadge = window.document.querySelector('.school .match-badge');
  check('按分差排序时首条是保底或稳妥', !!firstBadge && /保底|稳妥/.test(firstBadge.textContent));

  const fitBox = $sel('#fFit');
  fitBox.checked = true; fitBox.dispatchEvent(new window.Event('change'));
  const fitCnt = window.document.querySelectorAll('.school').length;
  check('「只看能上的」能过滤', fitCnt > 0 && fitCnt < TOTAL);
  fitBox.checked = false; fitBox.dispatchEvent(new window.Event('change'));

  $sel('#btnClearScore').click();
  // 注意：只能数 #results 里的标注——「使用说明」页里放了 4 个示例标注，会干扰计数
  check('清除预估分后标注消失', window.document.querySelectorAll('#results .match-badge').length === 0);
  check('清除后排序回到默认', $sel('#fSort').value === 'default');

  // 12. 资料完整度筛选
  $sel('#fComplete').value = 'line'; $sel('#fComplete').dispatchEvent(new window.Event('change'));
  const lineCnt = window.document.querySelectorAll('.school').length;
  check('「有精确复试线」筛选生效', lineCnt > 0 && lineCnt < TOTAL);
  $sel('#fComplete').value = ''; $sel('#fComplete').dispatchEvent(new window.Event('change'));

  // 13. 学费排序按「全程折算」，不能拿「元/年」和「万/全程」直接比大小
  $sel('#fSort').value = 'fee'; $sel('#fSort').dispatchEvent(new window.Event('change'));
  const feeFirst = window.document.querySelector('.school-name').textContent;
  const expectFirst = schools
    .map(s => ({ n: s.name, w: window.feeTotalWan(s.z || {}) }))
    .filter(x => isFinite(x.w)).sort((a, b) => a.w - b.w)[0].n;
  check('学费排序与「全程折算」算法一致', feeFirst === expectFirst);
  // 直接证明修复有效：按口径折算后的第一名，和「只比数字」的旧算法结果必须不同
  const rawFirst = schools
    .map(s => ({ n: s.name, w: window.parseFeeWan((s.z || {}).f) }))
    .filter(x => isFinite(x.w)).sort((a, b) => a.w - b.w)[0].n;
  check('学费排序已按口径折算（与只比数字的旧算法结果不同）', feeFirst !== rawFirst);

  // 14. 详情弹窗的改进
  window.openDetail('renda');
  const d2 = window.document.querySelector('#detailModal').textContent;
  check('来源链接不再显示「来源 1」这种无意义标签', !/来源 1/.test(d2));
  check('详情弹窗不再重复长句提示报名人数', !/多数院校不公布/.test(d2));
  window.closeModal('detailMask');

  const nofin = schools.filter(s => s.noFinance);
  check('存在「未查到金融硕士招生」的院校标记', nofin.length > 0);
  if (nofin.length) {
    window.openDetail(nofin[0].id);
    check('未招生院校的详情页有明确警示', /未在 2026 年招生专业目录中找到/.test(window.document.querySelector('#detailModal').textContent));
    window.closeModal('detailMask');
  }

  // 15. 管理页搜索
  window.document.querySelector('.nav-btn[data-view="manage"]').click();
  const ms = $sel('#mSearch');
  ms.value = '财经'; ms.dispatchEvent(new window.Event('input'));
  const mRows = window.document.querySelectorAll('#manageTable tbody tr').length;
  check('管理页搜索可用', mRows > 0 && mRows < TOTAL);
  check('管理页显示匹配计数', /匹配/.test($sel('#mCount').textContent));
  ms.value = ''; ms.dispatchEvent(new window.Event('input'));
  // 前面「编辑器新增院校」已经往数据里加了一所，所以这里比对当前条数而不是初始 TOTAL
  check('清空搜索后恢复全部', window.document.querySelectorAll('#manageTable tbody tr').length === schools.length);

  // 16. 对比表：全空行不渲染 + 可导出 CSV
  window.document.querySelector('.nav-btn[data-view="query"]').click();
  window.toggleCmp('renda'); window.toggleCmp('yangcai');
  window.openCompare();
  const cmpTxt = window.document.querySelector('#compareModal').textContent;
  check('对比表含「导出 CSV」按钮', cmpTxt.includes('导出 CSV'));
  check('对比表含「打印 / 存 PDF」按钮', cmpTxt.includes('打印'));
  const cmpRows = window.document.querySelectorAll('#compareModal .cmp-table tbody tr').length;
  check('对比表隐藏了全空行（行数少于字段总数 12）', cmpRows < 12 && cmpRows > 3);
  window.closeModal('compareMask');

  // 17. 排序（复试线高→低）
  window.document.querySelector('#fSort').value = 'line';
  window.document.querySelector('#fSort').dispatchEvent(new window.Event('change'));
  const firstName = window.document.querySelector('.school-name').textContent;
  check('按复试线排序第一名是南京大学或清华大学', ['南京大学', '清华大学'].includes(firstName));

  // 18. parseCount 单元用例
  //     背景：这些字段是自由文本，旧实现直接取第一个数字，实测 81 条里 80 条取到的是**年份**
  //     （「2026年统考招生计划36人」→ 2026），导致「录取人数」排序等于没排、报录比算错。
  const pc = window.parseCount;
  const pcCases = [
    ['2026年统考招生计划36人（原目录公布35人，复试阶段调整为36）', 36, '年份在前'],
    ['2026年经济学院应用经济学：报名64人、达国家线24人、推免5人、录取14人', 14, '推免数字在前'],
    ['2026年国际商学院025100金融全日制招生计划23人（含已录取推免3人），复试人数24人', 23, '推免干扰'],
    ['2026年财经学院金融专硕全日制统考报考24人、录取10人', 10, '报考人数在前'],
    ['2025年安泰金融专硕入围复试29人、拟录取21人（最高391、最低340）', 21, '复试人数在前'],
    ['2026年一志愿进入复试最低357分、最高415分；拟录取34人，另列15名候补', 34, '含分数干扰'],
    ['020204金融学2026年计划招生25人（已接收推免12人），等额复试', 25, '专业代码干扰'],
    ['2026年统考报名487人', 487, '报名人数'],
    ['待核实', null, '无数字'],
    ['2026年推免拟录取10人', null, '全是推免']
  ];
  for (const [txt, exp, label] of pcCases) {
    check(`parseCount：${label}`, pc(txt) === exp);
  }

  // 19. parseLineVal 单元用例
  //     两个坑：① 多年数据用 Math.max 会导致「卡片显示最新年、排序按最高年」不一致；
  //             ② 约数里带年份（「国家线（2026年A类324）」）直接取 3 位数会拿到 202。
  const pl = window.parseLineVal;
  const plCases = [
    [{ l: { 2025: 333, 2026: 324 } }, 324, '多年数据取最新年'],
    [{ l: { 2025: 365, 2026: 380 } }, 380, '多年数据取最新年（2）'],
    [{ la: '国家线（2026年A类324）' }, 324, '剥掉年份'],
    [{ la: '按B类地区分数线执行（2026年B区国家线314）' }, 314, '剥掉年份（B区）'],
    [{ la: 'B区国家线附近（2026年B区国家线314）' }, 314, '剥掉年份（B区附近）'],
    [{ la: '360-380' }, 360, '区间取第一个'],
    [{ la: '390+' }, 390, '带加号'],
    [{ la: '国家线附近' }, null, '纯中文返回 null'],
    [{ la: '国家线-350' }, 350, '带国家线前缀'],
    [{}, null, '空对象']
  ];
  for (const [p, exp, label] of plCases) {
    check(`parseLineVal：${label}`, pl(p) === exp);
  }

  // 18. 收藏夹独立页
  window.toggleFav({ stopPropagation() {} }, 'renda');
  window.document.querySelector('.nav-btn[data-view="fav"]').click();
  const favTxt = window.document.querySelector('#favResults').textContent;
  check('收藏页显示已收藏院校', favTxt.includes('中国人民大学'));
  check('收藏页显示计数', /共 1 所/.test(window.document.querySelector('#favCount').textContent));
  window.toggleFav({ stopPropagation() {} }, 'renda');
  window.document.querySelector('.nav-btn[data-view="fav"]').click();
  check('取消收藏后收藏页为空态', /还没有收藏/.test(window.document.querySelector('#favResults').textContent));
  window.toggleFav({ stopPropagation() {} }, 'renda'); // 留一条给报告测试用

  // 19. 备考时间线
  window.document.querySelector('.nav-btn[data-view="timeline"]').click();
  check('时间线渲染 8 个节点', window.document.querySelectorAll('#timelineBox .tl-item').length === 8);
  check('时间线标记当前阶段', !!window.document.querySelector('#timelineBox .tl-item.now'));
  check('数据更新状态表含年份统计', /2026/.test(window.document.querySelector('#yearStat').textContent));

  // 20. 手动主题切换
  const themeBtn = window.document.querySelector('#btnTheme');
  const themeOf = () => window.document.documentElement.getAttribute('data-theme');
  themeBtn.click();
  check('主题切换：跟随系统 → 浅色', themeOf() === 'light');
  themeBtn.click();
  check('主题切换：浅色 → 深色', themeOf() === 'dark');
  themeBtn.click();
  check('主题切换：深色 → 跟随系统', /跟随系统/.test(themeBtn.textContent));

  // 21. 择校报告
  $sel('#fScore').value = '370';
  $sel('#fScore').dispatchEvent(new window.Event('input'));
  window.document.querySelector('.nav-btn[data-view="query"]').click();
  window.document.querySelector('#btnReport').click();
  const rep = window.document.querySelector('#report').textContent;
  check('报告含标题与筛选条件', rep.includes('金融考研择校报告') && rep.includes('预估总分 370'));
  check('报告按保底/稳妥/冲刺分组', rep.includes('保底') && rep.includes('冲刺'));
  check('报告含已收藏院校', rep.includes('已收藏院校'));
  check('报告含数据免责声明', rep.includes('不构成报考建议'));

  const fails = results.filter(r => r[0] === 'FAIL');
  for (const [s, n] of results) console.log(s, '-', n);
  console.log(fails.length ? `\n${fails.length} 项失败` : '\n全部通过 ✔');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(2); });
