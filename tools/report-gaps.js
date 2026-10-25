#!/usr/bin/env node
/**
 * 数据体检：统计每个字段的填充率，并按「谁最该先补」排出分批清单。
 *
 *   node tools/report-gaps.js          # 打印到终端，同时写 docs/data-gaps.md
 *   node tools/report-gaps.js --no-write
 *
 * 开源之后这张表就是数据协作的入口：每批做完一批，勾掉一批。
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const NO_WRITE = process.argv.includes('--no-write');
const schools = ['1', '2', '3', '4'].flatMap(i => JSON.parse(fs.readFileSync(path.join(root, 'data', `batch${i}.json`), 'utf8')));

const FIELDS = [
  ['l', '精确复试线'], ['la', '复试线约数'], ['m', '数学科目'], ['j', '专业课'],
  ['f', '学费'], ['d', '学制'], ['e', '录取人数'], ['a', '报名人数'],
  ['bk', '参考书'], ['emp', '就业口碑']
];
const progs = [];
schools.forEach(s => ['z', 'x'].forEach(k => { if (s[k]) progs.push({ s, k, p: s[k] }); }));
const fillRate = k => progs.filter(x => x.p[k] && !/^待核实$/.test(String(x.p[k]))).length;

const filled = s => {
  let n = 0;
  ['z', 'x'].forEach(k => {
    const p = s[k]; if (!p) return;
    ['m', 'j', 'f', 'd', 'e', 'a', 'bk', 'emp'].forEach(f => { if (p[f] && !/^待核实$/.test(String(p[f]))) n++; });
    if (p.l && Object.keys(p.l).length) n++;
  });
  return n;
};
const missingOf = s => {
  const out = new Set();
  ['z', 'x'].forEach(k => {
    const p = s[k]; if (!p) return;
    ['f', 'd', 'e', 'j'].forEach(f => { if (!p[f] || /^待核实$/.test(String(p[f]))) out.add(f); });
    if (!p.l || !Object.keys(p.l).length) out.add('l');
  });
  return [...out];
};
const LBL = { f: '学费', d: '学制', e: '录取人数', j: '专业课', l: '复试线' };

// 分批：985 → 211/财经类 → 其余
const tier = s => (s.tags || []).includes('985') ? 1 : ((s.tags || []).includes('211') || (s.tags || []).includes('财经类')) ? 2 : 3;
const batches = [1, 2, 3].map(t => schools.filter(s => tier(s) === t)
  .sort((a, b) => filled(a) - filled(b)));

// 已完成 2027 简章核对的从备注识别：新批次打「2027简章已核」标记，前两批统一以「2027级」开头。
// 硬编码院校名单每次加一批就要改一次代码，且漏改会让已核对的院校继续显示「待补」。
const DONE = new Set(schools.filter(s => ['z', 'x'].some(k => s[k] &&
  (/2027简章已核/.test(String(s[k].nt || '')) || /2027级/.test(String(s[k].nt || ''))))).map(s => s.id));

const pct = n => Math.round(n / progs.length * 100);
const lines = [];
const out = s => { lines.push(s); console.log(s); };

out(`# 数据体检（${schools.length} 所院校 / ${progs.length} 个招生方向）`);
out('');
out('| 字段 | 已填 | 填充率 |');
out('|---|---|---|');
FIELDS.forEach(([k, label]) => out(`| ${label} | ${fillRate(k)} | ${pct(fillRate(k))}% |`));
out('');
out('## 分批更新清单');
out('');
const NAMES = { 1: '985', 2: '211 / 财经类', 3: '其他院校' };
batches.forEach((list, i) => {
  const todo = list.filter(s => !DONE.has(s.id));
  out(`### 批次 ${i + 1}：${NAMES[i + 1]}（${todo.length} 所待补 / 共 ${list.length} 所）`);
  out('');
  out('| 院校 | 省份 | 现有字段数 | 待补 | 状态 |');
  out('|---|---|---|---|---|');
  list.slice(0, 400).forEach(s => {
    out(`| ${s.name} | ${s.prov} | ${filled(s)} | ${missingOf(s).map(m => LBL[m] || m).join('、') || '—'} | ${DONE.has(s.id) ? '✅ 2027 简章已核' : '待补'} |`);
  });
  out('');
});

const md = lines.join('\n');
if (!NO_WRITE) {
  const dir = path.join(root, 'docs');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'data-gaps.md'), `<!-- 由 npm run gaps 生成，请勿手改 -->\n\n${md}\n`, 'utf8');
  console.log(`\n已写入 docs/data-gaps.md`);
}
