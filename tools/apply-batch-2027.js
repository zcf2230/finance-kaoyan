#!/usr/bin/env node
/**
 * 2027 批次一：四所财经类院校的 2027 招生简章核对结果
 *
 *   node tools/apply-batch-2027.js --dry   # 只打印将改动的内容
 *   node tools/apply-batch-2027.js         # 写入 data/batch*.json
 *
 * 为什么用脚本而不是直接改 JSON：
 *   ① 每条改动都带官方出处，评审时能一眼看到「改了什么、凭什么改」；
 *   ② 可重复执行（幂等），不会反复往 nt 里拼同一段话；
 *   ③ 开源后别人提数据 PR，可以照这个格式写，diff 干净。
 *
 * 只写「能指向官方页面」的字段：学费、学制、拟招人数、科目。
 * 复试线仍是 2026 年（2027 年的要到 2027 年 3 月才公布）。
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

/** @type {Array<{id:string, program:'z'|'x', set:Object, note:string, sources:string[]}>} */
const PATCHES = [
  {
    id: 'yangcai', program: 'z',
    set: {
      m: '396经济类综合',
      f: '4.8万元/年（2027级）',
      d: '2年（01-05方向）/3年（06智能与计算金融方向）',
      e: '2027年金融学院拟招金融硕士322人（含推免与统考）：01-04方向招统考，05金融科技、06智能与计算金融仅招推免'
    },
    note: '2027级调整：新增智能与计算金融方向（06，仅推免、学制3年、计划50人），取消资产管理与量化投资方向；学费 4.8 万元/年（01-05方向2年，全程约9.6万）——原「约6.8万/全程」为估算，已按2027简章更正',
    sources: ['https://sf.cufe.edu.cn/info/1104/16109.htm', 'https://sf.cufe.edu.cn/info/1104/16025.htm']
  },
  {
    id: 'shangcai', program: 'z',
    set: {
      m: '数三或396（分方向）',
      f: '分院系差异大：经济学院金融计量22.8万/全程；滴水湖高金A组22.8万、B组30.8万；财税投资学院首席投资官25万/全程',
      d: '2年（首席经济学家/国际组织人才培养/首席投资官等方向3年）',
      e: '2027年全校金融专硕计划758人（2026年706人，扩招52人）；新增人工智能与量化金融、数智金融风险管理（住企培养）、科创金融三个方向，合计80人'
    },
    note: '2027级：新增3个方向学费均为22.8万/2年；原「首席经济学家项目」自2027年起并入经济学院金融专硕统一招生；金融学院各方向学费以学院简章为准',
    sources: ['https://econ.sufe.edu.cn/14/7f/c6905a267391/page.htm']
  },
  {
    id: 'duimao', program: 'z',
    set: {
      f: '国际经济贸易学院约6万/全程（2026年）；中国金融学院2027年学费以学院简章为准',
      e: '2027年中国金融学院拟招149人（含国家卓越社科人才培养基地专项11人）、国际经济贸易学院拟招108人'
    },
    note: '2027级中国金融学院分银行管理／资本市场／金融工程／量化投资四个方向，初试为101政治+201英语一+396经综+431金融学综合（科目来源为公开专业目录，报考前请以学院简章核实）',
    sources: ['https://www.baoyantongzhi.com/notice/detail/297539']
  },
  {
    id: 'xinancaijing', program: 'z',
    set: {
      f: '2.1万元/年（全程4.2万）',
      d: '2年',
      e: '2027年金融学院拟招172人、国际金融学院拟招60人（后者分金融开放与安全／数字跨境金融／全球金融治理三方向）'
    },
    note: '2027级学费按学校财务处《硕士研究生教育收费公示表（2027-2028学年）》：金融专硕 21000 元/年·生，学制2年，全程约4.2万',
    sources: ['https://cwc.swufe.edu.cn/info/1012/3121.htm']
  }
];

const files = ['batch1', 'batch2', 'batch3', 'batch4'].map(n => path.join(root, 'data', `${n}.json`));
const data = files.map(f => JSON.parse(fs.readFileSync(f, 'utf8')));

let touched = 0;
for (const p of PATCHES) {
  let hit = false;
  data.forEach(list => {
    const s = list.find(x => x.id === p.id);
    if (!s) return;
    hit = true;
    const prog = s[p.program] || (s[p.program] = {});
    const before = JSON.stringify(prog);
    Object.assign(prog, p.set);
    // nt 用「｜」分段，同一段重复合并时跳过，保证幂等
    if (p.note && !String(prog.nt || '').includes(p.note)) {
      prog.nt = prog.nt ? `${prog.nt}｜${p.note}` : p.note;
    }
    s.sources = Array.from(new Set([...(s.sources || []), ...p.sources]));
    if (before !== JSON.stringify(prog)) touched++;
    console.log(`${DRY ? '[dry] ' : ''}✓ ${s.name} ${p.program === 'z' ? '专硕' : '学硕'} ← ${Object.keys(p.set).join('/')}`);
  });
  if (!hit) console.warn(`  ! 未找到院校 ${p.id}`);
}

if (!DRY) {
  files.forEach((f, i) => fs.writeFileSync(f, JSON.stringify(data[i], null, 2) + '\n', 'utf8'));
  console.log(`\n写入完成：${touched} 个招生方向已更新`);
} else {
  console.log(`\n[dry] 预计更新 ${touched} 个招生方向（未写入磁盘）`);
}
