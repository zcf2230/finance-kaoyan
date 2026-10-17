#!/usr/bin/env node
/**
 * 2027 批次二（下）：其余 29 所 985 院校
 *
 *   node tools/apply-batch-2027-985.js --dry
 *   node tools/apply-batch-2027-985.js
 *
 * 口径纪律：
 *  · 官方（研究生院官网/简章/收费公示/官方目录）优先；第三方（掌上考研/点对点/机构）一律在字段或备注里标「第三方」
 *  · 两个来源冲突时如实写冲突，不拍板（如天大 28 vs 45 人）
 *  · 只动 f 学费 / d 学制 / e 拟招人数 / m 初试科目；复试线(l/la)一律不碰——2027 线明年 3 月才有
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

const PATCHES = [
  { id: 'hagongda', program: 'z', set: {
      f: '0.9万元/学年（2027级起全日制专硕新标准，官方）', d: '2-3年',
      e: '2027年经济学院统考拟招45人（不含推免，第三方目录）',
      m: '396经济类综合' },
    note: '2027级：全日制专硕学费调整为0.9万元/学年（研究生院官方）；初试科目改为396经综+431（第三方目录，报考前官网复核）',
    sources: ['https://hitgs.hit.edu.cn/2026/0920/c17352a401840/page.htm', 'https://www.kaoyan.cn/school/378/plan/1170221'] },
  { id: 'tongji', program: 'z', set: {
      f: '全日制20.8万/全程；非全日制22.8万/全程（第三方，分两年缴）', d: '2年',
      e: '2027级：经管学院推免拟招30人左右；非全日制第三方目录列41人（统考名额未取得）',
      m: '396经济类综合' },
    note: '2027级：学费/学制/科目均为第三方口径，以 yz.tongji.edu.cn 为准；初试396+431（第三方目录）',
    sources: ['https://www.xdf.cn/294/202610/15425912.html', 'https://www.mbachina.com/html/xw/202608/656250.html'] },
  { id: 'tianda', program: 'z', set: {
      f: '2.8万元/学年（全日制，第三方转载简章）', d: '2.5年',
      e: '2027年管理与经济学部全日制统考拟招28人（第三方；另有页面显示45人，两处冲突）' },
    note: '2027级：学费2.8万/学年、学制2.5年为第三方转载简章口径；拟招人数两个页面不一致（28 vs 45），以天大研招网2027专业目录为准',
    sources: ['https://www.haitunedu.com/news/2035', 'https://www.kaoyan.cn/school/242/plan/968880'] },
  { id: 'dongbeidaxue', program: 'z', set: {
      e: '2027年统考拟招：商学院16人、数学与统计学院5人（不含推免，第三方）' },
    note: '2027级：金融在商学院与数学与统计学院两地招生（第三方目录）；学费/学制官方附件未检索到具体数字',
    sources: ['http://yz.neu.edu.cn/2026/0930/c5933a480167/page.htm', 'https://www.kaoyan.cn/school/143/plan/1144637'] },
  { id: 'dongnan', program: 'z', set: {
      f: '1万元/年（第三方）', d: '3年',
      e: '2027年经济管理学院全日制统考拟招3人（不含推免，第三方；另有非全单考15人）' },
    note: '2027级：学费/学制/科目为第三方（点对点）口径；统考名额极少（仅3人），另有非全单考项目',
    sources: ['https://www.dddjyky.com/sejxk_dx.php?dx_id=389&ejxk_id=025100', 'https://m.kaoyan.cn:10443/school/287/major'] },
  { id: 'huagong', program: 'z', set: {
      f: '3.5万元/学年（第三方）', d: '2年',
      e: '2027年经济与金融学院统考拟招6人（不含推免，第三方目录）' },
    note: '2027级：学费3.5万/年、学制2年为第三方口径；统考拟招6人与数学科目出自2027目录（掌上考研）',
    sources: ['https://www.kaoyan.cn:10443/school/56/plan/1214404', 'https://m.koolearn.com/kaoyan/20260807/1967119.html'] },
  { id: 'sichuanda', program: 'z', set: {
      f: '2.1万元/年（第三方）', d: '2年',
      e: '2027年经济学院统考拟招29人（不含推免，第三方目录）' },
    note: '2027级：学费/学制/人数为第三方口径；官方章程确认全校拟招7360人，分专业目录见 yz.scu.edu.cn/sszyml',
    sources: ['https://www.kaoyan.cn/school/208/plan/1171704', 'https://www.thepaper.cn/newsDetail_forward_34228799'] },
  { id: 'beihang', program: 'z', set: {
      f: '2.5万元/学年（第三方）', d: '2年',
      e: '2027年经济管理学院统考拟招13人（第三方）', m: '396经济类综合' },
    note: '2027级：初试396经综+431（第三方目录）；学费/学制/人数均为第三方口径，建议研究生院官网复核',
    sources: ['https://www.dddjyky.com/sejxk_dx.php?dx_id=42&ejxk_id=025100', 'https://souky.eol.cn/web/school/schoolspecial?school_id=182'] },
  { id: 'zhongyangminzu', program: 'z', set: {
      f: '4万元/学年（官方2027简章）', d: '2年',
      e: '2027年经济学院拟招47人（不含推免，第三方目录）' },
    note: '2027级：学费4万/年、学制2年为研究生院官方学费表；2027级新生原则上在丰台校区培养',
    sources: ['https://grs.muc.edu.cn/info/1178/8274.htm', 'https://www.kaoyan.cn/school/119/plan/1410226'] },
  { id: 'zhongked', program: 'z', set: {
      f: '18.8万/全程（第一、二学年初各缴9.4万，官方）', d: '3年',
      e: '2027年拟录取：推免57人、统考43人（官方简章）' },
    note: '2027级官方简章：初试考英语一+数学三+431、不计政治；全日制3年，合肥/上海上课，可申请提前毕业',
    sources: ['https://mf.ustc.edu.cn/2026/1012/c14064a755765/page.htm'] },
  { id: 'zhongguohaiyang', program: 'z', set: {
      e: '2027年经济学院统考拟招30人（第三方目录）', m: '396经济类综合' },
    note: '2027级：初试396+431、统考30人均为第三方（掌上考研）；官方学费标准页未列金融025100具体数值；勿与经济学院MBA（金融方向，125100）混淆',
    sources: ['https://www.kaoyan.cn/school/460/major', 'https://www.kaoyan.cn/school/460/plan/1057312'] },
  { id: 'dianzike', program: 'z', set: {
      f: '2.1万元/学年（既有标准，第三方转载；2027以计财处公示为准）', d: '2年',
      e: '2027年经管学院统考拟招：全日制5人、非全日制4人（第三方目录）' },
    note: '2027级：学制2年为官方章程确认；金融统考名额很少（全日制仅5人）',
    sources: ['https://app.xinhuanet.com/news/article.html?articleId=2026101571510a6f00ce4d86887b7cc0664e3752', 'https://www.kaoyan.cn/school/222/plan/1417285'] },
  { id: 'beiligong', program: 'z', set: {
      f: '全日制1.5万元/年；非全日制9.8万元/学年（2027章程附件口径，第三方转述）', d: '2年',
      e: '2027年经济学院拟招：全日制3人、非全日制10人（第三方目录）', m: '396经济类综合' },
    note: '2027级：全日制与非全日制并行，非全学费显著高于全日制；初试396+431（第三方目录）',
    sources: ['https://www.eduego.com/zhaosheng/62946.html', 'https://soe.bit.edu.cn/rcpy/xsybs/tzgg1/2a124e6c2c6940df82094a574c40dd62.htm'] },
  { id: 'beishida', program: 'z', set: {
      e: '2027年湾区国际商学院（珠海）拟招70人，含推免约16（官方目录）', m: '396经济类综合' },
    note: '2027级：金融专硕仅湾区国际商学院（珠海校区）全日制招生，初试396+431（官方目录）；学制/学费在简章附件中，具体数值未取得',
    sources: ['https://yz.bnu.edu.cn/content/zyml/2027/ssxx_yxsm-045.html'] },
  { id: 'huazhongke', program: 'z', set: {
      f: '全日制6万元/年（第三方）', d: '2年',
      e: '2027年经济学院全日制统考拟招21人（第三方；含推免口径约39人）', m: '396经济类综合' },
    note: '2027级：第三方口径为经济学院全日制统考21人、非全10人，初试396+431；未检索到研究生院官网2027简章原文，建议官网复核',
    sources: ['https://www.kaoyan.cn/school/37/plan/1273890', 'http://www.shuoedu.com/article.php?id=435065'] },
  { id: 'jilindaxue', program: 'z', set: {
      f: '专业学位2年制全程2.4万元（全校统一标准，官方收费表）', d: '2年',
      e: '2027年统考拟招：经济学院14人、珠海研究院5人（第三方转载官方目录）', m: '396经济类综合' },
    note: '2027级：学费按全校专业学位2年制2.4万标准（官方）；经济学院官网确认金融为2年制；统考计划可能随推免录取调整',
    sources: ['http://yzb.jlu.edu.cn/info/1047/3678.htm', 'https://jjxy.jlu.edu.cn/info/1060/18799.htm'] },
  { id: 'zhongnanda', program: 'z', set: {
      f: '1.4万元/年（第三方）', d: '3年',
      e: '2027年商学院全日制拟招20人（不含推免，第三方目录）' },
    note: '2027级：商学院官网确认金融专硕全日制学制3年；学费与人数为第三方转载口径',
    sources: ['https://bs.csu.edu.cn/kjjrzs/xmjs/jrzs.htm', 'https://www.kaoyan.cn/school/51/plan/1241431'] },
  { id: 'chongqingda', program: 'z', set: {
      f: '非全日制3.9万/全程（第三方）；全日制未取得', d: '3年（非全日制，第三方）',
      e: '2027年经济与工商管理学院：全日制拟招15人（公招15、推免0）、非全日制10人（官方目录）', m: '396经济类综合' },
    note: '2027级：官方分学院目录确认全日制15人/非全10人、初试396+431；项目鼓励赴海外学习1-1.5年可获双学位',
    sources: ['https://yz.cqu.edu.cn/sszyml/2027/2.html'] },
  { id: 'shangjiao', program: 'z', set: {
      f: '高金全日制9.4万元/年（2027级由7.9万上调，官方公示）；高金非全32.8万/全程',
      d: '全日制2年；高金非全弹性2-3年',
      e: '2027年统考拟招：安泰19人+高金13人（第三方；另一口径合计26人，两源不一）' },
    note: '2027级：高金全日制学费官方上调至9.4万/年；高金新增非全日制金融硕士（2027年9月首期入学）；统考名额两机构口径不一（32 vs 26）',
    sources: ['https://saif.sjtu.edu.cn/show-138-779.html', 'https://www.gfedu.cn/jcmf/content_72854.shtml'] },
  { id: 'zhongshanda', program: 'z', set: {
      f: '全日制2.25万元/学年；非全日制10.6万元/学年（2027简章附件口径，第三方转载）',
      d: '全日制2-3年；非全日制3年',
      e: '2027年拟招：岭南学院（深圳经济研究院）全日制80人；国际金融学院全日制44人、非全日制17人（第三方转载官方目录）' },
    note: '2027级：金融专硕由岭南学院（深圳经济研究院）与国际金融学院两处招生；未查到025100全日制数学科目的明确官方表述',
    sources: ['https://souky.eol.cn/HomePage/school_prolist_231.html', 'https://c.460.net.cn/a/576190.html'] },
  { id: 'xianjiaotong', program: 'z', set: {
      f: '1.32万元/年（第三方）', d: '2-3年（第三方）',
      e: '2027年推免拟招20人（官方目录）；统考23-25人（第三方口径不一）' },
    note: '2027级：COT项目两方向（金融创新/金融科技）；初试303数学三+431；无停招/改考信息',
    sources: ['https://yzbm.xjtu.edu.cn/zsml/sszsml/detailtm/Ppu8Tbrbt8BWT%207TDfLD@g==?yxsdm=019&ml=&zydm=&xxfs=&dsbh=&key=', 'https://www.dddjyky.com/sejxk_dx.php?dx_id=762&ejxk_id=025100'] },
  { id: 'huadongshida', program: 'z', set: {
      f: '19.8万/全程（第三方目录）', d: '2年',
      e: '2027年统考拟招64人（第三方目录）', m: '396经济类综合' },
    note: '2027级：学院官方简介确认学制2年、初试396+431；统招64人与学费19.8万为第三方目录口径，建议官网复核',
    sources: ['https://www.sohu.com/a/1087914652_121106832', 'https://www.kaoyan.cn/school/261/plan/1300299'] },
  { id: 'shandongda', program: 'z', set: {
      f: '1.6万元/学年（第三方转载学制学费表）', d: '2年',
      e: '2027年商学院统考拟招6人（不含推免，第三方目录）' },
    note: '2027级：商学院初试396+431（第三方目录），经济研究院另招金融专硕（303数三口径，年份待核）；非全日制停招；统考名额很少',
    sources: ['https://www.kaoyan.cn/school/1377/plan/1518782', 'http://www.laishuokaoyan.com/forum.php?mod=viewthread&tid=302986'] },
  { id: 'nankai', program: 'z', set: {
      e: '2027年统考拟招：金融学院26人、国家创新与金融研究院30人（均全日制，第三方目录）' },
    note: '2027级：金融在金融学院与国家创新与金融研究院两个单位招生（26+30，不含推免，第三方聚合）；统考项目学费/学制未获可靠出处；南开-弗林德斯合办硕士为计划外自主招生，勿混淆',
    sources: ['https://m.kaoyan.cn/school/243/major'] },
  { id: 'nanda', program: 'z', set: {
      f: '1万元/年（第三方目录）', d: '3年',
      e: '2027年统考拟招：商学院10人、工程管理学院39人（第三方转载官方目录，两源一致）' },
    note: '2027级：两个招生单位科目不同——商学院考396经综+431（拟招10），工程管理学院考数三+431（拟招39）；学费/学制为第三方口径',
    sources: ['https://souky.eol.cn/web/school/schoolspecial?school_id=39', 'https://www.dddjyky.com/sejxk_dx.php?dx_id=3&ejxk_id=025100'] },
  { id: 'xiamenda', program: 'z', set: {
      f: '全日制3.3万/全程；非全日制15万/全程（官方简章）', d: '3年',
      e: '2027年全日制统考计划：金融系49人、王亚南经济研究院16人（官方，2026-10-10发布）' },
    note: '2027级：全日制与非全日制并行招生；金融系初试396+431、王亚南院英一+数三（第三方目录）；第三方目录人数（34/10）与官网统考计划（49/16）不一致，以官网为准',
    sources: ['https://zs.xmu.edu.cn/info/1174/36942.htm', 'https://zs.xmu.edu.cn/info/1055/37072.htm'] },
  { id: 'qhdx', program: 'z', set: {
      f: '五道口/经管（北京）12.8万/全程；深研院9万/全程（2027简章附表，第三方转载）',
      e: '2027年统考拟招：五道口金融学院35人、深圳国际研究生院29人（官方目录，均全日制）' },
    note: '2027级：官方目录确认两招生单位均考数三+431；学费按两年缴清（第三方转载简章附表）',
    sources: ['https://yzbm.tsinghua.edu.cn/publish/s02/s0203/detail/c0fb8664-255f-4d6f-bf40-a5893e3343ec?ksfs=&yxsdm=060', 'https://kaoyan.xdf.cn/202610/15426146.html'] },
  { id: 'fudan', program: 'z', set: {
      e: '2027年经济学院总计划177人（推免92、统招85）（第三方）' },
    note: '2027级：经济学院新增「国际金融（复旦-昂热双学位）」方向（复旦部分12.9万，学院官网）；国际金融学院非全AMF（单考）取消招生；大数据/数学/管理/国金学院仅招推免',
    sources: ['https://econ.fudan.edu.cn/info/1314/46037.htm', 'https://www.toutiao.com/article/7691602572070634030'] },
  { id: 'zheda', program: 'z', set: {
      f: '18万/全程（2026年经济学院口径，第三方）', d: '2年（2026年口径，第三方）',
      e: '2027年经济学院全日制拟招65人（不含推免，第三方目录）', m: '396经济类综合' },
    note: '2027级：官方简章确认学费见专业目录备注栏（未单列金融值）；初试396+431为第三方目录口径；2027官方学费/学制以专业目录备注为准',
    sources: ['https://www.kaoyan.cn/school/171/plan/1344823', 'http://www.grs.zju.edu.cn/yjszs/2026/0930/c28498a3210936/page.htm'] },
  { id: 'pkd', program: 'z', set: {
      f: '经济学院/光华/数学科学学院12.8万/全程（2027官方目录PDF）；深研院汇丰另计',
      d: '经济学院/光华/数院2年；深研院汇丰3年（官方）',
      e: '2027年深研院汇丰拟招170人（含推免119，官方）；经济学院统考17人、光华统考57人（第三方）' },
    note: '2027级：本部经院/光华/数院学费12.8万全程为官方PDF确认（纠正原「光华18.8万/经院10万」估算）；深研院汇丰金融学制3年、初试数三+431',
    sources: ['https://admission.pku.edu.cn/docs/20261008162609970607.pdf', 'https://admission.pkusz.edu.cn/info/1006/1384.htm'] },
  { id: 'renda', program: 'z', set: {
      f: '5.4万元/学年（财政金融学院金融，官方目录；全程约10.8万）',
      e: '2027年财金学院金融统考42人、金融科技29人（不含推免，第三方）' },
    note: '2027级：官方目录确认财金金融为396经综+431、学制2年、学费5.4万/学年（纠正原「约13万/全程」估算）；金融科技方向（0261S1）考数三、学费9.8万（官方）',
    sources: ['https://pgs.ruc.edu.cn/info/1041/3636.htm', 'https://www.kaoyan.cn/school/178/plan/1360377'] },
  { id: 'hunanda', program: 'z', set: {
      f: '1.68万元/学年（官方，经济学类专业学位）', d: '2年',
      e: '2027年金融与统计学院全日制拟招52人（不含推免，官方转载）', m: '396经济类综合' },
    note: '2027级：学费1.68万/年、学制2年、初试396+431，均为官方/官方转载口径',
    sources: ['https://gra.hnu.edu.cn/info/1075/10621.htm', 'https://www.toutiao.com/a7696028184151654946'] },
  { id: 'wuda', program: 'z', set: {
      f: '12万/全程（全日制，学院官方页）', d: '2年',
      e: '2027年全日制金融专硕招37人（含推免），统考拟招21人（学院官方）' },
    note: '2027级：全部字段来自经管学院官方2027页面；初试396+431无变更；南网专项仅接收推免、学制3年',
    sources: ['https://ems.whu.edu.cn/info/2023/309631.htm'] },
];

const files = ['batch1', 'batch2', 'batch3', 'batch4'].map(n => path.join(root, 'data', `${n}.json`));
const data = files.map(f => JSON.parse(fs.readFileSync(f, 'utf8')));

let touched = 0, missed = [];
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
    console.log(`${DRY ? '[dry] ' : ''}✓ ${s.name} ← ${Object.keys(p.set).join('/')}`);
  });
  if (!hit) { missed.push(p.id); console.warn(`  ! 未找到院校 ${p.id}`); }
}

if (!DRY) {
  files.forEach((f, i) => fs.writeFileSync(f, JSON.stringify(data[i], null, 2) + '\n', 'utf8'));
  console.log(`\n写入完成：${touched} 个招生方向已更新${missed.length ? '，未匹配：' + missed.join(',') : ''}`);
} else {
  console.log(`\n[dry] 预计更新 ${touched} 个招生方向（未写入磁盘）`);
}
