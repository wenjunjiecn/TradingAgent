import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import kill from 'tree-kill';

let mainWindow: BrowserWindow | null;
const devProcesses: ChildProcess[] = [];
const MASTRA_API_URL = 'http://localhost:4111';
const RENDERER_DEV_URL = 'http://localhost:3000';
const DESKTOP_ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_ROOT = path.resolve(DESKTOP_ROOT, '..', '..');
const PRELOAD_PATH = path.join(__dirname, '..', 'preload', 'index.js');
const RENDERER_ENTRY = path.join(DESKTOP_ROOT, 'dist', 'renderer', 'index.html');
const LOADING_SCREEN = path.join(DESKTOP_ROOT, 'loading.html');

function checkUrlReady(url: string, callback: (ready: boolean) => void) {
  const req = http.get(url, (res) => {
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

function startDevProcess(label: string, scriptName: string, env: NodeJS.ProcessEnv = {}) {
  console.log(`Starting ${label} in:`, PROJECT_ROOT);

  const childProcess = spawn('npm', ['run', scriptName], {
    cwd: PROJECT_ROOT,
    shell: true,
    env: { ...process.env, ...env },
  });

  devProcesses.push(childProcess);

  if (childProcess.stdout) {
    childProcess.stdout.on('data', (data) => {
      console.log(`[${label} Out]: ${data}`);
    });
  }

  if (childProcess.stderr) {
    childProcess.stderr.on('data', (data) => {
      console.error(`[${label} Err]: ${data}`);
    });
  }

  childProcess.on('close', (code) => {
    console.log(`${label} process exited with code ${code}`);
    const index = devProcesses.indexOf(childProcess);
    if (index >= 0) {
      devProcesses.splice(index, 1);
    }
  });

  return childProcess;
}

function loadRenderer() {
  if (!mainWindow) {
    return;
  }

  if (app.isPackaged) {
    mainWindow.loadFile(RENDERER_ENTRY);
    return;
  }

  mainWindow.loadURL(RENDERER_DEV_URL);
}

function pollRendererAndLoad() {
  const interval = setInterval(() => {
    checkUrlReady(RENDERER_DEV_URL, (ready) => {
      if (ready) {
        clearInterval(interval);
        console.log('Renderer is ready! Loading application.');
        loadRenderer();
      }
    });
  }, 1000);
}

function startMissingDevServices() {
  if (app.isPackaged) {
    loadRenderer();
    return;
  }

  checkUrlReady(MASTRA_API_URL, (apiRunning) => {
    if (apiRunning) {
      console.log('Mastra API already running.');
    } else {
      startDevProcess('Mastra API', 'dev:agent', { PORT: '4111' });
    }

    checkUrlReady(RENDERER_DEV_URL, (rendererRunning) => {
      if (rendererRunning) {
        console.log('Renderer dev server already running, connecting...');
        loadRenderer();
        return;
      }

      console.log('Renderer dev server not running. Starting Vite and loading splash screen...');
      if (mainWindow) {
        mainWindow.loadFile(LOADING_SCREEN);
      }
      startDevProcess('Renderer', 'dev:renderer', { MASTRA_SERVER_HOST: '127.0.0.1', MASTRA_SERVER_PORT: '4111' });
      pollRendererAndLoad();
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 900,
    title: 'Trading Agent',
    show: false, // Don't show until ready-to-show
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  startMissingDevServices();

  // Inject shell-only CSS on dom-ready. UI text is owned by the renderer.
  mainWindow.webContents.on('dom-ready', () => {
    if (mainWindow) {
      console.log('DOM ready event fired, injecting Electron shell styles...');

      // Inject CSS to add top padding for macOS traffic lights and make the region draggable
      const customStyles = `
        .sidebar-layout {
          padding-top: 36px !important;
          -webkit-app-region: drag !important;
        }
        .sidebar-layout > * {
          -webkit-app-region: no-drag !important;
        }
        :root,
        :root * {
          view-transition-name: none !important;
        }
        ::view-transition,
        ::view-transition-group(*),
        ::view-transition-image-pair(*),
        ::view-transition-old(*),
        ::view-transition-new(*) {
          animation: none !important;
          pointer-events: none !important;
        }
      `;
      
      mainWindow.webContents.insertCSS(customStyles)
        .then(() => console.log('Custom CSS successfully injected!'))
        .catch(err => console.error('Failed to inject CSS:', err));

      mainWindow.webContents.executeJavaScript(shellCompatibilityScript)
        .then(() => console.log('Shell compatibility script successfully injected!'))
        .catch(err => console.error('Failed to inject shell compatibility script:', err));
    }
  });

  // Redirect console messages from renderer to main process terminal
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR'];
    console.log(`[Browser Console - ${levels[level] || 'LOG'}]: ${message} (at ${sourceId}:${line})`);
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
  if (devProcesses.length > 0) {
    console.log('Killing development process trees...');
    let pending = devProcesses.length;
    for (const childProcess of [...devProcesses]) {
      if (!childProcess.pid) {
        pending -= 1;
        continue;
      }

      kill(childProcess.pid, 'SIGKILL', (err) => {
        if (err) {
          console.error('Error killing process tree:', err);
        }
        pending -= 1;
        if (pending === 0) {
          app.quit();
        }
      });
    }

    if (pending === 0) {
      app.quit();
    }
  } else {
    app.quit();
  }
});

app.on('before-quit', () => {
  for (const childProcess of [...devProcesses]) {
    if (childProcess.pid) {
      kill(childProcess.pid, 'SIGTERM', (err) => {
        if (err) {
          console.error('Error terminating process tree:', err);
        }
      });
    }
  }
});

const shellCompatibilityScript = `
  (function() {
    if (window.__tradingAgentShellCompatibilityLoaded) {
      return;
    }
    window.__tradingAgentShellCompatibilityLoaded = true;

    try {
      if ('startViewTransition' in document) {
        Object.defineProperty(document, 'startViewTransition', {
          configurable: true,
          value: function(updateCallback) {
            let updateResult;
            try {
              updateResult = typeof updateCallback === 'function' ? updateCallback() : undefined;
            } catch (error) {
              const rejected = Promise.reject(error);
              return {
                ready: rejected,
                updateCallbackDone: rejected,
                finished: rejected,
                skipTransition: function() {}
              };
            }

            const done = Promise.resolve(updateResult);
            return {
              ready: done,
              updateCallbackDone: done,
              finished: done,
              skipTransition: function() {}
            };
          }
        });
        console.log("View transitions disabled for Electron shell compatibility.");
      }
    } catch (error) {
      console.error("Failed to disable view transitions:", error);
    }
  })();
`;
