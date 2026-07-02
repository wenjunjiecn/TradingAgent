import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('tradingAgent', {
  platform: process.platform,
  desktopAuthToken: process.env.TRADING_AGENT_DESKTOP_TOKEN ?? '',
});
