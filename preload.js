// 화면(crm.luciferin.kr)이 프로그램 기능을 쓸 수 있게 열어 주는 작은 다리 — window.lxDesk
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lxDesk', {
  app: true,
  version: (() => { try { return ipcRenderer.sendSync('lx:ver'); } catch(_){ return ''; } })(),
  badge: n => ipcRenderer.send('lx:badge', Number(n) || 0),
  notify: o => ipcRenderer.send('lx:notify', { title: String(o?.title || ''), body: String(o?.body || ''), room: String(o?.room || ''), silent: !!o?.silent }),
  openOffice: v => ipcRenderer.send('lx:openOffice', String(v || 'home')),
  openChat: () => ipcRenderer.send('lx:openChat'),
  size: m => ipcRenderer.send('lx:chatSize', m === 'big' ? 'big' : 'small'),
  mode: () => { try { return ipcRenderer.sendSync('lx:chatMode'); } catch(_){ return 'small'; } }
});
