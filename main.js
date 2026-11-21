// 루시페린 워크 — 루시페린 오피스(crm.luciferin.kr)를 그대로 담는 윈도우 프로그램
// 대화 창(#chatapp) · 업무 창(오피스) · 시계 옆 아이콘 · 작업표시줄 숫자 · 윈도우 알림 · 자동 실행 · 자동 업데이트
const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, shell, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const BASE = 'https://crm.luciferin.kr';
const HOST = 'crm.luciferin.kr';
const ICON = path.join(__dirname, 'build', 'icon.png');
const TRAY = path.join(__dirname, 'build', 'tray.png');
const STATE = path.join(app.getPath('userData'), 'windows.json');

app.setAppUserModelId('kr.luciferin.work');            // 윈도우 알림에 프로그램 이름 · 아이콘
if(!app.requestSingleInstanceLock()){ app.quit(); }     // 두 번 켜면 이미 켜진 창을 앞으로

let chatWin = null, officeWin = null, tray = null, quitting = false, unread = 0;

/* 창 위치 · 크기 기억 */
function loadState(){ try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch(_){ return {}; } }
function saveState(key, win){ try { const s = loadState(); if(!win.isMinimized() && !win.isMaximized()) s[key] = win.getBounds(); s[key + 'Max'] = win.isMaximized(); fs.writeFileSync(STATE, JSON.stringify(s)); } catch(_){} }
function onScreen(b){ if(!b) return false; return screen.getAllDisplays().some(d => { const a = d.workArea; return b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y >= a.y - 10 && b.y < a.y + a.height - 80; }); }
function keep(key, win){ const t = () => saveState(key === 'chat' ? 'chat_' + chatMode() : key, win); win.on('resize', t); win.on('move', t); win.on('maximize', t); win.on('unmaximize', t); }
/* 1.0.2 · 대화 창 작게(카카오워크처럼 한 줄) ↔ 크게(목록 · 대화 나눔). 처음 1.0.2를 켜면 한 번은 작게 시작 · 그 뒤로는 마지막 고른 크기 */
const CHAT_SZ = { small: { width: 420, height: 700 }, big: { width: 1000, height: 700 } };
function chatMode(){ const s = loadState(); return s.chatMode === 'big' ? 'big' : 'small'; }
function setChatMode(m){ try { const s = loadState(); s.chatMode = m === 'big' ? 'big' : 'small'; fs.writeFileSync(STATE, JSON.stringify(s)); } catch(_){} }
function chatBounds(m){ const s = loadState(), b = s['chat_' + m]; if(onScreen(b)) return b; const d = CHAT_SZ[m], a = screen.getPrimaryDisplay().workArea; return { width: d.width, height: Math.min(d.height, a.height - 40), x: a.x + a.width - d.width - 24, y: a.y + Math.max(20, Math.round((a.height - d.height) / 2)) }; }
function resizeChat(m){ if(!chatWin || chatWin.isDestroyed()) return; if(chatWin.isMaximized()) chatWin.unmaximize(); const cur = chatWin.getBounds(); setChatMode(m); const s = loadState(), saved = s['chat_' + m], d = CHAT_SZ[m];
  let b = onScreen(saved) ? saved : { width: d.width, height: cur.height, x: m === 'big' ? cur.x + cur.width - d.width : cur.x + cur.width - d.width, y: cur.y };
  const a = screen.getDisplayMatching(cur).workArea; if(b.x < a.x) b.x = a.x + 8; if(b.x + b.width > a.x + a.width) b.x = a.x + a.width - b.width - 8;
  chatWin.setBounds(b, true); }

const isOurs = u => { try { return new URL(u).host === HOST; } catch(_){ return false; } };
const viewOf = u => { try { return (new URL(u).hash.slice(1).split('?')[0]) || 'home'; } catch(_){ return 'home'; } };

function webPrefs(){ return { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false }; }

/* 새 창 · 링크: 우리 주소면 프로그램 창으로, 바깥 주소는 기본 브라우저로 */
function guard(win){
  win.webContents.setWindowOpenHandler(({ url }) => {
    if(isOurs(url)){ const v = viewOf(url); if(v === 'chatapp') showChat(); else openOffice(v); return { action: 'deny' }; }
    if(/^(https?|mailto|tel):/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if(!isOurs(url)){ e.preventDefault(); if(/^https?:/.test(url)) shell.openExternal(url); } });
}

function showChat(){
  if(chatWin && !chatWin.isDestroyed()){ if(chatWin.isMinimized()) chatWin.restore(); chatWin.show(); chatWin.focus(); return chatWin; }
  const s = loadState(); if(!s.v102){ s.v102 = 1; s.chatMode = 'small'; try { fs.writeFileSync(STATE, JSON.stringify(s)); } catch(_){} }
  const b = chatBounds(chatMode());
  chatWin = new BrowserWindow({ ...b, minWidth: 360, minHeight: 480, title: '루시페린 워크', icon: ICON, backgroundColor: '#ffffff', autoHideMenuBar: true, show: false, webPreferences: webPrefs() });
  if(s.chatMax) chatWin.maximize();
  chatWin.loadURL(BASE + '/#chatapp');
  chatWin.once('ready-to-show', () => { if(!process.argv.includes('--hidden')) chatWin.show(); });
  chatWin.on('close', e => { if(!quitting){ e.preventDefault(); chatWin.hide(); } });   // 닫아도 꺼지지 않고 시계 옆 아이콘으로
  chatWin.on('focus', () => chatWin.flashFrame(false));
  keep('chat', chatWin); guard(chatWin);
  return chatWin;
}

function openOffice(view){
  const url = BASE + '/#' + (view || 'home');
  if(officeWin && !officeWin.isDestroyed()){
    officeWin.webContents.executeJavaScript(`location.hash = ${JSON.stringify('#' + (view || 'home'))}`).catch(() => officeWin.loadURL(url));
    if(officeWin.isMinimized()) officeWin.restore(); officeWin.show(); officeWin.focus(); return;
  }
  const s = loadState(), b = onScreen(s.office) ? s.office : { width: 1440, height: 900 };
  officeWin = new BrowserWindow({ ...b, minWidth: 900, minHeight: 600, title: '루시페린 오피스', icon: ICON, backgroundColor: '#ffffff', autoHideMenuBar: true, webPreferences: webPrefs() });
  if(s.officeMax) officeWin.maximize();
  officeWin.loadURL(url);
  officeWin.on('close', e => { if(!quitting){ e.preventDefault(); officeWin.hide(); } });   // 1.0.2 · 닫아도 숨겨 두어 다음에 바로 열림(다시 불러오는 동안 기다리지 않게)
  officeWin.on('closed', () => { officeWin = null; });
  keep('office', officeWin); guard(officeWin);
}

/* 작업표시줄 숫자 (윈도우: 아이콘 위 작은 빨간 원) */
function badgeIcon(n){
  const t = n > 99 ? '99+' : String(n), w = 16, fs2 = t.length > 2 ? 7 : t.length > 1 ? 9 : 11;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}"><circle cx="8" cy="8" r="8" fill="#c0533a"/><text x="8" y="${8 + fs2 / 2.8}" font-family="Segoe UI,Arial" font-size="${fs2}" font-weight="700" fill="#fff" text-anchor="middle">${t}</text></svg>`;
  return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
}
function setBadge(n){
  n = Math.max(0, n | 0); if(n === unread) return; const more = n > unread; unread = n;
  try { if(chatWin && !chatWin.isDestroyed()) chatWin.setOverlayIcon(n ? badgeIcon(n) : null, n ? `안 읽은 대화 ${n}개` : ''); } catch(_){}
  try { app.setBadgeCount(n); } catch(_){}
  if(tray) tray.setToolTip(n ? `루시페린 워크 · 안 읽은 대화 ${n}개` : '루시페린 워크');
  if(more && chatWin && !chatWin.isFocused()) chatWin.flashFrame(true);      // 새 글이 오면 작업표시줄 깜빡임
}

/* 윈도우 알림 — 누르면 그 대화방 */
function notify(o){
  if(!Notification.isSupported()) return;
  if(chatWin && chatWin.isVisible() && chatWin.isFocused()) return;
  const n = new Notification({ title: String(o.title || '팀 대화').slice(0, 80), body: String(o.body || '').slice(0, 200), icon: ICON, silent: !!o.silent });
  n.on('click', () => { const w = showChat(); if(o.room) w.webContents.executeJavaScript(`try{S.cxa.room=${JSON.stringify(String(o.room))};S.cxa.nl=false;S.cxa.sig='';pxCxSync()}catch(e){}`).catch(() => {}); });
  n.show();
}

function autoStart(){ try { return app.getLoginItemSettings().openAtLogin; } catch(_){ return false; } }
function buildTray(){
  tray = new Tray(nativeImage.createFromPath(TRAY));
  tray.setToolTip('루시페린 워크');
  const menu = () => Menu.buildFromTemplate([
    { label: '대화 열기', click: () => showChat() },
    { label: '오피스 열기', click: () => openOffice('home') },
    { type: 'separator' },
    { label: '컴퓨터를 켜면 자동 실행', type: 'checkbox', checked: autoStart(), click: i => { app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }); } },
    { type: 'separator' },
    { label: '루시페린 워크 끝내기', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu());
  tray.on('right-click', () => tray.setContextMenu(menu()));
  tray.on('click', () => { if(chatWin && chatWin.isVisible() && chatWin.isFocused()) chatWin.hide(); else showChat(); });
}

/* 화면(오피스)과 주고받기 */
ipcMain.on('lx:badge', (_e, n) => setBadge(n));
ipcMain.on('lx:notify', (_e, o) => notify(o || {}));
ipcMain.on('lx:openOffice', (_e, v) => openOffice(String(v || 'home')));
ipcMain.on('lx:openChat', () => showChat());
ipcMain.on('lx:ver', e => { e.returnValue = app.getVersion(); });
ipcMain.on('lx:chatSize', (_e, m) => resizeChat(m === 'big' ? 'big' : 'small'));
ipcMain.on('lx:chatMode', e => { e.returnValue = chatMode(); });

/* 자동 업데이트 — GitHub 릴리스(luciferin-office/luciferin-work)에 새 판이 올라오면 받아 두고 다음 실행 때 바뀜 */
function autoUpdate(){
  try { const { autoUpdater } = require('electron-updater'); autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-downloaded', () => notify({ title: '루시페린 워크 새 버전', body: '새 버전을 받았습니다. 다음에 켤 때 바뀝니다.', silent: true }));
    autoUpdater.checkForUpdates().catch(() => {}); setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 3600e3);
  } catch(_){}
}

app.on('second-instance', () => showChat());
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', e => { /* 시계 옆 아이콘으로 계속 켜 둠 */ });
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  buildTray(); showChat(); autoUpdate();
  if(!loadState().asked){ app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); const s = loadState(); s.asked = true; try { fs.writeFileSync(STATE, JSON.stringify(s)); } catch(_){} }   // 처음 설치하면 자동 실행 켬(메뉴에서 끌 수 있음)
});
