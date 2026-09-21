const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;

function dataDir() {
  return app.getPath('userData');
}
function dataFile() {
  return path.join(dataDir(), 'data.json');
}

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
  return { version: 1, updatedAt: new Date().toISOString(), national, schools };
}

ipcMain.handle('data:load', () => {
  ensureData();
  return JSON.parse(fs.readFileSync(dataFile(), 'utf-8'));
});

ipcMain.handle('data:save', (e, data) => {
  ensureData();
  fs.writeFileSync(dataFile(), JSON.stringify(data, null, 2), 'utf-8');
  return true;
});

ipcMain.handle('data:reset', () => {
  const seed = readBundledData();
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
