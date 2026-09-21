/* 金融考研择校通 - 渲染进程逻辑 */
'use strict';

const PROVS = ["北京","天津","河北","山西","内蒙古","辽宁","吉林","黑龙江","上海","江苏","浙江","安徽","福建","江西","山东","河南","湖北","湖南","广东","广西","海南","重庆","四川","贵州","云南","西藏","陕西","甘肃","青海","宁夏","新疆"];
// 年份降序：第一项是"当前招生年度"。每年 9-10 月新简章发布后，在这里加一个新年份、删掉最老的即可。
const YEARS = [2027, 2026, 2025, 2024];
const ALL_TAGS = ["985", "211", "双一流", "财经类", "自划线"];

let DATA = null;               // {national, schools}
let FAV = new Set(JSON.parse(localStorage.getItem('fav') || '[]'));
let CMP = [];                  // 待对比院校 id
let VIEW = 'query';

/* ---------- 兼容浏览器调试（无 Electron 环境时用 fetch + localStorage 模拟） ---------- */
function getApi() {
  if (window.api) return window.api;
  const KEY = 'mock-kaoyan-data';
  const seed = async () => {
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

// 从字符串解析“万元”数值，用于学费排序
function parseFeeWan(str) {
  if (!str || /待核实|—/.test(str)) return Infinity;
  const m = str.replace(/,/g, '').match(/([\d.]+)/);
  if (!m) return Infinity;
  let n = parseFloat(m[1]);
  if (/万/.test(str.slice(m.index))) return n;
  return n >= 1000 ? n / 10000 : n; // 8000元 → 0.8万
}
function parseLineVal(p) {
  if (p.l) { const ys = YEARS.map(y => p.l[y]).filter(v => v > 0); if (ys.length) return Math.max(...ys); }
  if (p.la) { const m = String(p.la).match(/(\d{3})/); if (m) return parseInt(m[1]); }
  return null;
}
function parseCount(str) {
  if (!str) return null;
  const m = String(str).match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}
function ratioText(p) {
  const e = parseCount(p.e), a = parseCount(p.a);
  if (e && a && a > 0) return (a / e).toFixed(1) + ' : 1';
  return '—';
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
  return `<div class="program">
    <div class="p-name">${name}</div>
    <div class="cell"><b>复试线</b><span>${lineCell(p)}</span></div>
    <div class="cell"><b>录取人数</b><span>${p.e ? esc(p.e) : '<span class="muted">—</span>'}</span></div>
    <div class="cell"><b>报名 / 报录比</b><span>${p.a ? esc(p.a) : '<span class="muted">报名—</span>'} · ${ratioText(p)}</span></div>
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
  const progKey = $('#fProgram').value || 'z';

  let list = DATA.schools.filter(s => {
    if (prov && s.prov !== prov) return false;
    if (tag && !(s.tags || []).includes(tag)) return false;
    if (onlyFav && !FAV.has(s.id)) return false;
    if (kw && !(s.name.toLowerCase().includes(kw) || (s.city || '').toLowerCase().includes(kw))) return false;
    if (math) {
      const p = s[progKey] || {};
      const m = p.m || '';
      if (math === '396') { if (!m.includes('396')) return false; }
      else if (math === '数三') { if (!m.includes('数三') || m.includes('396')) return false; }
    }
    return true;
  });

  const w = s => (s.tags || []).includes('985') ? 0 : (s.tags || []).includes('211') ? 1 : (s.tags || []).includes('双一流') ? 2 : 3;
  const cmpDefault = (a, b) => (PROVS.indexOf(a.prov) - PROVS.indexOf(b.prov)) || (w(a) - w(b)) || a.name.localeCompare(b.name, 'zh');
  const cmps = {
    default: cmpDefault,
    line: (a, b) => (parseLineVal(b[progKey] || {}) ?? -1) - (parseLineVal(a[progKey] || {}) ?? -1),
    fee: (a, b) => parseFeeWan((a[progKey] || {}).f) - parseFeeWan((b[progKey] || {}).f),
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

  let html = '';
  for (const [prov, schools] of groups) {
    html += `<div class="prov-head">${esc(prov)} <small>（${schools.length} 所）</small></div>`;
    for (const s of schools) {
      const progs = progSel ? [progSel] : (s.z ? ['z'] : []).concat(s.x ? ['x'] : []);
      html += `<div class="school" data-id="${s.id}">
        <div class="school-head" onclick="openDetail('${s.id}')">
          <span class="school-name">${esc(s.name)}</span>${tagHtml(s.tags)}
          <span class="school-city">📍 ${esc(s.city || s.prov)}</span>
          <button style="margin-left:auto" onclick="toggleCmp('${s.id}')">${CMP.includes(s.id) ? '✓ 已选对比' : '± 对比'}</button>
          <button class="star ${FAV.has(s.id) ? 'on' : ''}" onclick="toggleFav(event,'${s.id}')" title="收藏">★</button>
        </div>
        ${progs.map(k => progRow(s, k)).join('')}
      </div>`;
    }
  }
  $('#results').innerHTML = html;
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
  return `<div class="detail-sec"><h4>${nm}</h4>
    <div class="kv">
      <span class="k">历年复试线</span><span>${yearsBoxes(p)}</span>
      <span class="k">录取人数</span><span>${p.e ? esc(p.e) : '<span class="muted">公开渠道未获取到，建议咨询学院研招办</span>'}</span>
      <span class="k">报名人数</span><span>${p.a ? esc(p.a) : '<span class="muted">多数院校不公布，见「使用说明」第 2 条</span>'}</span>
      <span class="k">报录比</span><span>${ratioText(p)}</span>
      <span class="k">学费</span><span>${p.f ? esc(p.f) : '<span class="muted">待核实</span>'}</span>
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
    ${s.z ? detailSec(s, 'z') : ''}
    ${s.x ? detailSec(s, 'x') : ''}
    ${s.note ? `<div class="detail-sec"><h4>综合备注</h4><p class="muted">${esc(s.note)}</p></div>` : ''}
    ${(s.sources && s.sources.length) ? `<div class="detail-sec"><h4>数据核实来源</h4>
      <div class="linkrow">${s.sources.map((u, i) => `<a href="${esc(u)}" target="_blank">→ 来源 ${i + 1}</a>`).join('')}</div>
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
  let html = `<table><thead><tr><th>省份</th><th>院校</th><th>层次</th><th>城市</th><th>数据年份</th><th style="width:150px">操作</th></tr></thead><tbody>`;
  const list = [...DATA.schools].sort((a, b) => (PROVS.indexOf(a.prov) - PROVS.indexOf(b.prov)) || a.name.localeCompare(b.name, 'zh'));
  for (const s of list) {
    html += `<tr><td>${esc(s.prov)}</td><td><b>${esc(s.name)}</b></td><td>${tagHtml(s.tags) || '—'}</td>
      <td class="muted">${esc(s.city || '')}</td><td class="muted">${esc(s.y || '—')}</td>
      <td class="rowbtns"><button onclick="openEditor('${s.id}')">编辑</button><button class="danger" onclick="delSchool('${s.id}')">删除</button></td></tr>`;
  }
  html += '</tbody></table>';
  $('#manageTable').innerHTML = html;
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
function openCompare() {
  if (CMP.length < 2) { toast('请先勾选至少 2 所院校'); return; }
  const progKey = $('#fProgram').value || 'z';
  const schools = CMP.map(byId).filter(Boolean);
  const row = (label, fn) => `<tr><td>${label}</td>${schools.map(s => `<td>${fn(s) || '—'}</td>`).join('')}</tr>`;
  $('#compareModal').innerHTML = `
    <h3>院校对比（${progKey === 'z' ? '金融专硕' : '金融学硕'}） <button class="close-x" onclick="closeModal('compareMask')">✕</button></h3>
    <table class="cmp-table"><thead><tr><th></th>${schools.map(s => `<th>${esc(s.name)}<br><small class="muted">${esc(s.city || s.prov)}</small></th>`).join('')}</tr></thead><tbody>
      ${row('层次', s => tagHtml(s.tags))}
      ${row('复试线', s => { const p = s[progKey] || {}; const y = p.l && YEARS.find(y => p.l[y] > 0); return y ? `<b style="color:var(--brand)">${p.l[y]}</b>（${y}）` : (p.la ? `≈ ${esc(p.la)}` : '待核实'); })}
      ${row('录取人数', s => (s[progKey] || {}).e)}
      ${row('报名/报录比', s => { const p = s[progKey] || {}; return p.a ? esc(p.a) + ' · ' + ratioText(p) : ratioText(p); })}
      ${row('学费', s => (s[progKey] || {}).f)}
      ${row('学制', s => (s[progKey] || {}).d)}
      ${row('初试数学', s => (s[progKey] || {}).m)}
      ${row('专业课', s => (s[progKey] || {}).j)}
      ${row('参考书目', s => (s[progKey] || {}).bk)}
      ${row('就业 / 口碑', s => (s[progKey] || {}).emp)}
      ${row('备注', s => (s[progKey] || {}).nt)}
      ${row('数据年份', s => s.y)}
    </tbody></table>`;
  $('#compareMask').style.display = 'flex';
}

/* ---------- 持久化 & 初始化 ---------- */
async function persist() { await getApi().saveData(DATA); }
function updateStat() {
  $('#statLine').innerHTML = `共收录 <b style="color:#8fb7e8">${DATA.schools.length}</b> 所院校<br>覆盖 ${new Set(DATA.schools.map(s => s.prov)).size} 个省市 · 数据仅供参考`;
}

async function init() {
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

  ['#fSearch', '#fProv', '#fTag', '#fProgram', '#fMath', '#fSort'].forEach(sel => {
    $(sel).addEventListener('input', renderResults);
    $(sel).addEventListener('change', renderResults);
  });
  $('#fFav').addEventListener('change', renderResults);
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
