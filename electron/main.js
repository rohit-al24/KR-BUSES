import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

async function startBackend() {
  try {
    // Importing the server will start the Express app (it is ESM)
    // We use a dynamic import so Electron can control when backend starts.
    // eslint-disable-next-line global-require
    await import(path.join(__dirname, '..', 'src', 'server.js'));
    console.log('Backend started (embedded)');
  } catch (err) {
    console.error('Failed to start backend embedded:', err && err.message ? err.message : err);
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Try to load the dev server if provided, otherwise load the built files
  const devUrl = process.env.DEV_SERVER_URL || 'http://localhost:8080';
  try {
    await mainWindow.loadURL(devUrl);
    console.log('Loaded dev URL', devUrl);
  } catch (e) {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    await mainWindow.loadFile(indexPath);
    console.log('Loaded built index.html');
  }
}

app.whenReady().then(async () => {
  // Start backend first, then UI
  await startBackend();
  await createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
