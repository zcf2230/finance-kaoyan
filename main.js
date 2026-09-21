const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let win = null;

// 内置数据版本：每次批量更新 data/*.json 后 +1，安装版启动时会自动迁移到新数据
const DATA_VERSION = 2;
// v1.0.0 内置 schools 的指纹（无 dataVersion 的老数据靠它判断"用户有没有改过"）
const LEGACY_SEED_HASH = 'ea5d8b2c8b26bbea77939ce8a939a61b';

function dataDir() {
  return app.getPath('userData');
}
function dataFile() {
  return path.join(dataDir(), 'data.json');
}
const hashSchools = schools => crypto.createHash('md5').update(JSON.stringify(schools)).digest('hex');

// 首次启动：把内置默认数据拷贝到用户数据目录，之后用户在应用内的编辑都写到这里
function ensureData() {
  const file = dataFile();
  if (!fs.existsSync(file)) {
    const seed = readBundledData();
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(seed, null, 2), 'utf-8');
  }
}

function readBundledData() {
  const dir = path.join(__dirname, 'data');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
  const national = read('national.json');
  const schools = []
    .concat(read('batch1.json'), read('batch2.json'), read('batch3.json'), read('batch4.json'));
  return {
    version: 1,
    dataVersion: DATA_VERSION,
    seedHash: hashSchools(schools),
    updatedAt: new Date().toISOString(),
    national,
    schools
  };
}

// 迁移前先备份用户数据，绝不静默丢数据
function backupUserData() {
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, '').replace(/[-:T]/g, '');
  const bak = path.join(dataDir(), `data.backup-${stamp}.json`);
  try { fs.copyFileSync(dataFile(), bak); } catch (e) { return null; }
  return bak;
}

/**
 * 把用户数据升级到当前内置数据版本。
 * - 用户从未改过数据（指纹匹配，含 v1.0.0 老数据）→ 整体替换为最新内置数据；
 * - 用户改过数据 → 保守合并：保留用户已有院校的字段，只补入新增院校，不覆盖用户的修改。
 */
function migrateData(user, seed) {
  const from = user.dataVersion || 0;
  if (from >= seed.dataVersion) return { data: user, info: null };

  const userSchools = Array.isArray(user.schools) ? user.schools : [];
  const untouched = user.seedHash
    ? user.seedHash === hashSchools(userSchools)
    : (!user.seedHash && hashSchools(userSchools) === LEGACY_SEED_HASH);

  const backup = backupUserData();

  let schools, mode, kept;
  if (untouched) {
    schools = seed.schools;
    mode = 'replace';
    kept = 0;
  } else {
    const have = new Set(userSchools.map(s => s.id));
    const added = seed.schools.filter(s => !have.has(s.id));
    schools = userSchools.concat(added);
    mode = 'merge';
    kept = userSchools.length;
  }

  const merged = {
    version: seed.version,
    dataVersion: seed.dataVersion,
    seedHash: hashSchools(schools),
    updatedAt: new Date().toISOString(),
    national: seed.national,
    schools
  };
  fs.writeFileSync(dataFile(), JSON.stringify(merged, null, 2), 'utf-8');
  return {
    data: merged,
    info: { from, to: seed.dataVersion, mode, backup, kept, total: schools.length }
  };
}

ipcMain.handle('data:load', () => {
  ensureData();
  const user = JSON.parse(fs.readFileSync(dataFile(), 'utf-8'));
  const { data, info } = migrateData(user, readBundledData());
  return info ? Object.assign({}, data, { _migration: info }) : data;
});

ipcMain.handle('data:save', (e, data) => {
  ensureData();
  if (data && data._migration) delete data._migration;
  if (data) data.seedHash = hashSchools(data.schools || []);
  fs.writeFileSync(dataFile(), JSON.stringify(data, null, 2), 'utf-8');
  return true;
});

ipcMain.handle('data:reset', () => {
  const seed = readBundledData();
  backupUserData();
  fs.writeFileSync(dataFile(), JSON.stringify(seed, null, 2), 'utf-8');
  return seed;
});

ipcMain.handle('data:export', async (e, data) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出数据备份',
    defaultPath: 'kaoyan-data-backup.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
});

ipcMain.handle('data:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: '导入数据备份',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths.length) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
    if (!Array.isArray(data.schools) || !data.national) throw new Error('格式不正确');
    fs.writeFileSync(dataFile(), JSON.stringify(data, null, 2), 'utf-8');
    return data;
  } catch (err) {
    return { error: '导入失败：' + err.message };
  }
});

ipcMain.handle('data:openDir', () => {
  ensureData();
  require('electron').shell.openPath(dataDir());
});

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: '金融考研择校通',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  ensureData();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
