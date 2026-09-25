/* 金融考研择校通 - 渲染进程逻辑 */
'use strict';

const PROVS = ["北京","天津","河北","山西","内蒙古","辽宁","吉林","黑龙江","上海","江苏","浙江","安徽","福建","江西","山东","河南","湖北","湖南","广东","广西","海南","重庆","四川","贵州","云南","西藏","陕西","甘肃","青海","宁夏","新疆"];
// 年份降序：第一项是"当前招生年度"。每年 9-10 月新简章发布后，在这里加一个新年份、删掉最老的即可。
const YEARS = [2027, 2026, 2025, 2024];
const ALL_TAGS = ["985", "211", "双一流", "财经类", "自划线"];
// 没有 Electron 桥 = 跑在浏览器里（网页版）。数据改在浏览器 localStorage，只对自己生效。
const WEB_MODE = !window.api;

let DATA = null;               // {national, schools}
let FAV = new Set(JSON.parse(localStorage.getItem('fav') || '[]'));
let CMP = [];                  // 待对比院校 id
let VIEW = 'query';
let SCORE = null;              // 分数匹配：用户输入的预估总分

/* ---------- 兼容浏览器调试（无 Electron 环境时用 fetch + localStorage 模拟） ---------- */
function getApi() {
  if (window.api) return window.api;
  const KEY = 'mock-kaoyan-data';
  const seed = async () => {
    // 单文件版（tools/build-web.js 生成）会把整份数据内联到 window.__KAOYAN_DATA__，
    // 省掉 5 次网络请求——对境外链路来说，少一次往返比少几 KB 重要得多。
    if (window.__KAOYAN_DATA__) return JSON.parse(JSON.stringify(window.__KAOYAN_DATA__));
    const n = await (await fetch('../data/national.json')).json();
    const parts = await Promise.all([1, 2, 3, 4].map(i => fetch(`../data/batch${i}.json`).then(r => r.json())));
    return { version: 1, national: n, schools: [].concat(...parts) };
  };
  return {
    loadData: async () => {
      const s = localStorage.getItem(KEY);
      if (s) return JSON.parse(s);
      const d = await seed();
      localStorage.setItem(KEY, JSON.stringify(d));
      return d;
    },
    saveData: async d => { localStorage.setItem(KEY, JSON.stringify(d)); return true; },
    resetData: async () => { localStorage.removeItem(KEY); return seed(); },
    exportData: async d => {
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'kaoyan-data-backup.json'; a.click();
      return 'downloaded';
    },
    importData: async () => { alert('导入功能需在桌面应用中使用'); return null; },
    openDataDir: async () => {}
  };
}

/* ---------- 工具 ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byId = id => DATA.schools.find(x => x.id === id);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(t._h);
  t._h = setTimeout(() => t.style.display = 'none', 2200);
}

function saveFav() { localStorage.setItem('fav', JSON.stringify([...FAV])); }

// 从字符串解析“万元”数值（保留原始口径，取第一个数字）
function parseFeeWan(str) {
  if (!str || /待核实|—/.test(str)) return Infinity;
  const m = str.replace(/,/g, '').match(/([\d.]+)/);
  if (!m) return Infinity;
  let n = parseFloat(m[1]);
  if (/万/.test(str.slice(m.index))) return n;
  return n >= 1000 ? n / 10000 : n; // 8000元 → 0.8万
}
function parseYears(d) {
  const m = String(d || '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}
function feeYears(p) { return parseYears((p || {}).d) || 2; }   // 学制缺失按 2 年（专硕主流）估

/**
 * 折算成「全程总额（万元）」再排序。
 * 学费口径有「8000元/年」和「13万/全程」两种，直接比数字会失真
 * （成都理工 7200元/年 会排到 13万/全程 前面）。
 *
 * 三种写法都要处理对：
 *   「10000元/年（全程25000元）」→ 全程有数字，取 2.5 万（不能取到前面的 1 万）
 *   「约15-17万/全程（需核实）」→ 全程在数字后面，取 15 万
 *   「8000元/年」              → 按年，× 学制
 */
function feeTotalWan(p) {
  const f = (p || {}).f;
  if (!f) return Infinity;
  const s = String(f).replace(/,/g, '');
  const toWan = (num, unit) => {
    const n = parseFloat(num);
    if (!isFinite(n) || n <= 0) return null;
    return (unit === '元' || (!unit && n >= 1000)) ? n / 10000 : n;
  };
  if (/全程|总额|合计/.test(s)) {
    // 全程后面直接跟数字的，以那个数字为准
    const after = s.match(/全程[^0-9]{0,6}([0-9.]+)\s*(万|元)?/);
    if (after) { const v = toWan(after[1], after[2]); if (v) return v; }
    // 否则取字符串里第一个数字（如「约15-17万/全程」）
    const first = s.match(/([0-9.]+)\s*(万|元)?/);
    if (first) { const v = toWan(first[1], first[2]); if (v) return v; }
    return Infinity;
  }
  const first = s.match(/([0-9.]+)\s*(万|元)?/);
  if (!first) return Infinity;
  const v = toWan(first[1], first[2]);
  return v ? v * feeYears(p) : Infinity;
}
function feeIsPerYear(p) {
  const f = String((p || {}).f || '');
  return isFinite(parseFeeWan(f)) && !/全程|总额|合计/.test(f);
}
function parseLineVal(p) {
  if (p.l) { const ys = YEARS.map(y => p.l[y]).filter(v => v > 0); if (ys.length) return Math.max(...ys); }
  if (p.la) { const m = String(p.la).match(/(\d{3})/); if (m) return parseInt(m[1]); }
  return null;
}
/**
 * 从「录取人数 / 报名人数」文本里取数字。
 *
 * ⚠️ 不能直接取第一个数字。这些字段是自由文本，实测 81 条里 80 条的首个数字是**年份**，
 * 例如「2026年统考招生计划36人」→ 会解析成 2026。后果：
 *   ·「录取人数 多→少」排序实际按年份排（等于没排）
 *   · 报录比用错数字算出来是假的
 * 还有「020204金融学…计划招生25人」这种，首个数字是专业代码。
 *
 * 策略：只认「数字 + 人/名」这种计人单位（天然排除年份、专业代码、分数），
 * 排除「推免/保研」前面的数（那不算统考录取），再按 录取 > 招生/计划 > 任意 的优先级取。
 */
function parseCount(str) {
  if (!str) return null;
  const s = String(str);
  const cands = [...s.matchAll(/(\d+(?:\.\d+)?)\s*[人名]/g)]
    .map(m => ({
      v: parseFloat(m[1]),
      // 判定「是不是推免数」只看紧邻的 5 个字，否则会把
      // 「推免5人、录取14人」里的 14 也误杀（窗口太宽会连前面的推免一起圈进来）
      near: s.slice(Math.max(0, m.index - 5), m.index),
      before: s.slice(Math.max(0, m.index - 10), m.index)
    }))
    .filter(c => !/推免|保研/.test(c.near));
  if (!cands.length) return null;
  const pick = kws => cands.find(c => kws.some(k => c.before.includes(k)));
  const hit = pick(['录取']) || pick(['招生', '拟招', '计划', '指标']) || cands[0];
  return hit.v;
}
function ratioText(p) {
  const e = parseCount(p.e), a = parseCount(p.a);
  if (e && a && a > 0) return (a / e).toFixed(1) + ' : 1';
  return '—';
}
// 取 URL 的域名，用于把「来源 1」换成用户能看懂的出处
function hostOf(u) {
  try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return String(u).slice(0, 30); }
}
// 一所院校填了几个有效字段（用于「资料完整度」筛选）
function filledCount(s) {
  let n = 0;
  for (const k of ['z', 'x']) {
    const p = s[k]; if (!p) continue;
    for (const f of ['m', 'j', 'f', 'd', 'e', 'a', 'bk', 'emp']) {
      if (p[f] && !/^待核实$/.test(String(p[f]))) n++;
    }
    if (p.l && Object.keys(p.l).length) n++;
  }
  return n;
}
// 分数匹配：把预估总分和院校复试线比，给出冲/稳/保
function matchOf(line, score) {
  if (line == null) return null;
  const d = score - line;
  if (d >= 15) return { key: 'bao', label: '保底', cls: 'match-bao', diff: d };
  if (d >= 0) return { key: 'wen', label: '稳妥', cls: 'match-wen', diff: d };
  if (d >= -15) return { key: 'chong', label: '冲刺', cls: 'match-chong', diff: d };
  return { key: 'none', label: '差距大', cls: 'match-none', diff: d };
}
function downloadFile(name, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
function toCsv(rows) {
  return '\uFEFF' + rows.map(r => r.map(c => {
    const v = String(c == null ? '' : c).replace(/"/g, '""');
    return /[",\n]/.test(v) ? `"${v}"` : v;
  }).join(',')).join('\r\n');   // \uFEFF 是 BOM，否则 Excel 打开中文会乱码
}

/* ---------- 卡片/列表渲染 ---------- */
function lineCell(p) {
  if (p.l) {
    const y = YEARS.find(y => p.l[y] > 0);
    if (y) return `<b>${p.l[y]}</b><small style="color:var(--muted)">（${y}复试线）</small>`;
  }
  if (p.la) return `<span class="warn">≈ ${esc(p.la)}</span><small style="color:var(--muted)">（网络资料）</small>`;
  return '<span class="muted">待核实</span>';
}
function progRow(sch, key) {
  const p = sch[key] || {};
  const name = key === 'z' ? '金融专硕' : '金融学硕';
  const math = p.m ? esc(p.m) : '<span class="muted">待核实</span>';
  // 报录比需要「录取人数」和「报名人数」同时有值才算得出来，绝大多数院校不公布报名人数，
  // 所以这一格通常是「—」。不再重复显示"报名—"这类无信息量的字。
  return `<div class="program">
    <div class="p-name">${name}</div>
    <div class="cell"><b>复试线</b><span>${lineCell(p)}</span></div>
    <div class="cell"><b>录取人数 / 报录比</b><span>${p.e ? esc(p.e) : '<span class="muted">—</span>'}${ratioText(p) === '—' ? '' : ' · ' + ratioText(p)}</span></div>
    <div class="cell"><b>学费 / 学制</b><span>${p.f ? esc(p.f) : '<span class="muted">待核实</span>'} · ${p.d ? esc(p.d) : '—'}</span></div>
    <div class="cell"><b>初试科目</b><span>${math}${p.j ? ' + ' + esc(p.j) : ''}</span></div>
  </div>`;
}
function tagHtml(tags) {
  return (tags || []).map(t => `<span class="tag ${t === '财经类' ? 'caijing' : ''}">${esc(t)}</span>`).join('');
}

function filteredSchools() {
  const kw = $('#fSearch').value.trim().toLowerCase();
  const prov = $('#fProv').value;
  const tag = $('#fTag').value;
  const math = $('#fMath').value;
  const sort = $('#fSort').value;
  const onlyFav = $('#fFav').checked;
  const complete = $('#fComplete') ? $('#fComplete').value : '';
  const onlyFit = $('#fFit') ? $('#fFit').checked : false;
  const progKey = $('#fProgram').value || 'z';
  const score = SCORE;

  let list = DATA.schools.filter(s => {
    if (prov && s.prov !== prov) return false;
    if (tag && !(s.tags || []).includes(tag)) return false;
    if (onlyFav && !FAV.has(s.id)) return false;
    if (kw && !(s.name.toLowerCase().includes(kw) || (s.city || '').toLowerCase().includes(kw))) return false;
    if (math) {
      const p = s[progKey] || {};
      const m = p.m || '';
      // ⚠️ 不能用 m.includes('数三') 判「考数学三」：值是「303数学三」，字符是 数+学+三，
      // 不含连续的「数三」子串——这曾导致「考数学三」筛选命中 0 所（应为 113 所）。
      // 但「数三或396（分学院）」这个复合值里确实含连续的「数三」，所以三种写法都要覆盖：
      // 这样复合值在「考数学三」和「考396」两个筛选里都能命中（分学院两种都考）。
      const is396 = m.includes('396');
      const isMath3 = m.includes('303') || m.includes('数学三') || m.includes('数三');
      if (math === '396') { if (!is396) return false; }
      else if (math === '数三') { if (!isMath3) return false; }
    }
    if (complete) {
      const p = s[progKey] || {};
      if (complete === 'line' && !(p.l && Object.keys(p.l).length)) return false;
      if (complete === 'fee' && !(p.f && !/待核实/.test(p.f))) return false;
      if (complete === 'enroll' && !p.e) return false;
      if (complete === 'rich' && filledCount(s) < 5) return false;
    }
    if (onlyFit && score != null) {
      const m = matchOf(parseLineVal(s[progKey] || {}), score);
      if (!m || m.diff < 0) return false;
    }
    return true;
  });

  const w = s => (s.tags || []).includes('985') ? 0 : (s.tags || []).includes('211') ? 1 : (s.tags || []).includes('双一流') ? 2 : 3;
  const cmpDefault = (a, b) => (PROVS.indexOf(a.prov) - PROVS.indexOf(b.prov)) || (w(a) - w(b)) || a.name.localeCompare(b.name, 'zh');
  const cmps = {
    default: cmpDefault,
    line: (a, b) => (parseLineVal(b[progKey] || {}) ?? -1) - (parseLineVal(a[progKey] || {}) ?? -1),
    // 学费：先按口径折算成全程总额再比，避免「元/年」和「万/全程」直接比大小
    fee: (a, b) => feeTotalWan(a[progKey] || {}) - feeTotalWan(b[progKey] || {}),
    enroll: (a, b) => (parseCount((b[progKey] || {}).e) ?? -1) - (parseCount((a[progKey] || {}).e) ?? -1),
    complete: (a, b) => filledCount(b) - filledCount(a) || cmpDefault(a, b),
    diff: (a, b) => {
      if (score == null) return cmpDefault(a, b);
      const ma = matchOf(parseLineVal(a[progKey] || {}), score);
      const mb = matchOf(parseLineVal(b[progKey] || {}), score);
      const da = ma ? ma.diff : -9999, db = mb ? mb.diff : -9999;
      return db - da || cmpDefault(a, b);
    },
    fav: (a, b) => (FAV.has(b.id) ? 1 : 0) - (FAV.has(a.id) ? 1 : 0) || cmpDefault(a, b)
  };
  return list.sort(cmps[sort] || cmpDefault);
}

function renderResults() {
  const progSel = $('#fProgram').value;
  const list = filteredSchools();
  if (!list.length) {
    $('#results').innerHTML = '<div class="empty-tip">没有符合条件的院校，试试放宽筛选条件～</div>';
    return;
  }
  const groups = new Map();
  for (const s of list) { if (!groups.has(s.prov)) groups.set(s.prov, []); groups.get(s.prov).push(s); }

  let html = `<div class="muted" style="margin-bottom:8px;font-size:12px">共 ${list.length} 所${SCORE != null ? `（按预估 ${SCORE} 分匹配）` : ''}</div>`;
  for (const [prov, schools] of groups) {
    html += `<div class="prov-head">${esc(prov)} <small>（${schools.length} 所）</small></div>`;
    for (const s of schools) {
      const progs = progSel ? [progSel] : (s.z ? ['z'] : []).concat(s.x ? ['x'] : []);
      const pk = progSel || 'z';
      const m = SCORE != null ? matchOf(parseLineVal(s[pk] || {}), SCORE) : null;
      html += `<div class="school ${s.noFinance ? 'nofin' : ''}" data-id="${s.id}">
        <div class="school-head" onclick="openDetail('${s.id}')">
          <span class="school-name">${esc(s.name)}</span>${tagHtml(s.tags)}
          ${s.noFinance ? '<span class="badge-nofin">未查到金融硕士招生</span>' : ''}
          <span class="school-city">📍 ${esc(s.city || s.prov)}</span>
          ${m ? `<span class="match-badge ${m.cls}" title="预估分与复试线相差 ${m.diff > 0 ? '+' : ''}${m.diff} 分">${m.label} ${m.diff > 0 ? '+' : ''}${m.diff}</span>` : ''}
          <button style="margin-left:auto" onclick="toggleCmp('${s.id}')">${CMP.includes(s.id) ? '✓ 已选对比' : '± 对比'}</button>
          <button class="star ${FAV.has(s.id) ? 'on' : ''}" onclick="toggleFav(event,'${s.id}')" title="收藏">★</button>
        </div>
        ${progs.map(k => progRow(s, k)).join('')}
      </div>`;
    }
  }
  $('#results').innerHTML = html;
}

// 导出当前筛选 + 当前排序的结果为 CSV，可直接用 Excel 打开
function exportCurrentCsv() {
  const progKey = $('#fProgram').value || 'z';
  const list = filteredSchools();
  if (!list.length) { toast('当前没有可导出的院校'); return; }
  const pn = progKey === 'z' ? '金融专硕' : '金融学硕';
  const rows = [[
    '省份', '城市', '院校', '层次', '数据年份',
    pn + '复试线', '复试线年份', '录取人数', '报录比', '学费', '学制',
    '初试数学', '专业课', '参考书目', '就业口碑', '备注', '核实来源'
  ]];
  for (const s of list) {
    const p = s[progKey] || {};
    const y = p.l && YEARS.find(y => p.l[y] > 0);
    const r = ratioText(p);
    rows.push([
      s.prov, s.city || '', s.name, (s.tags || []).join('/'), s.y || '',
      y ? p.l[y] : (p.la ? '≈' + p.la : ''), y || '',
      p.e || '', r === '—' ? '' : r,
      p.f || '', p.d || '', p.m || '', p.j || '', p.bk || '', p.emp || '', p.nt || '',
      (s.sources || []).join(' ')
    ]);
  }
  downloadFile(`金融考研择校-${pn}-${list.length}所.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  toast(`已导出 ${list.length} 所院校`);
}

function toggleFav(ev, id) {
  ev.stopPropagation();
  FAV.has(id) ? FAV.delete(id) : FAV.add(id);
  saveFav();
  if (VIEW === 'query') renderResults();
}

/* ---------- 详情 ---------- */
function yearsBoxes(p) {
  const has = p.l && YEARS.some(y => p.l[y] > 0);
  if (!has) return p.la ? `<div class="years"><div class="ybox"><b class="warn">≈</b>${esc(p.la)}</div></div>` : '<span class="muted">暂无数据</span>';
  return `<div class="years">${YEARS.filter(y => p.l[y] > 0).map(y => `<div class="ybox"><b>${p.l[y]}</b>${y}年</div>`).join('')}</div>`;
}
function detailSec(sch, key) {
  const p = sch[key] || {};
  const nm = key === 'z' ? '金融专硕（0251）' : '金融学硕（0202 应用经济学）';
  // 学费若按年收，补一个全程估算，方便和「万/全程」的院校横向比
  const feeCell = p.f
    ? esc(p.f) + (feeIsPerYear(p)
        ? `<span class="muted">（按 ${feeYears(p)} 年制约 ${feeTotalWan(p).toFixed(1)} 万全程${parseYears(p.d) ? '' : '，学制未核实按2年估'}）</span>`
        : '')
    : '<span class="muted">待核实</span>';
  return `<div class="detail-sec"><h4>${nm}</h4>
    <div class="kv">
      <span class="k">历年复试线</span><span>${yearsBoxes(p)}</span>
      <span class="k">录取人数</span><span>${p.e ? esc(p.e) : '<span class="muted">—</span>'}</span>
      <span class="k">报名人数</span><span>${p.a ? esc(p.a) : '<span class="muted">—</span>'}</span>
      <span class="k">报录比</span><span>${ratioText(p)}</span>
      <span class="k">学费</span><span>${feeCell}</span>
      <span class="k">学制</span><span>${p.d ? esc(p.d) : '—'}</span>
      <span class="k">初试数学</span><span>${p.m ? esc(p.m) : '<span class="muted">待核实</span>'}</span>
      <span class="k">专业课</span><span>${p.j ? esc(p.j) : '—'}</span>
      ${p.bk ? `<span class="k">参考书目</span><span>${esc(p.bk)}</span>` : ''}
      ${p.emp ? `<span class="k">就业 / 口碑</span><span>${esc(p.emp)}</span>` : ''}
      ${p.nt ? `<span class="k">备注</span><span>${esc(p.nt)}</span>` : ''}
    </div></div>`;
}
function openDetail(id) {
  const s = byId(id);
  if (!s) return;
  const q = encodeURIComponent(`${s.name} 研究生院 金融专硕 复试分数线 招生简章`);
  $('#detailModal').innerHTML = `
    <h3>${esc(s.name)} ${tagHtml(s.tags)} <button class="close-x" onclick="closeModal('detailMask')">✕</button></h3>
    <p class="muted" style="margin-bottom:14px">📍 ${esc(s.prov)} · ${esc(s.city || s.prov)}　|　数据参考年份：${esc(s.y || '—')}（整理自公开资料，务必核实）</p>
    ${s.noFinance ? `<div class="alert">⚠️ 本次核查未在 2026 年招生专业目录中找到该校的金融硕士（0251 / 0202）招生信息。请以研招网最新目录为准，不要据此排除该校。</div>` : ''}
    ${s.z ? detailSec(s, 'z') : ''}
    ${s.x ? detailSec(s, 'x') : ''}
    ${s.note ? `<div class="detail-sec"><h4>综合备注</h4><p class="muted">${esc(s.note)}</p></div>` : ''}
    ${(s.sources && s.sources.length) ? `<div class="detail-sec"><h4>数据核实来源</h4>
      <div class="linkrow">${s.sources.map(u => `<a href="${esc(u)}" target="_blank" title="${esc(u)}">→ ${esc(hostOf(u))}</a>`).join('')}</div>
    </div>` : ''}
    <div class="linkrow">
      <a href="https://yz.chsi.com.cn/zsml/" target="_blank">→ 研招网硕士专业目录（查拟招人数）</a>
      <a href="https://www.bing.com/search?q=${q}" target="_blank">→ 搜索 ${esc(s.name)} 官方复试线/简章</a>
    </div>`;
  $('#detailMask').style.display = 'flex';
}
function closeModal(id) { $('#' + id).style.display = 'none'; }

/* ---------- 国家线 ---------- */
function renderNational() {
  const rows = DATA.national.rows || [];
  let html = `<table><thead><tr><th>年份</th><th>A 区总分</th><th>A 区单科（政/英）</th><th>A 区单科（数学/专业课）</th><th>B 区总分</th><th>说明</th></tr></thead><tbody>`;
  for (const r of rows) {
    html += `<tr><td><b>${r.year}</b></td>
      <td><b style="color:var(--brand)">${r.A.total}</b></td>
      <td>${r.A.s1}</td><td>${r.A.s2}</td>
      <td>${r.B ? r.B.total : '—'}</td>
      <td class="muted">${esc(r.note || '')}</td></tr>`;
  }
  html += '</tbody></table>';
  if (DATA.national.note) html += `<p class="muted" style="margin-top:10px">${esc(DATA.national.note)}</p>`;
  $('#nationalTable').innerHTML = html;
}

/* ---------- 数据管理 ---------- */
function renderManage() {
  const kw = ($('#mSearch') ? $('#mSearch').value : '').trim().toLowerCase();
  const all = [...DATA.schools].sort((a, b) => (PROVS.indexOf(a.prov) - PROVS.indexOf(b.prov)) || a.name.localeCompare(b.name, 'zh'));
  const list = kw
    ? all.filter(s => s.name.toLowerCase().includes(kw) || (s.city || '').toLowerCase().includes(kw) || s.prov.includes(kw))
    : all;

  let html = `<table><thead><tr><th style="width:70px">省份</th><th>院校</th><th>层次</th><th style="width:80px">城市</th><th style="width:70px">年份</th><th style="width:80px">完整度</th><th style="width:150px">操作</th></tr></thead><tbody>`;
  for (const s of list) {
    html += `<tr><td>${esc(s.prov)}</td><td><b>${esc(s.name)}</b>${s.noFinance ? ' <span class="badge-nofin">未查到招生</span>' : ''}</td><td>${tagHtml(s.tags) || '—'}</td>
      <td class="muted">${esc(s.city || '')}</td><td class="muted">${esc(s.y || '—')}</td>
      <td class="muted" title="已填写的有效字段数">${filledCount(s)}</td>
      <td class="rowbtns"><button onclick="openEditor('${s.id}')">编辑</button><button class="danger" onclick="delSchool('${s.id}')">删除</button></td></tr>`;
  }
  html += '</tbody></table>';
  $('#manageTable').innerHTML = html;
  const cnt = $('#mCount');
  if (cnt) cnt.textContent = kw ? `匹配 ${list.length} / ${all.length} 所` : `共 ${all.length} 所`;
}
function delSchool(id) {
  const s = byId(id);
  if (!s) return;
  if (!confirm(`确定删除「${s.name}」吗？删除后可用「恢复内置数据」找回（会覆盖你的其他修改，建议先导出备份）。`)) return;
  DATA.schools = DATA.schools.filter(x => x.id !== id);
  persist(); renderManage(); renderResults(); updateStat();
  toast('已删除');
}

/* ---------- 编辑器 ---------- */
function field(label, inner, full) {
  return `<div class="field ${full ? 'full' : ''}"><label>${label}</label>${inner}</div>`;
}
function progForm(key, p) {
  const nm = key === 'z' ? '金融专硕（0251）' : '金融学硕（0202）';
  const v = k => esc((p && p[k]) || '');
  const mathSel = v('m');
  const opt = (val, cur) => `<option value="${val}" ${val === cur ? 'selected' : ''}>${val}</option>`;
  const mathOptions = ['303数学三', '396经济类综合', '数三或396（分学院）', '不考数学', '待核实']
    .map(o => opt(o, mathSel)).join('');
  const lineInputs = YEARS.map(y =>
    field(`${y} 年复试线`, `<input type="number" data-p="${key}" data-k="l_${y}" value="${p && p.l && p.l[y] ? p.l[y] : ''}" placeholder="${y > new Date().getFullYear() ? '尚未公布' : '空=未收录'}">`)
  ).join('');
  return `<fieldset><legend>${nm}</legend>
    <div class="form-grid">
      ${field('初试数学', `<select data-p="${key}" data-k="m">${mathOptions}</select>`)}
      ${field('专业课初试科目', `<input data-p="${key}" data-k="j" value="${v('j')}" placeholder="如：431金融学综合 / 802经济学综合">`)}
      ${field('学费', `<input data-p="${key}" data-k="f" value="${v('f')}" placeholder="如：6.8万/全程 或 8000元/年">`)}
      ${field('学制', `<input data-p="${key}" data-k="d" value="${v('d')}" placeholder="如：2年">`)}
      ${lineInputs}
      ${field('复试线（约数，无确切值时填）', `<input data-p="${key}" data-k="la" value="${v('la')}" placeholder="如：360-380">`)}
      ${field('录取人数', `<input data-p="${key}" data-k="e" value="${v('e')}" placeholder="如：2026年录取约90人（含调剂）">`)}
      ${field('报名人数', `<input data-p="${key}" data-k="a" value="${v('a')}" placeholder="如：2026年报名约560人">`)}
      ${field('专业课参考书目', `<input data-p="${key}" data-k="bk" value="${v('bk')}" placeholder="如：《公司理财》罗斯、《金融学》黄达">`, true)}
      ${field('就业方向 / 口碑', `<input data-p="${key}" data-k="emp" value="${v('emp')}" placeholder="如：券商投行、银行总行，华东地区认可度高">`, true)}
      ${field('备注', `<textarea data-p="${key}" data-k="nt" rows="2" placeholder="如：推免比例高、分学院招生等">${v('nt')}</textarea>`, true)}
    </div></fieldset>`;
}
function openEditor(id) {
  const isNew = !id;
  const s = isNew ? { id: 's' + Date.now(), name: '', prov: '北京', city: '', tags: [], y: String(new Date().getFullYear()), note: '', x: {}, z: {} } : JSON.parse(JSON.stringify(byId(id)));
  $('#editModal').innerHTML = `
    <h3>${isNew ? '添加院校' : '编辑：' + esc(s.name)} <button class="close-x" onclick="closeModal('editMask')">✕</button></h3>
    <div class="form-grid" style="margin-bottom:12px">
      ${field('院校名称 *', `<input id="eName" value="${esc(s.name)}" placeholder="如：中国人民大学">`)}
      ${field('省份', `<select id="eProv">${PROVS.map(p => `<option ${p === s.prov ? 'selected' : ''}>${p}</option>`).join('')}</select>`)}
      ${field('城市', `<input id="eCity" value="${esc(s.city)}" placeholder="如：北京">`)}
      ${field('数据参考年份', `<input id="eYear" value="${esc(s.y)}" placeholder="如：2025">`)}
      <div class="field full"><label>院校层次</label><div class="tag-checks">${ALL_TAGS.map(t =>
        `<label><input type="checkbox" class="eTag" value="${t}" ${(s.tags || []).includes(t) ? 'checked' : ''}>${t}</label>`).join('')}</div></div>
    </div>
    ${progForm('z', s.z)}${progForm('x', s.x)}
    ${field('综合备注', `<textarea id="eNote" rows="2">${esc(s.note)}</textarea>`, true)}
    <div class="form-foot">
      ${isNew ? '' : `<button class="danger" onclick="delSchool('${s.id}');closeModal('editMask')">删除该院校</button>`}
      <button onclick="closeModal('editMask')">取消</button>
      <button class="primary" onclick="saveEditor('${s.id}')">保存</button>
    </div>`;
  $('#editMask').style.display = 'flex';
}
function saveEditor(id) {
  const name = $('#eName').value.trim();
  if (!name) { alert('请填写院校名称'); return; }
  let s = byId(id);
  if (!s) { s = { id }; DATA.schools.push(s); }
  s.name = name;
  s.prov = $('#eProv').value;
  s.city = $('#eCity').value.trim();
  s.y = $('#eYear').value.trim();
  s.tags = [...document.querySelectorAll('.eTag:checked')].map(c => c.value);
  s.note = $('#eNote').value.trim();
  for (const key of ['x', 'z']) {
    const p = {};
    document.querySelectorAll(`[data-p="${key}"]`).forEach(el => {
      const k = el.dataset.k;
      if (k.startsWith('l_')) {
        const y = k.slice(2);
        p.l = p.l || {};
        if (el.value) p.l[y] = parseInt(el.value);
      } else {
        p[k] = el.value.trim();
        if (!p[k]) delete p[k];
      }
    });
    if (p.l && !Object.keys(p.l).length) delete p.l;
    s[key] = Object.keys(p).length ? p : {};
  }
  persist(); closeModal('editMask'); renderManage(); renderResults(); updateStat();
  toast('已保存');
}

/* ---------- 对比 ---------- */
function renderCompareBar() {
  const bar = $('#compareBar');
  if (!CMP.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  $('#compareList').innerHTML = CMP.map(id => {
    const s = byId(id);
    return s ? `<span>${esc(s.name)}<i onclick="toggleCmp('${id}')">✕</i></span>` : '';
  }).join('');
}
function toggleCmp(id) {
  const i = CMP.indexOf(id);
  if (i >= 0) CMP.splice(i, 1);
  else if (CMP.length >= 4) { toast('最多同时对比 4 所院校'); return; }
  else CMP.push(id);
  renderCompareBar();
  if (VIEW === 'query') renderResults();
}
// 对比表的数据来源：HTML 和 CSV 导出共用一份，避免两处逻辑走偏
function compareRows(schools, progKey) {
  const P = s => s[progKey] || {};
  return [
    ['层次', s => (s.tags || []).join(' / ')],
    ['复试线', s => { const p = P(s); const y = p.l && YEARS.find(y => p.l[y] > 0); return y ? `${p.l[y]}（${y}）` : (p.la ? `≈ ${p.la}` : ''); }],
    ['录取人数', s => P(s).e || ''],
    ['报名 / 报录比', s => { const p = P(s); const r = ratioText(p); return (p.a ? p.a + ' · ' : '') + (r === '—' ? '' : r); }],
    ['学费', s => P(s).f || ''],
    ['学制', s => P(s).d || ''],
    ['初试数学', s => P(s).m || ''],
    ['专业课', s => P(s).j || ''],
    ['参考书目', s => P(s).bk || ''],
    ['就业 / 口碑', s => P(s).emp || ''],
    ['备注', s => P(s).nt || ''],
    ['数据年份', s => s.y || '']
  ];
}
function toggleClamp(el) {
  const box = el.previousElementSibling;
  box.classList.toggle('open');
  el.textContent = box.classList.contains('open') ? '收起' : '展开';
}
function openCompare() {
  if (CMP.length < 2) { toast('请先勾选至少 2 所院校'); return; }
  const progKey = $('#fProgram').value || 'z';
  const schools = CMP.map(byId).filter(Boolean);
  const defs = compareRows(schools, progKey);

  // 全列都为空的行（如 4 所学校都没收录参考书目）不渲染，避免整行「—」占地方
  const rowsHtml = defs.map(([label, fn]) => {
    const vals = schools.map(fn);
    if (vals.every(v => !v)) return '';
    const tds = vals.map((v, i) => {
      // 层次行用彩色标签渲染（CSV 里仍是纯文本）
      if (label === '层次') return `<td>${tagHtml(schools[i].tags) || '<span class="muted">—</span>'}</td>`;
      if (!v) return '<td><span class="muted">—</span></td>';
      const long = String(v).length > 60;
      return `<td>${long
        ? `<div class="clamp">${esc(v)}</div><span class="more" onclick="toggleClamp(this)">展开</span>`
        : esc(v)}</td>`;
    }).join('');
    return `<tr><td>${label}</td>${tds}</tr>`;
  }).join('');

  $('#compareModal').innerHTML = `
    <h3>院校对比（${progKey === 'z' ? '金融专硕' : '金融学硕'}） <button class="close-x" onclick="closeModal('compareMask')">✕</button></h3>
    <div class="toolbar">
      <button class="mini" onclick="exportCompare()">导出 CSV</button>
      <button class="mini" onclick="window.print()">打印 / 存 PDF</button>
      <span class="count">共 ${schools.length} 所</span>
    </div>
    <table class="cmp-table"><thead><tr><th></th>${schools.map(s => `<th>${esc(s.name)}<br><small class="muted">${esc(s.city || s.prov)}</small></th>`).join('')}</tr></thead>
    <tbody>${rowsHtml}</tbody></table>`;
  $('#compareMask').style.display = 'flex';
}
function exportCompare() {
  const progKey = $('#fProgram').value || 'z';
  const schools = CMP.map(byId).filter(Boolean);
  if (!schools.length) return;
  const defs = compareRows(schools, progKey);
  const rows = [['对比项', ...schools.map(s => s.name)]]
    .concat(defs.map(([label, fn]) => [label, ...schools.map(fn)]));
  downloadFile(`院校对比-${progKey === 'z' ? '金融专硕' : '金融学硕'}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  toast('已导出 CSV');
}

/* ---------- 持久化 & 初始化 ---------- */
async function persist() { await getApi().saveData(DATA); }
function updateStat() {
  $('#statLine').innerHTML = `共收录 <b style="color:#8fb7e8">${DATA.schools.length}</b> 所院校<br>覆盖 ${new Set(DATA.schools.map(s => s.prov)).size} 个省市 · 数据仅供参考`;
}

async function init() {
  if (WEB_MODE) document.body.classList.add('web-mode');
  DATA = await getApi().loadData();
  if (DATA._migration) {
    const m = DATA._migration;
    delete DATA._migration;
    setTimeout(() => toast(
      m.mode === 'replace'
        ? `数据已更新至 v${m.to}：共收录 ${m.total} 所院校`
        : `数据已更新至 v${m.to}：新增院校已并入，你的 ${m.kept} 所自定义数据已保留`
    ), 800);
  }
  $('#fProv').innerHTML = '<option value="">全部省份</option>' + PROVS.map(p => `<option>${p}</option>`).join('');

  document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => {
    document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    VIEW = b.dataset.view;
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    $('#view-' + VIEW).style.display = 'block';
    if (VIEW === 'national') renderNational();
    if (VIEW === 'manage') renderManage();
  });

  ['#fSearch', '#fProv', '#fTag', '#fProgram', '#fMath', '#fSort', '#fComplete'].forEach(sel => {
    const el = $(sel); if (!el) return;
    el.addEventListener('input', renderResults);
    el.addEventListener('change', renderResults);
  });
  $('#fFav').addEventListener('change', renderResults);
  if ($('#fFit')) $('#fFit').addEventListener('change', renderResults);

  // 分数匹配：输入预估总分 → 每张卡片标注 冲/稳/保
  if ($('#fScore')) {
    $('#fScore').addEventListener('input', () => {
      const v = parseFloat($('#fScore').value);
      SCORE = isFinite(v) && v > 0 ? v : null;
      const fit = $('#fFit'); if (fit && SCORE == null) fit.checked = false;
      if (SCORE != null && $('#fSort').value === 'default') $('#fSort').value = 'diff';
      renderResults();
    });
  }
  if ($('#btnClearScore')) $('#btnClearScore').onclick = () => {
    $('#fScore').value = ''; SCORE = null;
    if ($('#fFit')) $('#fFit').checked = false;
    $('#fSort').value = 'default';
    renderResults();
  };
  if ($('#btnExportCsv')) $('#btnExportCsv').onclick = exportCurrentCsv;
  if ($('#mSearch')) $('#mSearch').addEventListener('input', renderManage);

  $('#btnCompare').onclick = openCompare;
  $('#btnClearCompare').onclick = () => { CMP = []; renderCompareBar(); };
  $('#btnAdd').onclick = () => openEditor(null);
  $('#btnExport').onclick = async () => { const r = await getApi().exportData(DATA); if (r) toast('已导出' + (r === 'downloaded' ? '（浏览器模式下载）' : '：' + r)); };
  $('#btnImport').onclick = async () => {
    const r = await getApi().importData();
    if (!r) return;
    if (r.error) { alert(r.error); return; }
    DATA = r; renderManage(); renderResults(); updateStat(); toast('导入成功');
  };
  $('#btnOpenDir').onclick = () => getApi().openDataDir();
  $('#btnReset').onclick = async () => {
    if (!confirm('恢复内置数据会覆盖你的全部修改（含自行添加的院校），建议先导出备份。确定继续？')) return;
    DATA = await getApi().resetData();
    renderManage(); renderResults(); updateStat(); toast('已恢复内置数据');
  };

  renderResults(); updateStat();
}

init();
