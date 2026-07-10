import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('tradingAgent', {
  platform: process.platform,
});
