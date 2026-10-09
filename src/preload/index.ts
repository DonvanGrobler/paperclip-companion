import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('companionWindow', {
  close: () => ipcRenderer.send('companion:close'),
});
