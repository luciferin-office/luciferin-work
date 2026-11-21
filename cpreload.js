// 1.0.5 · 화면 영역 고르기 창 전용 다리
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cap', {
  img: f => ipcRenderer.on('cap:img', (_e, u) => f(u)),
  done: r => ipcRenderer.send('cap:done', r || null)
});
