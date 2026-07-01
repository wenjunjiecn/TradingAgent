const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const kill = require('tree-kill');

let mainWindow;
let serverProcess = null;
const SERVER_URL = 'http://localhost:4111';
const PROJECT_ROOT = path.join(__dirname, '..', '..');

function checkServerReady(callback) {
  const req = http.get(SERVER_URL, (res) => {
    if (res.statusCode === 200) {
      callback(true);
    } else {
      callback(false);
    }
  });

  req.on('error', () => {
    callback(false);
  });

  req.end();
}

function startMastraServer() {
  console.log('Starting Mastra server in:', PROJECT_ROOT);
  
  // Start Mastra dev server using npm workspace script
  serverProcess = spawn('npm', ['run', 'dev:agent'], {
    cwd: PROJECT_ROOT,
    shell: true,
    env: { ...process.env, PORT: '4111' }
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Mastra Out]: ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Mastra Err]: ${data}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`Mastra process exited with code ${code}`);
  });
}

function pollServerAndLoad() {
  const interval = setInterval(() => {
    checkServerReady((ready) => {
      if (ready) {
        clearInterval(interval);
        console.log('Server is ready! Loading application.');
        mainWindow.loadURL(SERVER_URL);
      }
    });
  }, 1000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 900,
    title: 'Trading Agent',
    show: false, // Don't show until ready-to-show
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Check if server is already running
  checkServerReady((running) => {
    if (running) {
      console.log('Mastra server already running, connecting...');
      mainWindow.loadURL(SERVER_URL);
    } else {
      console.log('Mastra server not running. Starting server and loading splash screen...');
      mainWindow.loadFile(path.join(__dirname, 'loading.html'));
      startMastraServer();
      pollServerAndLoad();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Clean up server process when app closes
  if (serverProcess && serverProcess.pid) {
    console.log('Killing Mastra server process tree...');
    kill(serverProcess.pid, 'SIGKILL', (err) => {
      if (err) {
        console.error('Error killing process tree:', err);
      }
      app.quit();
    });
  } else {
    app.quit();
  }
});
