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

/* 자동 업데이트 (1.0.3 · 대표님 11/22: 끌 때 설치하면 컴퓨터가 꺼지며 설치가 끊길 수 있음 → 켤 때 먼저 바꾸고 열기)
   ① 켜 둔 동안: GitHub 릴리스에 새 판이 있으면 뒤에서 받기만 함(끌 때 설치하지 않음) · 받으면 '다음에 켤 때 바꿉니다' 알림 한 번
   ② 다음에 켤 때: 받아 둔 판이 있으면 대화 창 대신 '새 버전으로 바꾸는 중' 작은 창 → 조용히 설치 → 새 판으로 다시 열림
   ③ 20초 안에 준비가 안 되면(인터넷 끊김 등) 건너뛰고 지금 판으로 그냥 켬 · 다음에 켤 때 다시(3번 넘게 안 되면 그 판은 잊음) */
let upd = null, splash = null;
function updater(){ if(upd) return upd; try { upd = require('electron-updater').autoUpdater; upd.autoDownload = true; upd.autoInstallOnAppQuit = false; } catch(_){ upd = null; } return upd; }
function pendSet(v){ try { const s = loadState(); if(v) s.pend = { v, n: 0 }; else delete s.pend; fs.writeFileSync(STATE, JSON.stringify(s)); } catch(_){} }
function splashHtml(v){ let logo = ''; try { logo = 'data:image/png;base64,' + fs.readFileSync(ICON).toString('base64'); } catch(_){}
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;font-family:"Pretendard","Malgun Gothic","Apple SD Gothic Neo",sans-serif;background:transparent;-webkit-user-select:none;user-select:none}
  .c{position:absolute;inset:8px;border-radius:18px;background:#fff;box-shadow:0 18px 40px -16px rgba(15,22,45,.45),0 0 0 1px rgba(31,48,96,.08);overflow:hidden;display:flex;flex-direction:column}
  .t{position:relative;padding:22px 22px 18px;background:radial-gradient(120px 70px at 88% 10%,rgba(233,214,168,.3),transparent 70%),radial-gradient(2px 2px at 74% 34%,rgba(255,236,180,.9),transparent 70%),radial-gradient(2px 2px at 60% 70%,rgba(255,236,180,.6),transparent 70%),linear-gradient(150deg,#2B3F7A,#1F3060 55%,#17244A);color:#fff;display:flex;gap:14px;align-items:center}
  .t img{width:44px;height:44px;border-radius:12px;box-shadow:0 0 0 1px rgba(255,255,255,.15)}
  .t small{display:block;font-size:10.5px;font-weight:700;letter-spacing:.14em;color:#E9D6A8}.t b{display:block;font-size:17px;font-weight:800;letter-spacing:-.02em;margin-top:3px}
  .b{padding:16px 22px 18px}.b p{margin:0;font-size:13px;color:#1B2437;font-weight:700}.b em{display:block;font-style:normal;font-size:12px;color:#6B7489;margin-top:4px}
  .bar{position:relative;height:6px;border-radius:99px;background:#EEF1F6;overflow:hidden;margin-top:14px}.bar i{position:absolute;inset:0;width:40%;border-radius:99px;background:linear-gradient(90deg,#1F3060,#2E86C1,#D6BA7E);animation:m 1.1s ease-in-out infinite}
  @keyframes m{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}</style></head><body><div class="c">
  <div class="t">${logo ? `<img src="${logo}">` : ''}<div><small>LUCIFERIN WORK · UPDATE</small><b>새 버전으로 바꾸는 중입니다</b></div></div>
  <div class="b"><p>v${app.getVersion()} → v${v || '새 판'}</p><em>몇 초면 끝나고 저절로 다시 열립니다 · 컴퓨터를 끄지 마십시오</em><div class="bar"><i></i></div></div></div></body></html>`); }
function showSplash(v){ splash = new BrowserWindow({ width: 400, height: 210, frame: false, transparent: true, resizable: false, movable: true, alwaysOnTop: true, skipTaskbar: false, show: false, title: '루시페린 워크 · 업데이트', icon: ICON, webPreferences: { sandbox: true, contextIsolation: true } });
  splash.loadURL(splashHtml(v)); splash.once('ready-to-show', () => splash.show()); }
/* 켤 때: 받아 둔 판이 있으면 먼저 바꿈. 없으면 바로 대화 창 */
function startWithUpdate(open){ const s = loadState(), P = s.pend, u = updater();
  if(!P || !u || P.v === app.getVersion()){ if(P) pendSet(null); open(); return; }
  if((P.n || 0) >= 3){ pendSet(null); open(); return; }   // 세 번 넘게 못 바꾼 판은 잊고 지금 판으로
  try { const t = loadState(); t.pend.n = (P.n || 0) + 1; fs.writeFileSync(STATE, JSON.stringify(t)); } catch(_){}
  showSplash(P.v); let done = false;
  const go = () => { if(done) return; done = true; setTimeout(() => { try { quitting = true; u.quitAndInstall(true, true); } catch(_){ quitting = false; if(splash && !splash.isDestroyed()) splash.close(); open(); } }, 600); };
  const skip = () => { if(done) return; done = true; if(splash && !splash.isDestroyed()) splash.close(); open(); };
  u.once('update-downloaded', go); u.once('error', skip);
  u.checkForUpdates().then(r => { if(!r || !r.updateInfo || r.updateInfo.version === app.getVersion()) skip(); }).catch(skip);
  setTimeout(skip, 20000); }
/* 켜 둔 동안: 받기만 하고 다음 실행 때 바꿈 */
function autoUpdate(){ const u = updater(); if(!u) return;
  u.on('update-downloaded', info => { if(quitting) return; const v = info && info.version; if(!v || v === app.getVersion()) return; const s = loadState(); if(!s.pend || s.pend.v !== v){ pendSet(v); notify({ title: '루시페린 워크 새 버전', body: '새 버전을 받았습니다. 다음에 켤 때 먼저 바꾼 뒤 열립니다.', silent: true }); } });
  u.on('error', () => {});
  setTimeout(() => u.checkForUpdates().catch(() => {}), 15000); setInterval(() => u.checkForUpdates().catch(() => {}), 6 * 3600e3); }

app.on('second-instance', () => showChat());
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', e => { /* 시계 옆 아이콘으로 계속 켜 둠 */ });
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  buildTray(); startWithUpdate(() => { showChat(); autoUpdate(); });
  if(!loadState().asked){ app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); const s = loadState(); s.asked = true; try { fs.writeFileSync(STATE, JSON.stringify(s)); } catch(_){} }   // 처음 설치하면 자동 실행 켬(메뉴에서 끌 수 있음)
});
