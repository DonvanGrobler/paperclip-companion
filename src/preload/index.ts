import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('companionWindow', {
  close: () => ipcRenderer.send('companion:close'),
  openChat: () => ipcRenderer.send('companion:open-chat'),
  copyText: (text: string): Promise<boolean> =>
    ipcRenderer.invoke('companion:copy', text),
});
