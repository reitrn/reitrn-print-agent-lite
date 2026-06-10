const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const http = require('http');
const Store = require('electron-store');
const { getInstalledPrinters, printRaw, generateTestLabel } = require('./printer');

const store = new Store();

let mainWindow = null;
let tray = null;
let recentJobs = (store.get('recentJobs', []) || []).map((j) => ({
  ...j,
  time: j.time ? new Date(j.time) : new Date(),
}));
let localServer = null;

const LOCAL_PORT = 3010;

// ── App setup ──────────────────────────────────────────────────────────────────

app.setName('reitrn Print Agent Lite');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('ready', () => {
  createTray();
  createWindow();
  startLocalServer();

  app.setLoginItemSettings({
    openAtLogin: store.get('autoStart', true),
    name: 'reitrn Print Agent Lite',
  });
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  if (localServer) localServer.close();
});

// ── Window ─────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 600,
    resizable: false,
    title: 'reitrn Print Agent Lite',
    backgroundColor: '#FFFFFF',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadFile('renderer/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── Tray ───────────────────────────────────────────────────────────────────────

function createTray() {
  const icon = path.join(__dirname, 'assets', 'icon.ico');
  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    { label: 'Open', click: () => { if (mainWindow) mainWindow.show(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.hide();
      else mainWindow.show();
    }
  });
}

// ── Local HTTP server ──────────────────────────────────────────────────────────
// Listens on localhost:3010 for print requests from reitrn.com

function startLocalServer() {
  localServer = http.createServer(handleRequest);
  localServer.listen(LOCAL_PORT, '127.0.0.1', () => {
    console.log(`[LocalServer] Listening on http://localhost:${LOCAL_PORT}`);
  });

  localServer.on('error', (err) => {
    console.error('[LocalServer] Failed to start:', err.message);
  });
}

function handleRequest(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      printer: store.get('printer', ''),
    }));
    return;
  }

  if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const job = JSON.parse(body);
        const printerName = store.get('printer', '');

        if (!printerName) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'No printer configured' }));
          return;
        }

        const localJobId = `local_${Date.now()}`;
        addRecentJob({
          id: localJobId,
          printer: printerName,
          status: 'printing',
          time: new Date(),
        });

        // Respond immediately
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));

        // Print in the background
        const data = job.data || job.zpl || job.tspl || '';
        if (!data) {
          console.warn('[LocalServer] No printable data in job');
          addRecentJob({
            id: localJobId,
            printer: printerName,
            status: 'error',
            time: new Date(),
            error: 'No printable data',
          });
          return;
        }

        printRaw(printerName, data)
          .then(() => {
            addRecentJob({
              id: localJobId,
              printer: printerName,
              status: 'done',
              time: new Date(),
            });
          })
          .catch((err) => {
            console.error('[LocalServer] Print failed:', err.message);
            addRecentJob({
              id: localJobId,
              printer: printerName,
              status: 'error',
              time: new Date(),
              error: err.message,
            });
          });
      } catch (err) {
        console.error('[LocalServer] Request error:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Not found' }));
}

// ── IPC handlers (communicate with renderer) ────────────────────────────────────

ipcMain.handle('getState', async () => {
  const printers = await getInstalledPrinters();
  return {
    printers,
    printer: store.get('printer', ''),
    autoStart: store.get('autoStart', true),
    recentJobs: recentJobs.slice(0, 20),
  };
});

ipcMain.handle('refreshPrinters', async () => {
  const printers = await getInstalledPrinters();
  return {
    printers,
    printer: store.get('printer', ''),
  };
});

ipcMain.handle('testPrint', async (event, printerName) => {
  try {
    const label = generateTestLabel();
    await printRaw(printerName, label);
    addRecentJob({
      id: `test_${Date.now()}`,
      printer: printerName,
      status: 'done',
      time: new Date(),
    });
    return true;
  } catch (err) {
    console.error('[TestPrint] Failed:', err.message);
    addRecentJob({
      id: `test_${Date.now()}`,
      printer: printerName,
      status: 'error',
      time: new Date(),
      error: err.message,
    });
    return false;
  }
});

ipcMain.handle('setSetting', async (event, key, value) => {
  store.set(key, value);
  if (key === 'autoStart') {
    app.setLoginItemSettings({
      openAtLogin: value,
      name: 'reitrn Print Agent Lite',
    });
  }
  if (key === 'printer') {
    store.set('printer', value);
  }
});

ipcMain.handle('minimizeToTray', () => {
  if (mainWindow) mainWindow.hide();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function addRecentJob(job) {
  recentJobs.unshift(job);
  if (recentJobs.length > 50) recentJobs.pop();
  store.set('recentJobs', recentJobs);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('jobsUpdate', recentJobs.slice(0, 20));
  }
}
