/**
 * 数据版本迁移测试（不开窗口，用 Node 桩掉 electron 直接驱动真实的 main.js）
 *
 * 用法：node tools/test-migration.js
 *
 * 覆盖两种场景：
 *  A. 用户从未改过数据（v1.0.0 老数据）→ 整体替换为最新内置数据
 *  B. 用户改过数据 → 保守合并，保留用户修改，只补入新增院校
 * 两种情况都必须先生成 data.backup-*.json 备份。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const LEGACY_HASH = 'ea5d8b2c8b26bbea77939ce8a939a61b';

const results = [];
const check = (name, cond) => results.push([cond ? 'PASS' : 'FAIL', name]);
const skip = name => results.push(['SKIP', name]);
let skipCount = 0;

// 当前内置数据（作为期望值）
function bundledSchools() {
  return [1, 2, 3, 4].flatMap(i =>
    JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `batch${i}.json`), 'utf-8')));
}

/** 在指定目录里跑一次 main.js 的 data:load，返回 { data, dir } */
function runLoad(dir, seedData) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(seedData, null, 2), 'utf-8');

  const handlers = {};
  const origLoad = Module._load;
  Module._load = function (request) {
    if (request === 'electron') {
      return {
        app: { getPath: () => dir, whenReady: () => ({ then() {} }), on() {}, quit() {} },
        BrowserWindow: function () { return { loadFile() {}, setMenuBarVisibility() {} }; },
        ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; } },
        dialog: {},
        shell: { openPath() {} }
      };
    }
    return origLoad.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve(path.join(ROOT, 'main.js'))];
    require(path.join(ROOT, 'main.js'));
  } finally {
    Module._load = origLoad;
  }
  return { data: handlers['data:load'](), dir, handlers };
}

/** 造一份 v1.0.0 风格的老数据（无 dataVersion / seedHash） */
function legacySeed(schools) {
  return { version: 1, updatedAt: '2026-09-19T15:50:41.348Z', national: JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'national.json'), 'utf-8')), schools };
}

const tmpRoot = path.join(os.tmpdir(), 'kaoyan-mig-test');
const bundled = bundledSchools();

// ---------- 场景 A：老数据 = v1.0.0 原样（指纹匹配 LEGACY_HASH）----------
// v1.0.0 数据 = 仓库根提交里的 data/batch*.json。
// 注意：必须用根提交，不能用 HEAD~1 —— 每次新增提交都会让 HEAD~1 漂移。
let v1Schools = null;
try {
  const { execSync } = require('child_process');
  const root = execSync('git rev-list --max-parents=0 HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim().split('\n')[0];
  const files = [1, 2, 3, 4].map(i => execSync(`git show ${root}:data/batch${i}.json`, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }));
  v1Schools = files.flatMap(t => JSON.parse(t));
} catch (e) { /* git 不可用 */ }

const crypto = require('crypto');
const md5 = s => crypto.createHash('md5').update(JSON.stringify(s)).digest('hex');
const baselineOk = !!v1Schools && md5(v1Schools) === LEGACY_HASH;

if (baselineOk) {
  check('v1.0.0 数据指纹与 main.js 里的 LEGACY_SEED_HASH 一致', true);
} else {
  skip('取不到 v1.0.0 基线（git 不可用或历史被重写），跳过「未改过数据→整体替换」场景');
  skipCount++;
}

const dirA = path.join(tmpRoot, 'a');
const A = runLoad(dirA, legacySeed(v1Schools || bundled));
const filesA = fs.readdirSync(dirA);
check('A. 老数据被迁移（dataVersion → 2）', A.data.dataVersion === 2);
check('A. 院校数变为最新内置数量', A.data.schools.length === bundled.length);
check('A. 生成了 data.backup-*.json 备份', filesA.some(f => /^data\.backup-\d+\.json$/.test(f)));
check('A. 写入 seedHash 指纹', typeof A.data.seedHash === 'string' && A.data.seedHash.length === 32);
check('A. 备份文件内容为迁移前的院校数据', (() => {
  const bak = filesA.find(f => /^data\.backup-/.test(f));
  const expect = (v1Schools || bundled).length;
  return bak && JSON.parse(fs.readFileSync(path.join(dirA, bak), 'utf-8')).schools.length === expect;
})());
if (baselineOk) {
  check('A. 返回 _migration 提示信息（mode=replace）', A.data._migration && A.data._migration.mode === 'replace');
} else {
  skip('A. 未取得基线，无法断言 mode=replace');
  skipCount++;
}

// ---------- 场景 B：用户改过数据 ----------
const edited = JSON.parse(JSON.stringify(v1Schools || bundled));
edited[0].z = edited[0].z || {};
edited[0].z.nt = '【我自己加的备注】';
edited.push({ id: 'my-own-school', name: '我自己加的大学', prov: '北京', city: '北京', tags: [], y: '2026', z: { m: '303数学三' } });

const dirB = path.join(tmpRoot, 'b');
const B = runLoad(dirB, legacySeed(edited));
const bSchools = B.data.schools;
check('B. 走保守合并模式（mode=merge）', B.data._migration && B.data._migration.mode === 'merge');
check('B. 用户自己的备注被保留', (bSchools.find(s => s.id === edited[0].id).z.nt || '').includes('【我自己加的备注】'));
check('B. 用户自建院校被保留', bSchools.some(s => s.id === 'my-own-school'));
check('B. 新增院校已并入', bSchools.length > edited.length);
check('B. 同样生成了备份', fs.readdirSync(dirB).some(f => /^data\.backup-\d+\.json$/.test(f)));

// ---------- 场景 C：已是最新版本，不应重复迁移 ----------
// 注意：写进文件的是"落盘后的数据"，不含运行期才附加的 _migration
const diskA = JSON.parse(JSON.stringify(A.data));
delete diskA._migration;
const dirC = path.join(tmpRoot, 'c');
const C = runLoad(dirC, diskA);
check('C. 版本已是最新时不触发迁移', !C.data._migration);
check('C. 不重复生成备份', !fs.readdirSync(dirC).some(f => /^data\.backup-/.test(f)));
check('C. 院校数保持最新内置数量', C.data.schools.length === bundled.length);

fs.rmSync(tmpRoot, { recursive: true, force: true });

const fails = results.filter(r => r[0] === 'FAIL');
for (const [s, n] of results) console.log(s, '-', n);
const passed = results.filter(r => r[0] === 'PASS').length;
console.log(`\n通过 ${passed} 项，跳过 ${skipCount} 项，失败 ${fails.length} 项`);
console.log(fails.length ? '存在失败项' : '全部通过 ✔');
process.exit(fails.length ? 1 : 0);
