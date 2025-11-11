// Minimal preload; expose a safe IPC surface in future if needed
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  send: (chan, payload) => ipcRenderer.send(chan, payload),
  on: (chan, cb) => ipcRenderer.on(chan, (ev, ...args) => cb(...args)),
});
