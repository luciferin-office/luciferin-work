// 화면(crm.luciferin.kr)이 프로그램 기능을 쓸 수 있게 열어 주는 작은 다리 — window.lxDesk
// 1.0.4 · 방 창(#chatapp?solo=방)은 알림 · 작업표시줄 숫자를 보내지 않음(목록 창 하나만 보냄 → 겹치지 않게)
const { contextBridge, ipcRenderer } = require('electron');
const solo = (() => { try { return /[?&]solo=/.test(location.hash); } catch(_){ return false; } })();
contextBridge.exposeInMainWorld('lxDesk', {
  stageFiles: F => ipcRenderer.invoke('lx:stageFiles', (Array.isArray(F) ? F : []).map(x => ({ url: String(x && x.url || ''), name: String(x && x.name || '') }))),
  dragFiles: t => ipcRenderer.send('lx:dragFiles', String(t || '')),
  onDragErr: cb => { ipcRenderer.removeAllListeners('lx:dragErr'); ipcRenderer.on('lx:dragErr', (_e, m) => { try { cb(String(m || '')); } catch(_){} }); },   /* 1.0.8 */
  copyFiles: t => ipcRenderer.invoke('lx:copyFiles', String(t || '')),
  unstage: t => ipcRenderer.send('lx:unstage', String(t || '')),
  app: true,
  version: (() => { try { return ipcRenderer.sendSync('lx:ver'); } catch(_){ return ''; } })(),
  badge: n => { if(!solo) ipcRenderer.send('lx:badge', Number(n) || 0); },
  notify: o => { if(!solo) ipcRenderer.send('lx:notify', { title: String(o?.title || ''), body: String(o?.body || ''), room: String(o?.room || ''), silent: !!o?.silent }); },
  openOffice: v => ipcRenderer.send('lx:openOffice', String(v || 'home')),
  openChat: () => ipcRenderer.send('lx:openChat'),
  size: m => ipcRenderer.send('lx:chatSize', m === 'big' ? 'big' : 'small'),
  mode: () => { try { return ipcRenderer.sendSync('lx:chatMode'); } catch(_){ return 'small'; } },
  openRoom: k => ipcRenderer.send('lx:openRoom', String(k || '')),
  closeRoom: () => ipcRenderer.send('lx:closeRoom'),
  capScreen: () => ipcRenderer.invoke('lx:capScreen'),
  saveFiles: (F, label) => ipcRenderer.invoke('lx:saveFiles', (Array.isArray(F) ? F : []).map(x => ({ url: String(x && x.url || ''), name: String(x && x.name || '') })), String(label || '')),
  openPath: p => ipcRenderer.send('lx:openPath', String(p || '')),
  roomState: o => ipcRenderer.send('lx:roomState', { room: String(o?.room || ''), name: String(o?.name || ''), ini: String(o?.ini || ''), unread: Number(o?.unread) || 0, last: o?.last ? { id: Number(o.last.id) || 0, by: String(o.last.by || ''), body: String(o.last.body || '') } : null })
});
