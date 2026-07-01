import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import kill from 'tree-kill';

// Import shared types for compile check
import { TradeSignal, KLineData, Position } from '@trading-agent/shared';

let mainWindow: BrowserWindow | null;
let serverProcess: ChildProcess | null = null;
const SERVER_URL = 'http://localhost:4111';
const PROJECT_ROOT = path.join(__dirname, '..', '..');

function checkServerReady(callback: (ready: boolean) => void) {
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

  if (serverProcess.stdout) {
    serverProcess.stdout.on('data', (data) => {
      console.log(`[Mastra Out]: ${data}`);
    });
  }

  if (serverProcess.stderr) {
    serverProcess.stderr.on('data', (data) => {
      console.error(`[Mastra Err]: ${data}`);
    });
  }

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
        if (mainWindow) {
          mainWindow.loadURL(SERVER_URL);
        }
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
    if (mainWindow) {
      mainWindow.show();
    }
  });

  // Check if server is already running
  checkServerReady((running) => {
    if (running) {
      console.log('Mastra server already running, connecting...');
      if (mainWindow) {
        mainWindow.loadURL(SERVER_URL);
      }
    } else {
      console.log('Mastra server not running. Starting server and loading splash screen...');
      if (mainWindow) {
        mainWindow.loadFile(path.join(__dirname, '..', 'loading.html'));
      }
      startMastraServer();
      pollServerAndLoad();
    }
  });

  // Inject Chinese translations on dom-ready
  mainWindow.webContents.on('dom-ready', () => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(translateScript);
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

const translateScript = `
  (function() {
    const translations = {
      'Mastra Studio': 'Trading Agent',
      'Agents': '智能体 (Agents)',
      'Prompts': '提示词 (Prompts)',
      'Workflows': '工作流 (Workflows)',
      'Processors': '数据处理器',
      'MCP Servers': 'MCP 服务端',
      'Tools': '工具箱 (Tools)',
      'Workspaces': '工作空间',
      'Request Context': '请求上下文',
      'Overview': '评估总览',
      'Scorers': '打分器 (Scorers)',
      'Datasets': '数据集 (Datasets)',
      'Experiments': '实验对比',
      'Metrics': '指标监控 (Metrics)',
      'Traces': '调用链追踪 (Traces)',
      'Logs': '系统日志 (Logs)',
      'Settings': '系统设置',
      'Resources': '开发资源',
      'Search': '全局搜索 (Search)',
      'Primitives': '基础组件',
      'Evaluation': '模型评估',
      'Observability': '可观测性'
    };

    function translateText(text) {
      const trimmed = text.trim();
      return translations[trimmed] || text;
    }

    function translateNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const translated = translateText(node.nodeValue);
        if (translated !== node.nodeValue) {
          node.nodeValue = translated;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Translate placeholders
        if (node.hasAttribute('placeholder')) {
          const placeholder = node.getAttribute('placeholder');
          if (placeholder === 'Search...') {
            node.setAttribute('placeholder', '搜索...');
          }
        }
        // Translate tooltips
        if (node.hasAttribute('aria-label')) {
          const label = node.getAttribute('aria-label');
          if (translations[label]) {
            node.setAttribute('aria-label', translations[label]);
          }
        }
        for (const child of node.childNodes) {
          translateNode(child);
        }
      }
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          translateNode(node);
        }
        if (mutation.type === 'characterData') {
          translateNode(mutation.target);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    translateNode(document.body);
    document.title = document.title.replace('Mastra Studio', 'Trading Agent');
  })();
`;
