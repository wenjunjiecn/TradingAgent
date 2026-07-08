import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import { randomBytes } from 'crypto';
import kill from 'tree-kill';

// ── EPIPE 防护 ────────────────────────────────────────────────────────
// 在关闭/重启过程中，子进程 stdout 的数据仍会触发 console.log，
// 但主进程自身的 stdout 管道可能已断开，导致未捕获的 EPIPE 异常。
// 拦截 process.stdout/stderr 的 error 事件，阻止崩溃。
process.stdout?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return;
  throw err;
});
process.stderr?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return;
  throw err;
});

/** 安全日志输出，捕获 EPIPE 防止未捕获异常 */
function safeLog(...args: unknown[]): void {
  try {
    console.log(...args);
  } catch (err: any) {
    if (err?.code !== 'EPIPE') throw err;
  }
}
function safeError(...args: unknown[]): void {
  try {
    console.error(...args);
  } catch (err: any) {
    if (err?.code !== 'EPIPE') throw err;
  }
}

let mainWindow: BrowserWindow | null;
let isLoadingScreenActive = false;
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

const POLL_INTERVAL_MS = 200; // 缩短轮询间隔，减少就绪检测延迟

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

        setTimeout(poll, POLL_INTERVAL_MS);
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

        setTimeout(poll, POLL_INTERVAL_MS);
      });
    };

    poll();
  });
}

function startDevProcess(label: string, scriptName: string, env: NodeJS.ProcessEnv = {}) {
  safeLog(`Starting ${label} in:`, PROJECT_ROOT);

  const childProcess = spawn('npm', ['run', scriptName], {
    cwd: PROJECT_ROOT,
    shell: true,
    env: { ...process.env, ...env },
  });

  devProcesses.push(childProcess);

  if (childProcess.stdout) {
    childProcess.stdout.on('data', (data) => {
      safeLog(`[${label} Out]: ${data}`);
    });
    childProcess.stdout.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') safeError(`${label} stdout error:`, err);
    });
  }

  if (childProcess.stderr) {
    childProcess.stderr.on('data', (data) => {
      safeError(`[${label} Err]: ${data}`);
    });
    childProcess.stderr.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') safeError(`${label} stderr error:`, err);
    });
  }

  childProcess.on('close', (code) => {
    safeLog(`${label} process exited with code ${code}`);
    const index = devProcesses.indexOf(childProcess);
    if (index >= 0) {
      devProcesses.splice(index, 1);
    }
  });

  childProcess.on('error', (error) => {
    safeError(`${label} process failed to start:`, error);
  });

  return childProcess;
}

function startEmbeddedAgentServer() {
  if (!fs.existsSync(EMBEDDED_SERVER_ENTRY)) {
    throw new Error(`Embedded Mastra server entry not found: ${EMBEDDED_SERVER_ENTRY}`);
  }

  const serverDataDir = path.join(app.getPath('userData'), 'agent-server');
  fs.mkdirSync(serverDataDir, { recursive: true });

  safeLog('Starting embedded Mastra API from:', EMBEDDED_SERVER_ENTRY);

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
      safeLog(`[Embedded Mastra API Out]: ${data}`);
    });
    childProcess.stdout.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') safeError('Embedded Mastra API stdout error:', err);
    });
  }

  if (childProcess.stderr) {
    childProcess.stderr.on('data', (data) => {
      safeError(`[Embedded Mastra API Err]: ${data}`);
    });
    childProcess.stderr.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') safeError('Embedded Mastra API stderr error:', err);
    });
  }

  childProcess.on('close', (code) => {
    safeLog(`Embedded Mastra API process exited with code ${code}`);
    const index = devProcesses.indexOf(childProcess);
    if (index >= 0) {
      devProcesses.splice(index, 1);
    }
  });

  childProcess.on('error', (error) => {
    safeError('Embedded Mastra API process failed to start:', error);
  });

  return childProcess;
}

function loadLoadingScreen() {
  if (!mainWindow) {
    return;
  }

  isLoadingScreenActive = true;
  mainWindow.loadFile(LOADING_SCREEN, {
    query: {
      port: MASTRA_SERVER_PORT,
    },
  });
}

/** Send a status update to the loading screen (progress bar + text). */
function updateLoadingStatus(percent: number, label: string, detail?: string): void {
  if (!mainWindow || !isLoadingScreenActive) {
    return;
  }

  const escapedLabel = label.replace(/'/g, "\\'");
  const escapedDetail = (detail || '').replace(/'/g, "\\'");
  mainWindow.webContents.executeJavaScript(
    `window.__tradingAgentLoading && window.__tradingAgentLoading.update(${percent}, '${escapedLabel}', '${escapedDetail}');`
  ).catch(() => { /* loading screen may not be ready yet */ });
}

function loadRenderer() {
  if (!mainWindow) {
    return;
  }

  isLoadingScreenActive = false;

  if (app.isPackaged) {
    mainWindow.loadFile(RENDERER_ENTRY);
    return;
  }

  mainWindow.loadURL(RENDERER_DEV_URL);
}

/** Fade out the loading screen, then load the renderer. */
async function fadeOutAndLoadRenderer(): Promise<void> {
  if (!mainWindow) {
    return;
  }

  // If the loading screen is active, trigger its fade-out transition first.
  if (isLoadingScreenActive) {
    try {
      await mainWindow.webContents.executeJavaScript(
        'window.__tradingAgentLoading && window.__tradingAgentLoading.fadeOut();'
      );
    } catch {
      // If executeJavaScript fails, proceed immediately.
    }
  }

  loadRenderer();
}

function showStartupError(error: unknown) {
  console.error('Failed to start Trading Agent desktop shell:', error);
  if (!mainWindow) {
    return;
  }

  const message = error instanceof Error ? error.message : String(error);

  // If the loading screen is active, use its built-in error state for a consistent UI.
  if (isLoadingScreenActive) {
    const escapedMessage = message.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
    mainWindow.webContents.executeJavaScript(
      `window.__tradingAgentLoading && window.__tradingAgentLoading.showError('${escapedMessage}');`
    ).catch(() => {
      // Fallback: load a data URL error page.
      isLoadingScreenActive = false;
      loadErrorPage(message);
    });
    return;
  }

  loadErrorPage(message);
}

function loadErrorPage(message: string): void {
  if (!mainWindow) {
    return;
  }
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
            background: #09090b;
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
            background: #18181b;
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

function startMissingDevServices() {
  if (app.isPackaged) {
    loadLoadingScreen();

    updateLoadingStatus(10, 'Checking server…');

    waitForTradingAgentReady(1000)
      .catch(() => {
        updateLoadingStatus(20, 'Starting agent server…');
        startEmbeddedAgentServer();

        // Progress animation while the embedded server boots.
        let bootProgress = 25;
        const bootTimer = setInterval(() => {
          if (bootProgress < 80) {
            bootProgress += 1;
            updateLoadingStatus(bootProgress, 'Starting agent server…', `Booting (${bootProgress}%)`);
          }
        }, 800);

        return waitForTradingAgentReady(60000).finally(() => {
          clearInterval(bootTimer);
        });
      })
      .then(() => {
        console.log('Embedded Mastra API is ready. Loading application.');
        updateLoadingStatus(95, 'Server ready', 'Loading application…');
        fadeOutAndLoadRenderer();
      })
      .catch((error) => {
        showStartupError(error);
      });
    return;
  }

  // ── Dev mode ──────────────────────────────────────────────────────
  // 立即显示 loading screen，不等 agent-server 检查完毕
  loadLoadingScreen();
  updateLoadingStatus(5, 'Starting…');

  // 并行检查 agent-server 和 renderer 的就绪状态
  // 之前是串行嵌套（agent 检查 → renderer 检查 → 启动 Vite），浪费大量等待时间
  let apiReady = false;
  let rendererReady = false;
  let apiAlreadyRunning = false;
  let rendererAlreadyRunning = false;

  const tryFinish = () => {
    if (apiReady && rendererReady) {
      updateLoadingStatus(100, 'Ready', 'Launching…');
      fadeOutAndLoadRenderer();
    }
  };

  // ── 检查/启动 Agent API ───────────────────────────────────────────
  checkTradingAgentReady((running) => {
    if (running) {
      console.log('Mastra API already running.');
      apiAlreadyRunning = true;
      apiReady = true;
      tryFinish();
      return;
    }

    updateLoadingStatus(15, 'Starting Mastra API…');
    startDevProcess('Mastra API', 'dev:agent', {
      HOST: MASTRA_SERVER_HOST,
      PORT: MASTRA_SERVER_PORT,
      TRADING_AGENT_DESKTOP_TOKEN: DESKTOP_AUTH_TOKEN,
    });

    // 轮询等待 API 就绪
    const apiStartedAt = Date.now();
    const apiInterval = setInterval(() => {
      checkTradingAgentReady((ready) => {
        if (ready) {
          clearInterval(apiInterval);
          apiReady = true;
          tryFinish();
        }
      });

      if (Date.now() - apiStartedAt >= 60_000) {
        clearInterval(apiInterval);
        showStartupError(new Error(`Timed out waiting for Mastra API at ${MASTRA_AGENTS_URL}`));
      }
    }, POLL_INTERVAL_MS);
  });

  // ── 检查/启动 Vite Renderer（与 API 并行） ────────────────────────
  checkUrlReady(RENDERER_DEV_URL, (running) => {
    if (running) {
      console.log('Renderer dev server already running.');
      rendererAlreadyRunning = true;
      rendererReady = true;
      tryFinish();
      return;
    }

    // 如果两个都在线，上面两个回调会各自触发 tryFinish
    // 如果 renderer 不在线，启动 Vite
    if (apiAlreadyRunning || rendererAlreadyRunning) {
      // 另一个已经在线，只需启动 Vite
    }
    updateLoadingStatus(30, 'Starting dev server…');
    startDevProcess('Renderer', 'dev:renderer', {
      MASTRA_SERVER_HOST,
      MASTRA_SERVER_PORT,
      TRADING_AGENT_DESKTOP_TOKEN: DESKTOP_AUTH_TOKEN,
    });

    // Animate progress while Vite boots.
    let viteProgress = 35;
    const viteTimer = setInterval(() => {
      if (viteProgress < 85) {
        viteProgress += 2;
        updateLoadingStatus(viteProgress, 'Starting dev server…', 'Bundling…');
      }
    }, 1000);

    // Poll for renderer readiness
    const rendererStartedAt = Date.now();
    const rendererInterval = setInterval(() => {
      checkUrlReady(RENDERER_DEV_URL, (ready) => {
        if (ready) {
          clearInterval(rendererInterval);
          clearInterval(viteTimer);
          rendererReady = true;
          tryFinish();
        }
      });

      if (Date.now() - rendererStartedAt >= 60_000) {
        clearInterval(rendererInterval);
        clearInterval(viteTimer);
        showStartupError(new Error(`Timed out waiting for renderer dev server at ${RENDERER_DEV_URL}`));
      }
    }, POLL_INTERVAL_MS);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 900,
    title: 'Trading Agent',
    show: false, // Don't show until ready-to-show
    backgroundColor: '#09090b', // Prevent white flash before loading screen paints
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
