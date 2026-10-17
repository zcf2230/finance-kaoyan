#!/usr/bin/env node
/**
 * 2027 批次二：985 院校第一批四所（数据缺口最大的）
 *
 *   node tools/apply-batch-2027-b2.js --dry
 *   node tools/apply-batch-2027-b2.js
 *
 * 口径说明：
 *  · 只写能给出处的字段；两个来源打架时如实写进字段/备注，不替用户拍板
 *  · 复试线仍是 2026 年口径，2027 线 2027 年 3 月才有
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

const PATCHES = [
  {
    id: 'zhongguonongda', program: 'z',
    set: {
      f: '2.9万元/学年（金融/会计/数字经济专硕统一标准）',
      d: '2年',
      e: '2027年经济管理学院拟招36人（含推免21人，统考约15人）'
    },
    note: '2027级：学费2.9万元/学年（学校招生章程）；初试为101政治+204英语二+303数学三+431金融学综合，不分研究方向；专硕学制2年，培养地点校本部，在读期间住宿自理',
    sources: [
      'http://www.huaue.com/kydt2026/2026108162056.htm',
      'https://www.kaoyan.cn/school/194/plan/974590',
      'https://www.kaoyan.cn/recommend/details/8809'
    ]
  },
  {
    id: 'dalianligong', program: 'z',
    set: {
      m: '396经济类综合',
      d: '3年',
      e: '2027年经济管理学院全日制拟招15人（期货与衍生品方向特色项目）',
      f: '非全日制6万/全程；全日制以学校教育收费公示为准（未取得）'
    },
    note: '2027级重要变更：初试科目改为101政治+201英语一+396经济类综合+431金融学综合（原为数三），报考前务必按新科目备考；全日制在（主校区）经济管理学院，另有非全日制MF（期货研究院项目，学制3年）；统考计划会随推免录取情况调整',
    sources: [
      'https://www.kaoyan.cn/school/318/plan/1141232',
      'https://app.xinhuanet.com/news/article.html?articleId=202610150a32fff268b84ffe9c727405773d0d79'
    ]
  },
  {
    id: 'xibeigongye', program: 'z',
    set: {
      d: '3年',
      f: '2万元/学年（需核实：2027简章转载版载金融专硕2万/年，官网简章正文另载「全日制统一8000元/年」，以财务处公示为准）'
    },
    note: '2027级：学制3年（学校招生简章）；拟招全日制硕士约5000名（全校口径，金融专硕分专业名额未取得）；两个学费口径并存，报考前打电话向管理学院研招办确认',
    sources: [
      'https://yzb.nwpu.edu.cn/info/1174/10498.htm',
      'https://xa.bendibao.com/edu/2026108/154339.shtm'
    ]
  },
  {
    id: 'lanzhouda', program: 'z',
    set: {
      f: '全日制暂定2.4万元/学年；非全日制12万/全程',
      e: '2027年经济学院拟招全日制47人、非全日制20人'
    },
    note: '2027级：全日制金融学费暂定2.4万元/学年（按甘肃省批复为准）；非全日制初试为101政治+204英语二+396经综+431（全日制科目以专业目录为准）；学费与名额均为「暂定」，随国家计划和推免录取调整',
    sources: [
      'https://gansu.eol.cn/gsgd/202610/t20261009_2780641.shtml',
      'https://www.kaoyan.cn/school/262/plan/1368317'
    ]
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
