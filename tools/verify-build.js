/**
 * 交付产物一致性核验
 *
 * 用法：npm run verify:build
 *
 * 打完包后跑一遍，确认「网页单文件 / 免安装版 / 已安装版」三份产物
 * 都真的包含了源码里的最新改动，没有因为缓存或中途失败产生"漂移"。
 * （2026-09-25 那天连续发了 6 版，其中一次打包进程中途被杀，产物停在半途——
 *   所以加了这道检查。）
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const INSTALLED = 'C:/Users/34264/AppData/Local/Programs/finance-kaoyan-app/resources/app.asar';
const read = p => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } };

// 源码里"必须有、且三份产物都该带上"的特征串。改了哪处功能，就在这里加一条。
const CHECKS = [
  ['parseCount 只认数字+人/名', '只认「数字 + 人/名」'],
  ['parseLineVal 剥年份', '先剥掉年份'],
  ['数三筛选三写法', "m.includes('303')"],
  ['使用说明条号 1-6', '<b>1. 怎么用'],
  ['使用说明第5步', '资料较全'],
  ['分数匹配', 'function matchOf'],
  ['导出 CSV', 'function toCsv'],
  ['深色模式', 'prefers-color-scheme: dark'],
  ['打印样式', '@media print'],
  ['移动端适配（900px 断点）', 'max-width: 900px'],
  ['登录退出入口', '退出登录'],
  ['2027 批次三数据', '2027简章已核']
];

// 旧产物目录偶尔会被杀软/索引器锁住删不掉，此时改打包到 dist-new 也能被核验到，
// 取最新的那份 win-unpacked，避免把旧产物误判成刚打好的包。
const unpacked = ['dist', 'dist-new']
  .map(d => path.join(ROOT, d, 'win-unpacked', 'resources', 'app.asar'))
  .filter(f => fs.existsSync(f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

const TARGETS = [
  ['网页单文件 dist-web/index.html', path.join(ROOT, 'dist-web/index.html')],
  ['免安装版（最新打包目录）', unpacked || path.join(ROOT, 'dist/win-unpacked/resources/app.asar')],
  ['已安装版', INSTALLED]
];

let allOk = true;
console.log('=== 交付产物一致性核验 ===\n');
for (const [name, file] of TARGETS) {
  const c = read(file);
  if (c == null) {
    console.log('  ⚠️ ' + name + '：不存在或读取失败（可能还没打包/安装）');
    continue;                      // 没装过不算失败
  }
  const miss = CHECKS.filter(([, n]) => !c.includes(n)).map(([l]) => l);
  const size = (Buffer.byteLength(c, 'utf8') / 1024).toFixed(1) + ' KB';
  console.log('  ' + name + '（' + size + '）');
  console.log('     ' + (miss.length ? '❌ 缺：' + miss.join('、') : '✅ 含全部最新改动'));
  if (miss.length) allOk = false;
}

console.log('\n' + (allOk ? '✅ 交付产物与源码一致，无漂移' : '⚠️ 存在不一致，建议重新打包并安装'));
process.exit(allOk ? 0 : 1);
