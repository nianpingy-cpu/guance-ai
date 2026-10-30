import { contextBridge, ipcRenderer } from 'electron';
import type { GuanceBridge } from '../src/types/desktop';

const bridge: GuanceBridge = {
  desktop: true,
  onBeforeClose: (callback) => { ipcRenderer.removeAllListeners('guance:before-close'); ipcRenderer.on('guance:before-close', () => { void callback().then(() => ipcRenderer.send('guance:close-ready')).catch(() => undefined); }); },
  invoke: (command, input) => ipcRenderer.invoke('guance:request', { command, input }),
  platform: {
    open: (platform, url) => ipcRenderer.invoke('guance:platform', { action: 'open', platform, url }),
    capture: (platform) => ipcRenderer.invoke('guance:platform', { action: 'capture', platform }),
    close: (platform) => ipcRenderer.invoke('guance:platform', { action: 'close', platform }),
    clear: (platform) => ipcRenderer.invoke('guance:platform', { action: 'clear', platform }),
  },
};
contextBridge.exposeInMainWorld('guance', bridge);
