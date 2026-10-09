import type { ChatStart, ChatEvent } from '../core/chat-protocol';
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('companionWindow', {
  close: () => ipcRenderer.send('companion:close'),
  openChat: () => ipcRenderer.send('companion:open-chat'),
  copyText: (text: string): Promise<boolean> =>
    ipcRenderer.invoke('companion:copy', text),
  chatStart: (request: ChatStart): Promise<boolean> =>
    ipcRenderer.invoke('companion:chat-start', request),
  chatNext: (run: number): Promise<ChatEvent | null> =>
    ipcRenderer.invoke('companion:chat-next', run),
  chatCancel: (run: number): Promise<boolean> =>
    ipcRenderer.invoke('companion:chat-cancel', run),
});
