// 1.0.4 · 최소화 말풍선 창 전용 다리
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bub', {
  on: f => ipcRenderer.on('bub:data', (_e, d) => f(d)),
  hit: on => ipcRenderer.send('bub:hit', !!on),
  open: k => ipcRenderer.send('bub:open', String(k)),
  close: k => ipcRenderer.send('bub:close', String(k)),
  taskbar: k => ipcRenderer.send('bub:tb', String(k)),
  dragStart: () => ipcRenderer.send('bub:drag0'),
  drag: (dx, dy) => ipcRenderer.send('bub:drag', Math.round(dx), Math.round(dy)),
  dragEnd: () => ipcRenderer.send('bub:drag1')
});
