// 루시페린 워크 — 루시페린 오피스(crm.luciferin.kr)를 그대로 담는 윈도우 프로그램
// 대화 목록 창(#chatapp) · 방마다 작은 새 창(1.0.4) · 최소화 말풍선(1.0.4) · 업무 창(오피스) · 시계 옆 아이콘 · 작업표시줄 숫자 · 윈도우 알림 · 자동 실행 · 자동 업데이트
const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, shell, ipcMain, screen, dialog, desktopCapturer } = require('electron');
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
  const s = loadState(); if(!s.v104){ s.v102 = 1; s.v104 = 1; s.chatMode = 'small'; try { fs.writeFileSync(STATE, JSON.stringify(s)); } catch(_){} }   // 1.0.4 · 목록 창은 작게(방은 새 창으로 열리므로)
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
  if(o.room){ const R = rooms.get(String(o.room)); if(R && !R.win.isDestroyed() && R.win.isVisible() && R.win.isFocused()) return; }   // 그 방 창을 보고 있으면 알리지 않음
  const n = new Notification({ title: String(o.title || '팀 대화').slice(0, 80), body: String(o.body || '').slice(0, 200), icon: ICON, silent: !!o.silent });
  n.on('click', () => { if(o.room) openRoom(String(o.room)); else showChat(); });
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
    { label: '대화창을 최소화하면', submenu: [{ label: '화면 아래 말풍선으로 (추천)', type: 'radio', checked: minPref() === 'bubble', click: () => setMinPref('bubble') }, { label: '작업 표시줄로', type: 'radio', checked: minPref() === 'taskbar', click: () => setMinPref('taskbar') }] },
    { label: '컴퓨터를 켜면 자동 실행', type: 'checkbox', checked: autoStart(), click: i => { app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }); } },
    { type: 'separator' },
    { label: '루시페린 워크 끝내기', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu());
  tray.on('right-click', () => tray.setContextMenu(menu()));
  tray.on('click', () => { if(chatWin && chatWin.isVisible() && chatWin.isFocused()) chatWin.hide(); else showChat(); });
}


/* ── 1.0.4 · 방마다 작은 새 창 (대표님 11/22) ──
   목록 창에서 방을 누르면 그 방만 420×700 창으로 · 같은 방은 창 하나 · Esc 로 닫기(화면 쪽에서 lx:closeRoom)
   최소화하면: 말풍선(기본) — 창을 숨기고 화면 오른쪽 아래 투명 말풍선 · 작업 표시줄 — 보통 최소화 + 새 글이면 깜빡임 */
const ROOM_SZ = { width: 420, height: 700 }, ROOM_MAX = 6, rooms = new Map();
function minPref(){ return loadState().minMode === 'taskbar' ? 'taskbar' : 'bubble'; }
function setMinPref(m){ try { const s = loadState(); s.minMode = m === 'taskbar' ? 'taskbar' : 'bubble'; s.minAsked = 1; fs.writeFileSync(STATE, JSON.stringify(s)); } catch(_){} }
function roomBounds(){ const s = loadState(), n = [...rooms.values()].filter(r => !r.win.isDestroyed() && r.win.isVisible()).length, a = screen.getPrimaryDisplay().workArea;
  let b = onScreen(s.room) ? { ...s.room } : null;
  if(!b){ const c = chatWin && !chatWin.isDestroyed() ? chatWin.getBounds() : null; b = { width: ROOM_SZ.width, height: Math.min(ROOM_SZ.height, a.height - 40), x: c ? c.x - ROOM_SZ.width - 12 : a.x + a.width - ROOM_SZ.width * 2 - 40, y: c ? c.y : a.y + Math.max(20, Math.round((a.height - ROOM_SZ.height) / 2)) }; }
  b.x -= n * 28; b.y += n * 28; if(b.x < a.x) b.x = a.x + 8 + n * 28; if(b.y + b.height > a.y + a.height) b.y = a.y + 8 + n * 12; return b; }
function openRoom(k){ k = String(k || ''); if(!k || k === '__none') return null; let R = rooms.get(k);
  if(R && !R.win.isDestroyed()){ R.mode = 'open'; bubSync(); if(R.win.isMinimized()) R.win.restore(); R.win.show(); R.win.focus(); return R.win; }
  if(rooms.size >= ROOM_MAX){ const old = [...rooms.values()].sort((a, b) => (a.mode === 'open') - (b.mode === 'open') || a.at - b.at)[0]; try { old.win.close(); } catch(_){} }
  const win = new BrowserWindow({ ...roomBounds(), minWidth: 340, minHeight: 420, title: '루시페린 워크', icon: ICON, backgroundColor: '#ffffff', autoHideMenuBar: true, show: false, webPreferences: webPrefs() });
  R = { k, win, name: '', ini: '', un: 0, last: null, mode: 'open', at: Date.now(), bat: 0 }; rooms.set(k, R);
  win.loadURL(BASE + '/#chatapp?solo=' + encodeURIComponent(k));
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('focus', () => { R.at = Date.now(); win.flashFrame(false); try { win.setOverlayIcon(null, ''); } catch(_){} });
  win.on('minimize', () => { if(R.mode === 'tb' || minPref() === 'taskbar'){ R.mode = 'tb'; bubSync(); return; } R.mode = 'bub'; R.bat = Date.now(); win.hide(); bubSync(); });
  win.on('restore', () => { if(R.mode !== 'bub'){ R.mode = 'open'; bubSync(); } });
  win.on('show', () => { if(R.mode === 'bub'){ R.mode = 'open'; bubSync(); } });
  const t = () => { try { if(!win.isMinimized() && !win.isMaximized() && win.isVisible()){ const s = loadState(); const b = win.getBounds(); s.room = { width: b.width, height: b.height, x: b.x, y: b.y }; fs.writeFileSync(STATE, JSON.stringify(s)); } } catch(_){} };
  win.on('resize', t); win.on('move', t);
  win.on('closed', () => { rooms.delete(k); bubSync(); });
  guard(win); return win; }
function roomOf(wc){ for(const R of rooms.values()) if(!R.win.isDestroyed() && R.win.webContents === wc) return R; return null; }
/* 말풍선 창 — 투명 · 항상 위 · 작업 표시줄에 안 보임 · 투명한 곳 클릭은 뒤로 지나감 */
let bubWin = null, bubDrag = null;
const BUB_W = 320, BUB_H = 460;
function bubPos(){ const s = loadState(), a = screen.getPrimaryDisplay().workArea; let p = s.bub; if(!p || !screen.getAllDisplays().some(d => { const w = d.workArea; return p.x + BUB_W - 40 > w.x && p.x + BUB_W - 40 < w.x + w.width && p.y + BUB_H - 40 > w.y && p.y + BUB_H - 40 < w.y + w.height; })) p = { x: a.x + a.width - BUB_W - 8, y: a.y + a.height - BUB_H - 8 }; return p; }
function ensureBub(){ if(bubWin && !bubWin.isDestroyed()) return bubWin; const p = bubPos();
  bubWin = new BrowserWindow({ x: p.x, y: p.y, width: BUB_W, height: BUB_H, frame: false, transparent: true, resizable: false, movable: true, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false, show: false, title: '루시페린 워크 말풍선', backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'bpreload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false } });
  bubWin.setAlwaysOnTop(true, 'floating'); bubWin.setIgnoreMouseEvents(true, { forward: true });
  bubWin.loadFile(path.join(__dirname, 'bubble.html')); bubWin.webContents.once('did-finish-load', () => bubSync());
  bubWin.on('closed', () => { bubWin = null; }); return bubWin; }
function bubSync(){ const L = [...rooms.values()].filter(r => r.mode === 'bub' && !r.win.isDestroyed()).sort((a, b) => a.bat - b.bat);
  if(!L.length){ if(bubWin && !bubWin.isDestroyed()) bubWin.hide(); return; }
  const w = ensureBub(); if(w.webContents.isLoading()) return;
  w.webContents.send('bub:data', L.map(r => ({ k: r.k, name: r.name || '대화', ini: r.ini || '?', un: r.un, last: r.last })));
  if(!w.isVisible()) w.showInactive(); }
ipcMain.on('bub:hit', (_e, on) => { if(bubWin && !bubWin.isDestroyed()) bubWin.setIgnoreMouseEvents(!on, { forward: true }); });
ipcMain.on('bub:open', (_e, k) => openRoom(k));
ipcMain.on('bub:close', (_e, k) => { const R = rooms.get(String(k)); if(R && !R.win.isDestroyed()) R.win.close(); });
ipcMain.on('bub:tb', async (_e, k) => { const R = rooms.get(String(k)); if(!R || R.win.isDestroyed()) return; R.mode = 'tb'; bubSync();
  R.win.showInactive(); R.win.minimize();
  const s = loadState(); if(s.minAsked) return;
  const r = await dialog.showMessageBox({ type: 'info', title: '루시페린 워크', message: '작업 표시줄로 내렸습니다', detail: `${R.name || '대화'} 대화창을 작업 표시줄로 내렸습니다.\n작업 표시줄의 루시페린 워크 아이콘을 누르면 다시 열립니다.\n\n나중에 바꾸려면 시계 옆 워크 아이콘 › 대화창을 최소화하면 에서 고릅니다.`, buttons: ['앞으로도 작업 표시줄로', '이번만'], defaultId: 1, cancelId: 1, noLink: true });
  if(r.response === 0) setMinPref('taskbar'); else { const t = loadState(); t.minAsked = 1; try { fs.writeFileSync(STATE, JSON.stringify(t)); } catch(_){} } });
ipcMain.on('bub:drag0', () => { if(bubWin && !bubWin.isDestroyed()) bubDrag = bubWin.getBounds(); });
ipcMain.on('bub:drag', (_e, dx, dy) => { if(bubDrag && bubWin && !bubWin.isDestroyed()) bubWin.setBounds({ x: bubDrag.x + (dx | 0), y: bubDrag.y + (dy | 0), width: BUB_W, height: BUB_H }); });
ipcMain.on('bub:drag1', () => { bubDrag = null; if(bubWin && !bubWin.isDestroyed()){ try { const s = loadState(), b = bubWin.getBounds(); s.bub = { x: b.x, y: b.y }; fs.writeFileSync(STATE, JSON.stringify(s)); } catch(_){} } });
ipcMain.on('lx:openRoom', (_e, k) => openRoom(k));
ipcMain.on('lx:closeRoom', e => { const R = roomOf(e.sender); if(R) R.win.close(); });
ipcMain.on('lx:roomState', (e, o) => { const R = roomOf(e.sender); if(!R || !o) return; const prev = R.un; R.name = String(o.name || R.name); R.ini = String(o.ini || R.ini); R.un = o.unread | 0; R.last = o.last || null;
  try { R.win.setTitle(`${R.name} · 루시페린 워크`); } catch(_){}
  if(R.mode === 'tb' && R.un > prev && !R.win.isFocused()){ R.win.flashFrame(true); try { R.win.setOverlayIcon(badgeIcon(R.un), `안 읽은 대화 ${R.un}개`); } catch(_){} }
  if(R.mode === 'bub') bubSync(); });


/* ── 1.0.5 · PC 화면 영역 캡처 (대표님 11/22) ──
   워크 창을 잠깐 숨기고 → 마우스가 있는 모니터를 찍어 → 그 그림 위에서 끌어 고른 영역만 잘라 화면에 돌려줌(보낼 줄에 들어감) */
let capBusy = false;
ipcMain.handle('lx:capScreen', async e => { if(capBusy) return null; capBusy = true; const me = BrowserWindow.fromWebContents(e.sender), R = roomOf(e.sender);
  /* 1.0.9 · 워크 창을 숨기지 않음 — 보이는 화면 그대로(오피스 창 · 대화 창 포함) 찍음. 전에는 워크 창을 모두 숨겨 오피스 · 대화 화면을 찍을 수 없었음 */
  const shown = []; shown.forEach(w => { try { w.setOpacity(0); } catch(_){} });
  try { await new Promise(r => setTimeout(r, 80)); const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()), sf = d.scaleFactor || 1, W = Math.round(d.size.width * sf), H = Math.round(d.size.height * sf);
    const src = (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: W, height: H } })), s = src.find(x => String(x.display_id) === String(d.id)) || src[0]; if(!s) return null; const full = s.thumbnail;
    const pick = await new Promise(res => { const w = new BrowserWindow({ x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, frame: false, resizable: false, movable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, show: false, backgroundColor: '#000000', webPreferences: { preload: path.join(__dirname, 'cpreload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
      w.setAlwaysOnTop(true, 'screen-saver'); let done = false; const fin = v => { if(done) return; done = true; ipcMain.removeListener('cap:done', on); try { w.close(); } catch(_){} res(v); };
      const on = (ev, r) => { if(ev.sender === w.webContents) fin(r); }; ipcMain.on('cap:done', on); w.on('closed', () => fin(null)); w.on('blur', () => {});
      w.loadFile(path.join(__dirname, 'capture.html'), { query: { room: (R && R.name) || '' } }); w.webContents.once('did-finish-load', () => { w.webContents.send('cap:img', full.toDataURL()); w.show(); w.focus(); }); });
    if(!pick || !(pick.w > 4) || !(pick.h > 4)) return null; const fx = full.getSize().width / pick.vw, fy = full.getSize().height / pick.vh;
    const c = full.crop({ x: Math.max(0, Math.round(pick.x * fx)), y: Math.max(0, Math.round(pick.y * fy)), width: Math.max(1, Math.round(pick.w * fx)), height: Math.max(1, Math.round(pick.h * fy)) }); return c.toDataURL(); }
  catch(_){ return null; }
  finally { shown.forEach(w => { try { if(!w.isDestroyed()) w.setOpacity(1); } catch(_){} }); try { if(me && !me.isDestroyed()){ me.show(); me.focus(); } } catch(_){} capBusy = false; } });
/* ── 1.0.5 · 모두 받기: 압축 없이 다운로드 › 루시페린 워크 › 방이름_날짜 폴더에 파일 그대로 ── */
const DL_ROOT = () => path.join(app.getPath('downloads'), '루시페린 워크');
const safeName = s => String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || '받은 파일';
ipcMain.handle('lx:saveFiles', async (_e, F, label) => { const L = (Array.isArray(F) ? F : []).filter(x => x && /^https:\/\//.test(String(x.url || ''))).slice(0, 60); if(!L.length) return { n: 0 };
  const dir = path.join(DL_ROOT(), safeName(label || new Date().toISOString().slice(0, 10))); fs.mkdirSync(dir, { recursive: true }); let n = 0;
  for(const x of L){ try { const r = await fetch(x.url); if(!r.ok) continue; const buf = Buffer.from(await r.arrayBuffer()); let nm = safeName(x.name), p = path.join(dir, nm), k = 1; const ext = path.extname(nm), base = nm.slice(0, nm.length - ext.length);
      while(fs.existsSync(p)){ p = path.join(dir, `${base} (${k++})${ext}`); } fs.writeFileSync(p, buf); n++; } catch(_){} }
  return { n, dir }; });
ipcMain.on('lx:openPath', (_e, p) => { try { const root = path.resolve(DL_ROOT()), t = path.resolve(String(p || '')); if(t === root || t.startsWith(root + path.sep)) shell.openPath(t); } catch(_){} });

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
screen && app.on('ready', () => { try { screen.on('display-removed', () => { if(bubWin && !bubWin.isDestroyed()){ const p = bubPos(); bubWin.setBounds({ x: p.x, y: p.y, width: BUB_W, height: BUB_H }); } }); } catch(_){} });
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', e => { /* 시계 옆 아이콘으로 계속 켜 둠 */ });
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  buildTray(); startWithUpdate(() => { showChat(); autoUpdate(); });
  if(!loadState().asked){ app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); const s = loadState(); s.asked = true; try { fs.writeFileSync(STATE, JSON.stringify(s)); } catch(_){} }   // 처음 설치하면 자동 실행 켬(메뉴에서 끌 수 있음)
});


/* 1.0.6 · 오피스 '기관에 보내기' — 파일 셋을 잠깐 임시 폴더에 받아 두고, 화면의 '파일 셋' 묶음을 카톡 방 창으로 끌어다 놓게 함
   다운로드 폴더에 남기지 않음 · 임시 파일은 10분 뒤(또는 창을 닫고 2분 뒤 · 프로그램을 끌 때) 지움 */
const SEND_ROOT = path.join(app.getPath('temp'), 'lx_send');
const SEND = new Map();
const sendDrop = token => { const files = SEND.get(token); if(!files) return; try { fs.rmSync(path.dirname(files[0] || path.join(SEND_ROOT, token, 'x')), { recursive: true, force: true }); } catch(_){} SEND.delete(token); };
ipcMain.handle('lx:stageFiles', async (_e, F) => { const L = (Array.isArray(F) ? F : []).filter(x => x && /^https:\/\//.test(String(x.url || ''))).slice(0, 10); if(!L.length) return { token: '', n: 0 };
  const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 8), dir = path.join(SEND_ROOT, token); fs.mkdirSync(dir, { recursive: true }); const files = [];
  for(const x of L){ try { const r = await fetch(x.url); if(!r.ok) continue; const p = path.join(dir, safeName(x.name)); fs.writeFileSync(p, Buffer.from(await r.arrayBuffer())); files.push(p); } catch(_){} }
  if(!files.length){ try { fs.rmSync(dir, { recursive: true, force: true }); } catch(_){} return { token: '', n: 0 }; }
  SEND.set(token, files); setTimeout(() => sendDrop(token), 10 * 60e3); return { token, n: files.length }; });
/* 1.0.8 · 끌어 놓기 — 카톡 PC 는 붙여넣기로 PDF 를 받지 않아(대표님 11/24 시험) 끌어 놓기가 기본.
   끌기 그림이 비면 Windows 에서 끌기가 시작되지 않을 수 있어 프로그램 안에 넣어 둔 그림을 씀 · 실패하면 화면에 까닭을 알림 */
const DRAG_ICON = nativeImage.createFromDataURL('data:image/png;base64,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');
const dragIcon = () => { try { const i = nativeImage.createFromPath(ICON); if(!i.isEmpty()) return i.resize({ width: 48, height: 48 }); } catch(_){} return DRAG_ICON; };
ipcMain.on('lx:dragFiles', (e, token) => { const files = (SEND.get(String(token || '')) || []).filter(p => { try { return fs.existsSync(p); } catch(_){ return false; } });
  if(!files.length){ try { e.sender.send('lx:dragErr', 'gone'); } catch(_){} return; }
  try { e.sender.startDrag(files.length > 1 ? { file: files[0], files, icon: dragIcon() } : { file: files[0], icon: dragIcon() }); }
  catch(err){ try { e.sender.send('lx:dragErr', String((err && err.message) || err)); } catch(_){} } });
ipcMain.on('lx:unstage', (_e, token) => { const t = String(token || ''); setTimeout(() => sendDrop(t), 2 * 60e3); });
app.on('will-quit', () => { try { fs.rmSync(SEND_ROOT, { recursive: true, force: true }); } catch(_){} });
/* 1.0.7 · 파일 셋 '복사' — 탐색기에서 Ctrl+C 한 것과 같은 꼴로 클립보드에 올림 (대표님 11/24 "카톡에 Ctrl+V 해도 안 들어감")
   1.0.6 의 Set-Clipboard -Path 는 파일 목록(CF_HDROP)만 올려 카톡이 붙여넣기를 받지 않았음
   → 파일 목록 + 'Preferred DropEffect'(복사) + FileNameW 를 함께 올리고, 프로그램이 끝나도 남게(SetDataObject copy) · 올라갔는지 다시 읽어 확인 */
const { execFile } = require('child_process');
const psQ = s => "'" + String(s).replace(/'/g, "''") + "'";
ipcMain.handle('lx:copyFiles', (_e, token) => new Promise(res => { const files = (SEND.get(String(token || '')) || []).filter(p => { try { return fs.existsSync(p); } catch(_){ return false; } });
  if(!files.length) return res({ ok: false, why: 'gone' });
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$sc = New-Object System.Collections.Specialized.StringCollection',
    ...files.map(p => `[void]$sc.Add(${psQ(p)})`),
    '$d = New-Object System.Windows.Forms.DataObject',
    '$d.SetFileDropList($sc)',
    "$d.SetData('Preferred DropEffect', (New-Object System.IO.MemoryStream(,[byte[]](5,0,0,0))))",
    `$d.SetData('FileNameW', (New-Object System.IO.MemoryStream(,[System.Text.Encoding]::Unicode.GetBytes(${psQ(files[0])} + [char]0))))`,
    '[System.Windows.Forms.Clipboard]::SetDataObject($d, $true, 10, 100)',
    'Start-Sleep -Milliseconds 150',
    "if([System.Windows.Forms.Clipboard]::ContainsFileDropList()){ [Console]::Out.Write([System.Windows.Forms.Clipboard]::GetFileDropList().Count) } else { [Console]::Out.Write('0') }"
  ].join('\n');
  const enc = Buffer.from(ps, 'utf16le').toString('base64');
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, timeout: 12000 }, (err, out) => {
    const n = parseInt(String(out || '').trim(), 10) || 0; res({ ok: !err && n > 0, n, why: err ? 'ps' : n ? '' : 'empty' }); }); }));
