#!/usr/bin/env node
/**
 * 2027 批次三：211 / 财经类院校（docs/data-gaps.md 批次 2）
 *
 *   node tools/apply-batch-2027-211.js --dry
 *   node tools/apply-batch-2027-211.js
 *
 * 数据在 tools/batch-2027-211.json（每条带出处），本脚本只负责校验 + 幂等写入。
 * 口径与前两批一致：官方优先，第三方字段后缀「（第三方）」，冲突如实写，拿不准留空；复试线一律不碰。
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

const ALLOWED = new Set(['m', 'j', 'f', 'd', 'e']);
const M_VALUES = new Set(['303数学三', '396经济类综合', '数三或396（分学院）', '不考数学', '待核实']);

// m 在界面里是直接展示的枚举值，来源标注（第三方/年份）改由 note 承担，写入前先剥掉
function normalize(rec) {
  for (const prog of Object.values(rec.programs)) {
    if (prog.m) prog.m = prog.m.replace(/[（(](?:第三方|官方|待核)[）)]/g, '').trim();
  }
  return rec;
}

function validate(p) {
  const errs = [];
  if (!Array.isArray(p.sources) || !p.sources.length) errs.push('缺 sources');
  (p.sources || []).forEach(u => { if (!/^https?:\/\//.test(u)) errs.push(`非法 URL ${u}`); });
  for (const [k, prog] of Object.entries(p.programs || {})) {
    if (k !== 'x' && k !== 'z') errs.push(`未知方向 ${k}`);
    for (const [f, v] of Object.entries(prog)) {
      if (f === 'note') continue;
      if (!ALLOWED.has(f)) errs.push(`${k}.${f} 不允许写入`);
      else if (typeof v !== 'string' || !v.trim()) errs.push(`${k}.${f} 为空`);
    }
    if (prog.m && !M_VALUES.has(prog.m)) errs.push(`${k}.m 非法值「${prog.m}」`);
    if (prog.d && !/年/.test(prog.d)) errs.push(`${k}.d 缺「年」`);
    if (prog.f && !/(元|万)/.test(prog.f)) errs.push(`${k}.f 缺金额单位`);
  }
  return errs;
}

const PATCHES = JSON.parse(fs.readFileSync(path.join(__dirname, 'batch-2027-211.json'), 'utf8')).map(normalize);

const bad = PATCHES.map(p => [p.id, validate(p)]).filter(([, e]) => e.length);
if (bad.length) {
  bad.forEach(([id, e]) => console.error(`✗ ${id}: ${e.join('；')}`));
  process.exit(1);
}

const files = ['batch1', 'batch2', 'batch3', 'batch4'].map(n => path.join(root, 'data', `${n}.json`));
const data = files.map(f => JSON.parse(fs.readFileSync(f, 'utf8')));

let touched = 0;
const missed = [];
for (const p of PATCHES) {
  let hit = false;
  data.forEach(list => {
    const s = list.find(x => x.id === p.id);
    if (!s) return;
    hit = true;
    const before = JSON.stringify(s);
    for (const [k, prog] of Object.entries(p.programs)) {
      const target = s[k] || (s[k] = {});
      const { note, ...set } = prog;
      Object.assign(target, set);
      if (note && !String(target.nt || '').includes(note)) {
        target.nt = target.nt ? `${target.nt}｜${note}` : note;
      }
      // 体检报告靠这个标记判断「该方向 2027 简章已核」，与备注写什么措辞无关
      if (!/2027简章已核/.test(String(target.nt || ''))) {
        target.nt = target.nt ? `${target.nt}｜2027简章已核` : '2027简章已核';
      }
    }
    s.sources = Array.from(new Set([...(s.sources || []), ...p.sources]));
    if (before !== JSON.stringify(s)) touched++;
    const keys = Object.entries(p.programs).map(([k, v]) => `${k}:${Object.keys(v).filter(f => f !== 'note').join('/')}`);
    console.log(`${DRY ? '[dry] ' : ''}✓ ${s.name} ← ${keys.join(' ')}`);
  });
  if (!hit) { missed.push(p.id); console.warn(`  ! 未找到院校 ${p.id}`); }
}

if (missed.length) process.exitCode = 1;
if (!DRY) {
  files.forEach((f, i) => fs.writeFileSync(f, JSON.stringify(data[i], null, 2) + '\n', 'utf8'));
  console.log(`\n写入完成：${touched} 所院校已更新${missed.length ? '，未匹配：' + missed.join(',') : ''}`);
} else {
  console.log(`\n[dry] 预计更新 ${touched} 所院校（未写入磁盘）`);
}
