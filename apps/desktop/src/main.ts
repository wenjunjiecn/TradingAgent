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
    titleBarStyle: 'hidden',
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

  // Inject Chinese translations and custom CSS on dom-ready
  mainWindow.webContents.on('dom-ready', () => {
    if (mainWindow) {
      console.log('DOM ready event fired, injecting custom styles and translation script...');
      
      // Inject CSS to add top padding for macOS traffic lights and make the region draggable
      const customStyles = `
        .sidebar-layout {
          padding-top: 36px !important;
          -webkit-app-region: drag !important;
        }
        .sidebar-layout > * {
          -webkit-app-region: no-drag !important;
        }
      `;
      
      mainWindow.webContents.insertCSS(customStyles)
        .then(() => console.log('Custom CSS successfully injected!'))
        .catch(err => console.error('Failed to inject CSS:', err));

      mainWindow.webContents.executeJavaScript(translateScript)
        .then(() => console.log('Translation script successfully injected!'))
        .catch(err => console.error('Failed to inject translation script:', err));
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
    console.log("Translation script initializing...");
    try {
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
        'Observability': '可观测性',
        
        // Navigation & Page Headers
        'Home': '首页',
        'Name': '名称',
        'Instructions': '指令 (Instructions)',
        'Model': '模型 (Model)',
        'Type': '类型',
        'Description': '描述',
        'ID': 'ID',
        'Status': '状态',
        'Created': '创建时间',
        'Updated': '更新时间',
        'Actions': '操作',
        
        // Top bar & buttons
        'Agents documentation': '智能体文档',
        'Workflows documentation': '工作流文档',
        'Prompts documentation': '提示词文档',
        'Tools documentation': '工具文档',
        'Datasets documentation': '数据集文档',
        'System settings': '系统设置',
        
        // Tabs
        'Chat': '对话',
        'Editor': '编辑器',
        'Evaluate': '评估',
        'Review': '评审',
        
        // Chat area
        'Memory': '记忆 (Context)',
        'New Chat': '新建会话',
        'Your conversations will appear here once you start chatting!': '开始对话后，您的历史会话将显示在这里！',
        'How can I help you today?': '今天我能帮您做点什么？',
        'Enter your message...': '请输入消息...',
        
        // Common UI Actions & Labels
        'Search...': '搜索...',
        'Search': '搜索',
        'Variables': '变量',
        'Input': '输入',
        'Output': '输出',
        'Steps': '步骤',
        'Trigger': '触发器',
        'Execute': '执行',
        'Run': '运行',
        'Select a model': '选择模型',
        'System prompt': '系统提示词',
        'System Prompt': '系统提示词',
        'Temperature': '温度 (Temperature)',
        'Max tokens': '最大 Token数',
        'Top P': 'Top P',
        'Delete': '删除',
        'Edit': '编辑',
        'Save': '保存',
        'Cancel': '取消',
        'Close': '关闭',
        'No workflows found': '未找到工作流',
        'Create a workflow': '创建工作流',
        'No agents found': '未找到智能体',
        'Create an agent': '创建智能体',
        'No prompts found': '未找到提示词',
        'Create a prompt': '创建提示词',
        'No datasets found': '未找到数据集',
        'Create a dataset': '创建数据集',
        'Agent Settings': '智能体设置',
        'Model Settings': '模型设置',
        'Parameters': '参数',
        
        // Memory & Advanced Agent features
        'Semantic Recall': '语义检索记忆',
        'Semantic recall': '语义检索记忆',
        'Working Memory': '当前工作记忆',
        'Working memory': '当前工作记忆',
        'Semantic recall is not enabled for this agent. Enable it to search through conversation history.': '当前智能体未开启语义检索。开启后可搜索历史会话记录。',
        'Working memory is not enabled for this agent. Enable it to maintain context across conversations.': '当前智能体未开启工作记忆。开启后可在不同会话间保持上下文。',
        'Learn about semantic recall': '了解语义检索记忆',
        'Learn about working memory': '了解工作记忆',
        'recent messages': '最近消息',
        
        // Actions & Statuses
        'Clone Thread': '克隆当前会话',
        'Create a copy of this conversation': '创建此会话的副本',
        'Clone': '克隆',
        'Cloning...': '克隆中...',
        'Failed to clone thread': '克隆会话失败',
        'Idle': '空闲中',
        'No URL': '暂无连接 URL',
        'recent': '最近',
        
        // Workflows layout
        'Schedules': '调度计划 (Schedules)',
        'Number of steps': '步骤数量',
        'Number of Steps': '步骤数量',
        'Step': '步骤'
      };

      function translateText(text) {
        if (!text) return text;
        const trimmed = text.trim();
        if (translations[trimmed]) {
          const leading = text.match(/^\\s*/)[0];
          const trailing = text.match(/\\s*$/)[0];
          const result = leading + translations[trimmed] + trailing;
          console.log("Translating text: [" + trimmed + "] -> [" + translations[trimmed] + "]");
          return result;
        } else {
          // Log unmatched English-like strings for debugging
          if (trimmed.length > 1 && /^[A-Za-z]/.test(trimmed)) {
            console.log("Unmatched text: [" + trimmed + "]");
          }
        }
        return text;
      }

      function translateNode(node) {
        if (!node) return;
        if (node.nodeType === Node.TEXT_NODE) {
          const translated = translateText(node.nodeValue);
          if (translated !== node.nodeValue) {
            node.nodeValue = translated;
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // Translate placeholders
          if (node.hasAttribute('placeholder')) {
            const placeholder = node.getAttribute('placeholder');
            if (translations[placeholder]) {
              node.setAttribute('placeholder', translations[placeholder]);
              console.log("Translating placeholder: [" + placeholder + "] -> [" + translations[placeholder] + "]");
            } else if (placeholder === 'Search...') {
              node.setAttribute('placeholder', '搜索...');
            }
          }
          // Translate tooltips & labels
          if (node.hasAttribute('aria-label')) {
            const label = node.getAttribute('aria-label');
            if (translations[label]) {
              node.setAttribute('aria-label', translations[label]);
              console.log("Translating aria-label: [" + label + "] -> [" + translations[label] + "]");
            }
          }
          for (const child of node.childNodes) {
            translateNode(child);
          }
        }
      }

      function observeIframe(iframe) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (iframeDoc) {
            console.log("Observing iframe:", iframe);
            translateNode(iframeDoc.body);
            
            const iframeObserver = new MutationObserver((mutations) => {
              for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                  translateNode(node);
                }
                if (mutation.type === 'characterData') {
                  translateNode(mutation.target);
                }
              }
            });
            
            iframeObserver.observe(iframeDoc.body, { childList: true, subtree: true, characterData: true });
          }
        } catch (e) {
          console.error("Cannot observe iframe:", e);
        }
      }

      function setupIframeTracker() {
        console.log("Setting up iframe tracker...");
        document.querySelectorAll('iframe').forEach(iframe => {
          observeIframe(iframe);
          iframe.addEventListener('load', () => observeIframe(iframe));
        });

        const bodyObserver = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.tagName === 'IFRAME') {
                observeIframe(node);
                node.addEventListener('load', () => observeIframe(node));
              } else if (node.querySelectorAll) {
                node.querySelectorAll('iframe').forEach(iframe => {
                  observeIframe(iframe);
                  iframe.addEventListener('load', () => observeIframe(iframe));
                });
              }
            }
          }
        });
        bodyObserver.observe(document.body, { childList: true, subtree: true });
      }

      // Initial execution
      translateNode(document.body);
      setupIframeTracker();
      
      const mainObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            translateNode(node);
          }
          if (mutation.type === 'characterData') {
            translateNode(mutation.target);
          }
        }
      });
      mainObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
      
      document.title = document.title.replace('Mastra Studio', 'Trading Agent');
      console.log("Translation script initialized successfully!");
    } catch (e) {
      console.error("Error in translation script:", e);
    }
  })();
`;
