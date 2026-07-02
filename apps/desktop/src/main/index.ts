import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import { randomBytes } from 'crypto';
import kill from 'tree-kill';

let mainWindow: BrowserWindow | null;
const devProcesses: ChildProcess[] = [];
const MASTRA_SERVER_HOST = '127.0.0.1';
const MASTRA_SERVER_PORT = process.env.MASTRA_SERVER_PORT || process.env.PORT || '4111';
const DESKTOP_AUTH_TOKEN = process.env.TRADING_AGENT_DESKTOP_TOKEN || randomBytes(32).toString('hex');
process.env.TRADING_AGENT_DESKTOP_TOKEN = DESKTOP_AUTH_TOKEN;
const MASTRA_API_URL = `http://${MASTRA_SERVER_HOST}:${MASTRA_SERVER_PORT}`;
const MASTRA_AGENTS_URL = `${MASTRA_API_URL}/api/agents`;
const RENDERER_DEV_URL = 'http://localhost:3000';
const DESKTOP_ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_ROOT = path.resolve(DESKTOP_ROOT, '..', '..');
const PRELOAD_PATH = path.join(__dirname, '..', 'preload', 'index.js');
const RENDERER_ENTRY = path.join(DESKTOP_ROOT, 'dist', 'renderer', 'index.html');
const LOADING_SCREEN = path.join(DESKTOP_ROOT, 'loading.html');
const EMBEDDED_SERVER_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'agent-server')
  : path.join(PROJECT_ROOT, 'apps', 'agent-server', '.mastra', 'output');
const EMBEDDED_SERVER_ENTRY = path.join(EMBEDDED_SERVER_DIR, 'index.mjs');

function checkUrlReady(url: string, callback: (ready: boolean) => void, timeoutMs = 2500) {
  let settled = false;
  const finish = (ready: boolean) => {
    if (settled) {
      return;
    }
    settled = true;
    callback(ready);
  };

  const req = http.get(url, (res) => {
    res.resume();
    if (res.statusCode === 200) {
      finish(true);
    } else {
      finish(false);
    }
  });

  req.on('error', () => {
    finish(false);
  });

  req.setTimeout(timeoutMs, () => {
    req.destroy();
    finish(false);
  });

  req.end();
}

function waitForUrlReady(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const poll = () => {
      checkUrlReady(url, (ready) => {
        if (ready) {
          resolve();
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(poll, 500);
      });
    };

    poll();
  });
}

function checkTradingAgentReady(callback: (ready: boolean) => void) {
  let settled = false;
  const finish = (ready: boolean) => {
    if (settled) {
      return;
    }
    settled = true;
    callback(ready);
  };

  const req = http.get(MASTRA_AGENTS_URL, {
    headers: {
      'x-trading-agent-token': DESKTOP_AUTH_TOKEN,
    },
  }, (res) => {
    if (res.statusCode !== 200) {
      res.resume();
      finish(false);
      return;
    }

    let body = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      body += chunk;
    });
    res.on('end', () => {
      finish(body.includes('"trading-agent"'));
    });
  });

  req.on('error', () => {
    finish(false);
  });

  req.setTimeout(2500, () => {
    req.destroy();
    finish(false);
  });

  req.end();
}

function waitForTradingAgentReady(timeoutMs: number): Promise<void> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const poll = () => {
      checkTradingAgentReady((ready) => {
        if (ready) {
          resolve();
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for embedded Trading Agent at ${MASTRA_AGENTS_URL}`));
          return;
        }

        setTimeout(poll, 500);
      });
    };

    poll();
  });
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

  childProcess.on('error', (error) => {
    console.error(`${label} process failed to start:`, error);
  });

  return childProcess;
}

function startEmbeddedAgentServer() {
  if (!fs.existsSync(EMBEDDED_SERVER_ENTRY)) {
    throw new Error(`Embedded Mastra server entry not found: ${EMBEDDED_SERVER_ENTRY}`);
  }

  const serverDataDir = path.join(app.getPath('userData'), 'agent-server');
  fs.mkdirSync(serverDataDir, { recursive: true });

  console.log('Starting embedded Mastra API from:', EMBEDDED_SERVER_ENTRY);

  const childProcess = spawn(process.execPath, [EMBEDDED_SERVER_ENTRY], {
    cwd: serverDataDir,
    shell: false,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      HOST: MASTRA_SERVER_HOST,
      PORT: MASTRA_SERVER_PORT,
      MASTRA_SERVER_HOST,
      MASTRA_SERVER_PORT,
    },
  });

  devProcesses.push(childProcess);

  if (childProcess.stdout) {
    childProcess.stdout.on('data', (data) => {
      console.log(`[Embedded Mastra API Out]: ${data}`);
    });
  }

  if (childProcess.stderr) {
    childProcess.stderr.on('data', (data) => {
      console.error(`[Embedded Mastra API Err]: ${data}`);
    });
  }

  childProcess.on('close', (code) => {
    console.log(`Embedded Mastra API process exited with code ${code}`);
    const index = devProcesses.indexOf(childProcess);
    if (index >= 0) {
      devProcesses.splice(index, 1);
    }
  });

  childProcess.on('error', (error) => {
    console.error('Embedded Mastra API process failed to start:', error);
  });

  return childProcess;
}

function loadLoadingScreen() {
  if (!mainWindow) {
    return;
  }

  mainWindow.loadFile(LOADING_SCREEN, {
    query: {
      port: MASTRA_SERVER_PORT,
    },
  });
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

function showStartupError(error: unknown) {
  console.error('Failed to start Trading Agent desktop shell:', error);
  if (!mainWindow) {
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Trading Agent Startup Error</title>
        <style>
          body {
            margin: 0;
            height: 100vh;
            display: grid;
            place-items: center;
            background: #101113;
            color: #f4f4f5;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          main {
            width: min(560px, calc(100vw - 48px));
            line-height: 1.5;
          }
          h1 {
            font-size: 20px;
            margin: 0 0 12px;
          }
          pre {
            overflow: auto;
            border: 1px solid #303236;
            border-radius: 8px;
            padding: 12px;
            background: #181a1f;
            color: #d4d4d8;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Trading Agent failed to start</h1>
          <pre>${message.replace(/[<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[char] ?? char)}</pre>
        </main>
      </body>
    </html>
  `)}`);
}

function pollRendererAndLoad() {
  const startedAt = Date.now();
  const interval = setInterval(() => {
    checkUrlReady(RENDERER_DEV_URL, (ready) => {
      if (ready) {
        clearInterval(interval);
        console.log('Renderer is ready! Loading application.');
        loadRenderer();
      }
    });

    if (Date.now() - startedAt >= 60_000) {
      clearInterval(interval);
      showStartupError(new Error(`Timed out waiting for renderer dev server at ${RENDERER_DEV_URL}`));
    }
  }, 1000);
}

function startMissingDevServices() {
  if (app.isPackaged) {
    loadLoadingScreen();

    waitForTradingAgentReady(1000)
      .catch(() => {
        startEmbeddedAgentServer();
        return waitForTradingAgentReady(60000);
      })
      .then(() => {
        console.log('Embedded Mastra API is ready. Loading application.');
        loadRenderer();
      })
      .catch((error) => {
        showStartupError(error);
      });
    return;
  }

  checkTradingAgentReady((apiRunning) => {
    if (apiRunning) {
      console.log('Mastra API already running.');
    } else {
      startDevProcess('Mastra API', 'dev:agent', {
        HOST: MASTRA_SERVER_HOST,
        PORT: MASTRA_SERVER_PORT,
        TRADING_AGENT_DESKTOP_TOKEN: DESKTOP_AUTH_TOKEN,
      });
    }

    checkUrlReady(RENDERER_DEV_URL, (rendererRunning) => {
      if (rendererRunning) {
        console.log('Renderer dev server already running, connecting...');
        loadRenderer();
        return;
      }

      console.log('Renderer dev server not running. Starting Vite and loading splash screen...');
      loadLoadingScreen();
      startDevProcess('Renderer', 'dev:renderer', {
        MASTRA_SERVER_HOST,
        MASTRA_SERVER_PORT,
        TRADING_AGENT_DESKTOP_TOKEN: DESKTOP_AUTH_TOKEN,
      });
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
