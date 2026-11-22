// 家帳本 HomeBook — 畫面與互動
import * as L from './logic.js';
import { TEMPLATES, DEFAULT_CATEGORIES } from './templates.js';
import { LocalStore, CloudStore, loadSettings, saveSettings, cloudConfigured, createFamily, joinFamily } from './store.js';
import { downloadICS } from './ics.js';

const VERSION = '0.1.1';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? undefined : Number(v));

let settings = loadSettings();
let store, unsub;
const ui = { tab: 'today', q: '', type: 'all', cat: '', sort: 'updated', rpYear: null, rpDir: 'in', rpMode: 'child', rpQ: '' };
let sheet = null; // { kind, id, modal }
let formPhotos = [];
let shellTab = null;

// ---------- 啟動 ----------
async function useStore(s) {
  unsub?.();
  store = s;
  unsub = store.onChange(scheduleRender);
}
async function boot() {
  let s;
  if (cloudConfigured() && settings.hid) {
    try { s = new CloudStore(settings.hid); await s.init(); }
    catch (e) { console.error(e); s = null; toast('雲端連線失敗，目前顯示本機資料'); }
  }
  if (!s) { s = new LocalStore(); await s.init(); }
  await useStore(s);
  render();
  const dev = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && !dev) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!settings.me) askName();
}

let raf = 0;
function scheduleRender() {
  clearTimeout(raf);
  raf = setTimeout(() => {
    render();
    if (sheet?.kind === 'detail') { if (store.get(sheet.id) && !store.get(sheet.id).deleted) showDetail(sheet.id, true); else closeSheet(); }
  });
}
const live = () => store.all().filter((r) => !r.deleted);

// ---------- 共用元件 ----------
function hl(text) {
  const t = esc(text);
  const tokens = L.norm(ui.tab === 'all' ? ui.q : ui.tab === 'rp' ? ui.rpQ : '').split(/\s+/).filter(Boolean).map(esc);
  if (!tokens.length) return t;
  const re = new RegExp('(' + tokens.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  return t.replace(re, '<mark>$1</mark>');
}
const badge = (a) => a ? `<span class="badge ${a.level}">${a.daysLeft === 0 ? '今天' : a.daysLeft < 0 ? (a.kind === 'empty' ? '沒庫存' : '超過 ' + L.daysText(a.daysLeft)) : L.daysText(a.daysLeft)}</span>` : '';

function infoLine(r) {
  const cat = r.category ? `${hl(r.category)} · ` : '';
  if (r.type === 'asset') {
    if (r.retired) return `${cat}已淘汰${r.retiredDate ? '（' + L.fullDate(r.retiredDate) + '）' : ''}`;
    return `${cat}${r.purchaseDate ? '已用 ' + L.durText(r.purchaseDate) : '未填購買日'}${r.price ? ' · ' + L.money(r.price) : ''}`;
  }
  if (r.type === 'consumable') {
    const s = L.consumableStats(r);
    return `${cat}${s.inUseSince ? `這${esc(r.unit || '份')}已用 ${L.durText(s.inUseSince)}` : '目前沒在用'} · 庫存 ${Number(r.stock) || 0}`;
  }
  if (r.type === 'replace') return `${cat}上次 ${L.md(r.lastDate)} · 每 ${r.intervalValue} ${L.UNITS[r.intervalUnit || 'month']}`;
  if (r.type === 'redpacket') return `${r.year} ${L.zodiac(r.year)} · ${r.direction === 'out' ? '包出' : '收到'}${r.child ? ' · ' + hl(r.child) : ''}`;
  return '';
}
function card(r) {
  const a = L.primaryAlert(r);
  const right = r.type === 'redpacket' ? `<span class="amt ${r.direction === 'out' ? 'out' : ''}">${L.money(r.amount)}</span>`
    : (a && a.level !== 'ok') ? badge(a) : a ? `<span class="muted small">${L.dueText(a.daysLeft).replace('還有 ', '')}</span>` : '';
  const tags = (r.tags || []).length ? `<div class="tags">${r.tags.map((t) => `<span>#${hl(t)}</span>`).join('')}</div>` : '';
  return `<button class="card ${r.retired ? 'dim' : ''}" data-act="open" data-id="${r.id}">
    <span class="ic">${r.photos?.[0] ? `<img src="${r.photos[0]}" alt="">` : L.TYPES[r.type].icon}</span>
    <span class="mid"><b>${hl(r.name)}</b><small>${infoLine(r)}</small>${tags}</span>
    <span class="rt">${right}</span></button>`;
}
function alertRow(a) {
  const r = a.rec;
  let quick = '';
  if (a.kind === 'replace') quick = `<button class="qbtn" data-act="quick-replace" data-id="${r.id}">換好了</button>`;
  if (a.kind === 'restock' && L.consumableStats(r).inUseSince) quick = `<button class="qbtn" data-act="quick-finish" data-id="${r.id}">用完了</button>`;
  if (a.kind === 'empty') quick = `<button class="qbtn" data-act="buy" data-id="${r.id}">買了</button>`;
  return `<div class="alert ${a.level}">
    <button class="card plain" data-act="open" data-id="${r.id}">
      <span class="ic">${L.TYPES[r.type].icon}</span>
      <span class="mid"><b>${esc(r.name)} <em>${a.title}</em></b><small>${esc(a.text)}</small></span>
      <span class="rt">${badge(a)}<small class="muted">${L.md(a.date)}</small></span>
    </button>${quick}</div>`;
}
function syncPill() {
  if (store.mode !== 'cloud') return `<button class="pill" data-act="tab" data-v="settings">📱 本機模式</button>`;
  const st = { online: '☁️ 已同步', offline: '📴 離線中', connecting: '⏳ 連線中', error: '⚠️ 同步錯誤' }[store.status] || '';
  return `<button class="pill ${store.status}" data-act="tab" data-v="settings">${st}${store.pending ? '…' : ''}</button>`;
}

// ---------- 畫面：今天 ----------
function viewToday() {
  const recs = live();
  const all = recs.flatMap((r) => L.alertsOf(r));
  const by = (a, b) => a.daysLeft - b.daysLeft;
  const overdue = all.filter((a) => a.level === 'overdue').sort(by);
  const soon = all.filter((a) => a.level === 'soon').sort(by);
  const upcoming = all.filter((a) => a.level === 'ok' && a.daysLeft <= 90).sort(by);
  navigator.setAppBadge?.(overdue.length + soon.length).catch?.(() => {});

  const assets = recs.filter((r) => r.type === 'asset' && !r.retired);
  const total = assets.reduce((s, r) => s + (Number(r.price) || 0), 0);
  const cnt = (t) => recs.filter((r) => r.type === t).length;
  const d = new Date();
  const iosHint = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone
    ? `<div class="hint">📲 用 Safari 開啟後，點下方「分享」→「加入主畫面」，就能像 App 一樣使用，也能收到提醒徽章。</div>` : '';

  const section = (title, list, cls) => list.length ? `<h3 class="sec ${cls}">${title}<span>${list.length}</span></h3>${list.map(alertRow).join('')}` : '';
  const empty = !recs.length ? `<div class="empty">
      <div class="big">🏠</div><p>歡迎使用家帳本！<br>先記下第一件東西吧：</p>
      <div class="grid4">${Object.entries(L.TYPES).map(([k, t]) => `<button data-act="new" data-v="${k}"><span>${t.icon}</span>${t.label}</button>`).join('')}</div></div>`
    : (!overdue.length && !soon.length ? `<div class="ok-box">✅ 目前沒有需要處理的事</div>` : '');

  return `<header class="top"><div><small>${d.getMonth() + 1} 月 ${d.getDate()} 日 星期${'日一二三四五六'[d.getDay()]}</small><h1>家帳本</h1></div>${syncPill()}</header>
    ${iosHint}
    <div class="stats">
      <button data-act="filter-go" data-v="asset"><b>${assets.length}</b><small>貴重物品</small><em>${L.money(total) || '$0'}</em></button>
      <button data-act="filter-go" data-v="consumable"><b>${cnt('consumable')}</b><small>消耗品</small></button>
      <button data-act="filter-go" data-v="replace"><b>${cnt('replace')}</b><small>定期更換</small></button>
      <button data-act="tab" data-v="rp"><b>${cnt('redpacket')}</b><small>紅包</small></button>
    </div>
    ${empty}
    ${section('⚠️ 已到期', overdue, 'red')}
    ${section('⏰ 快到了', soon, 'orange')}
    ${section('📅 接下來 90 天', upcoming, '')}`;
}

// ---------- 畫面：搜尋／全部 ----------
function shellAll() {
  return `<header class="top"><h1>全部紀錄</h1>${syncPill()}</header>
    <div class="searchbar"><input id="q" type="search" placeholder="搜尋名稱、分類、標籤、備註、親友…" value="${esc(ui.q)}" autocomplete="off" enterkeyhint="search"></div>
    <div id="body"></div>`;
}
function bodyAll() {
  const recs = live();
  const chips = [['all', '全部'], ...Object.entries(L.TYPES).map(([k, t]) => [k, t.icon + ' ' + t.short])]
    .map(([k, l]) => `<button class="chip ${ui.type === k ? 'on' : ''}" data-act="filter-type" data-v="${k}">${l}</button>`).join('');
  const byType = recs.filter((r) => ui.type === 'all' || r.type === ui.type);
  const cats = [...new Set(byType.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const catChips = cats.length > 1 ? `<div class="chips sub">${['', ...cats].map((c) => `<button class="chip sm ${ui.cat === c ? 'on' : ''}" data-act="filter-cat" data-v="${esc(c)}">${c ? esc(c) : '所有分類'}</button>`).join('')}</div>` : '';
  let list = byType.filter((r) => (!ui.cat || r.category === ui.cat) && L.matches(r, ui.q));
  const dueOf = (r) => L.primaryAlert(r)?.daysLeft ?? 1e9;
  const sorters = {
    updated: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    due: (a, b) => dueOf(a) - dueOf(b),
    price: (a, b) => (Number(b.price ?? b.amount) || 0) - (Number(a.price ?? a.amount) || 0),
    name: (a, b) => a.name.localeCompare(b.name, 'zh-Hant'),
  };
  list.sort(sorters[ui.sort]);
  const sum = list.reduce((s, r) => s + (Number(r.type === 'redpacket' ? r.amount : r.price) || 0), 0);
  return `<div class="chips">${chips}</div>${catChips}
    <div class="listhead"><span>${list.length} 筆${sum ? ' · 合計 ' + L.money(sum) : ''}</span>
      <select id="sort">${[['updated', '最近更新'], ['due', '到期日'], ['price', '金額高→低'], ['name', '名稱']].map(([k, l]) => `<option value="${k}" ${ui.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="list">${list.map(card).join('') || `<div class="empty"><p>${ui.q ? `找不到「${esc(ui.q)}」<br><small>試試較短的關鍵字，或用空白分開多個關鍵字</small>` : '還沒有紀錄'}</p></div>`}</div>`;
}

// ---------- 畫面：紅包 ----------
function shellRp() {
  return `<header class="top"><h1>🧧 紅包簿</h1>${syncPill()}</header>
    <div class="searchbar"><input id="rpq" type="search" placeholder="找親友或小孩，例如：舅舅" value="${esc(ui.rpQ)}" autocomplete="off"></div>
    <div id="body"></div>`;
}
function bodyRp() {
  const rps = live().filter((r) => r.type === 'redpacket');
  const years = [...new Set([...rps.map((r) => Number(r.year)), L.defaultRpYear()])].sort((a, b) => b - a);
  if (!ui.rpYear) ui.rpYear = rps.length ? Math.max(...rps.map((r) => Number(r.year))) : L.defaultRpYear();
  const dir = ui.rpDir;
  const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${ui[k] === v ? 'on' : ''}" data-act="rp-set" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const pool = rps.filter((r) => (r.direction || 'in') === dir && L.matches(r, ui.rpQ));
  let body = '';
  if (ui.rpMode === 'child') {
    const yr = pool.filter((r) => Number(r.year) === ui.rpYear);
    const total = yr.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const groups = {};
    yr.forEach((r) => { (groups[r.child || (dir === 'in' ? '未指定小孩' : '（未填小孩）')] ||= []).push(r); });
    body = `<div class="chips">${years.map((y) => `<button class="chip ${y === ui.rpYear ? 'on' : ''}" data-act="rp-year" data-v="${y}">${y} ${L.zodiac(y)}</button>`).join('')}</div>
      <div class="rp-sum"><div><small>${ui.rpYear} 年${dir === 'in' ? '收到' : '包出'}</small><b>${L.money(total) || '$0'}</b></div><div><small>紅包數</small><b>${yr.length} 包</b></div></div>
      ${Object.entries(groups).map(([c, list]) => `<h3 class="sec">${esc(c)}<span>${list.length} 包 · ${L.money(list.reduce((s, r) => s + (Number(r.amount) || 0), 0))}</span></h3>
        <div class="list">${list.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)).map(rpRow).join('')}</div>`).join('')
      || `<div class="empty"><p>${ui.rpYear} 年還沒有紀錄<br><small>按右下角 ＋ 開始記，可以連續輸入很多筆</small></p></div>`}`;
  } else {
    const groups = {};
    pool.forEach((r) => { (groups[r.name] ||= []).push(r); });
    const names = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    body = `<p class="muted small pad">跨年度對照：方便回禮時查「去年對方包多少」。</p>
      <div class="list">${names.map((nm) => {
        const list = groups[nm].sort((a, b) => b.year - a.year);
        return `<div class="card col"><b>${hl(nm)}</b><div class="yrs">${list.map((r) => `<button data-act="open" data-id="${r.id}"><small>${r.year}${r.child ? ' · ' + esc(r.child) : ''}</small>${L.money(r.amount)}</button>`).join('')}</div></div>`;
      }).join('') || '<div class="empty"><p>沒有符合的紀錄</p></div>'}</div>`;
  }
  return `<div class="row2">${seg('rpDir', [['in', '收到'], ['out', '包出']])}${seg('rpMode', [['child', '依年份'], ['giver', '依親友']])}</div>${body}`;
}
function rpRow(r) {
  return `<button class="card" data-act="open" data-id="${r.id}"><span class="mid"><b>${hl(r.name)}</b>${r.relation || r.note ? `<small>${hl([r.relation, r.note].filter(Boolean).join(' · '))}</small>` : ''}</span><span class="rt"><span class="amt ${r.direction === 'out' ? 'out' : ''}">${L.money(r.amount)}</span></span></button>`;
}

// ---------- 畫面：設定 ----------
function viewSettings() {
  const trash = store.all().filter((r) => r.deleted).length;
  let fam;
  if (!cloudConfigured()) {
    fam = `<p>目前是<b>本機模式</b>：資料只存在這支手機。</p><p class="muted small">要和家人同步編輯，需要先設定免費的 Firebase 雲端（一次就好），步驟寫在專案的 README.md。</p>`;
  } else if (store.mode !== 'cloud') {
    fam = `<p>還沒加入家庭。一個人先「建立家庭」，再把代碼給另一半「加入」，兩支手機就會即時同步。</p>
      <div class="btns"><button class="btn primary" data-act="fam-create">建立家庭</button><button class="btn" data-act="fam-join">輸入代碼加入</button></div>`;
  } else {
    fam = `<p>${esc(store.familyName || '我們家')}・狀態：${{ online: '已同步 ☁️', offline: '離線中（連線後自動上傳）', connecting: '連線中', error: '錯誤：' + esc(store.error?.message || '') }[store.status]}</p>
      <div class="code">${esc(settings.hid)}</div><p class="muted small">把這組家庭代碼傳給另一半，在他的手機輸入即可加入。</p>
      <div class="btns"><button class="btn primary" data-act="fam-share">分享代碼</button><button class="btn danger" data-act="fam-leave">離開家庭</button></div>`;
  }
  return `<header class="top"><h1>設定</h1></header>
    <section class="box"><h3>我是誰</h3><p class="muted small">新增或修改紀錄時，會顯示是誰記的。</p>
      <input id="me" value="${esc(settings.me)}" placeholder="例如：老公、老婆"></section>
    <section class="box"><h3>👨‍👩‍👧 家庭共享</h3>${fam}</section>
    <section class="box"><h3>🔔 提醒</h3>
      <p class="muted small">App 內的「今天」頁會自動列出到期項目。想要 iPhone 跳通知，可以把到期日匯出到「行事曆」（每筆會在前一天早上 9 點和 7 天前提醒）。</p>
      <div class="btns"><button class="btn" data-act="ics-all">匯出全部提醒到行事曆</button></div></section>
    <section class="box"><h3>💾 資料</h3>
      <div class="btns"><button class="btn" data-act="export">匯出備份</button><button class="btn" data-act="import">匯入備份</button>
      <button class="btn" data-act="trash">垃圾桶（${trash}）</button></div>
      <input type="file" id="importFile" accept="application/json,.json" hidden></section>
    <p class="muted small center">家帳本 HomeBook v${VERSION}</p>`;
}

// ---------- render ----------
const VIEWS = {
  today: { shell: viewToday },
  all: { shell: shellAll, body: bodyAll },
  rp: { shell: shellRp, body: bodyRp },
  settings: { shell: viewSettings },
};
function render(force) {
  const v = VIEWS[ui.tab];
  const view = $('#view');
  const focused = document.activeElement?.id;
  if (!v.body || shellTab !== ui.tab || force) {
    // 設定頁正在輸入名字時不要整頁重畫
    if (ui.tab === 'settings' && focused === 'me' && shellTab === 'settings' && !force) return;
    view.innerHTML = v.shell();
    shellTab = ui.tab;
  }
  if (v.body) $('#body').innerHTML = v.body();
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === ui.tab));
}
function go(tab) { ui.tab = tab; shellTab = null; render(); window.scrollTo(0, 0); }

// ---------- Sheet ----------
function openSheet(html, state = {}) {
  const root = $('#sheet-root');
  const already = root.firstElementChild;
  if (already) { $('.sheet', root).innerHTML = html; already.classList.add('show'); }
  else {
    root.innerHTML = `<div class="overlay"><div class="sheet" role="dialog">${html}</div></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => root.firstElementChild?.classList.add('show')));
  }
  document.body.classList.add('noscroll');
  sheet = state;
  if (!state.keepScroll) $('.sheet', root).scrollTop = 0;
}
function closeSheet() {
  const root = $('#sheet-root');
  const o = root.firstElementChild;
  sheet = null;
  document.body.classList.remove('noscroll');
  if (!o) return;
  o.classList.remove('show');
  setTimeout(() => { if (!sheet) root.innerHTML = ''; }, 220);
}
const sheetHead = (title, extra = '') => `<div class="sh-head"><button class="link" data-act="close">取消</button><b>${title}</b>${extra || '<span></span>'}</div>`;

// ---------- 新增／編輯表單 ----------
function chooseType() {
  openSheet(`${sheetHead('要記什麼？')}
    <div class="typegrid">
      <button data-act="new" data-v="asset"><span>💎</span><b>貴重物品</b><small>手機、家電、精品…<br>記價格、算用了多久、到期換新提醒</small></button>
      <button data-act="new" data-v="consumable"><span>🧻</span><b>消耗品</b><small>衛生紙、洗衣精…<br>算出平均多久用完、提醒補貨</small></button>
      <button data-act="new" data-v="replace"><span>🔁</span><b>定期更換</b><small>牙刷、濾芯、濾網…<br>每隔一段時間提醒更換</small></button>
      <button data-act="new" data-v="redpacket"><span>🧧</span><b>紅包</b><small>過年小孩收到誰的紅包<br>每年都查得到</small></button>
    </div>`, { kind: 'choose' });
}

const field = (label, inner, cls = '') => `<label class="f ${cls}"><span>${label}</span>${inner}</label>`;
const inp = (name, v, attrs = '') => `<input name="${name}" value="${esc(v ?? '')}" ${attrs}>`;
const unitSel = (name, v, opts = ['day', 'week', 'month', 'year']) => `<select name="${name}">${opts.map((u) => `<option value="${u}" ${v === u ? 'selected' : ''}>${L.UNITS[u]}</option>`).join('')}</select>`;
function catList(type) {
  const used = live().filter((r) => r.type === type).map((r) => r.category).filter(Boolean);
  return [...new Set([...used, ...DEFAULT_CATEGORIES[type]])];
}

function openForm(type, rec = null, preset = {}) {
  const isNew = !rec;
  const r = { ...(rec || {}), ...preset };
  formPhotos = [...(r.photos || [])];
  const td = L.today();
  const tpl = isNew && TEMPLATES[type].length
    ? `<div class="tpl"><small>常用範本（點一下自動帶入）</small><div class="chips">${TEMPLATES[type].map((t, i) => `<button type="button" class="chip sm" data-act="tpl" data-t="${type}" data-i="${i}">${t.name}</button>`).join('')}</div></div>` : '';
  const cats = `<datalist id="cats">${catList(type).map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`;
  const common = (nameLabel = '名稱', ph = '') => field(nameLabel, inp('name', r.name, `required placeholder="${ph}" autocomplete="off"`)) +
    field('分類', inp('category', r.category, 'list="cats" placeholder="可自己輸入新分類" autocomplete="off"'));
  const tail = field('標籤', inp('tags', (r.tags || []).join(' '), 'placeholder="用空白分開，例如：主臥 老婆的"')) +
    field('備註', `<textarea name="note" rows="2" placeholder="型號、序號、尺寸、放在哪裡…">${esc(r.note || '')}</textarea>`) +
    `<div class="f"><span>照片（收據、保固卡、產品）</span><div class="photos" id="photos"></div><input type="file" id="photoInput" accept="image/*" hidden></div>`;
  let body = '';
  if (type === 'asset') {
    body = common('名稱', '例如：iPhone 16 Pro') +
      `<div class="two">${field('購買日期', inp('purchaseDate', r.purchaseDate || td, 'type="date"'))}${field('價格', inp('price', r.price, 'type="number" inputmode="decimal" placeholder="$"'))}</div>` +
      field('購買通路', inp('store', r.store, 'placeholder="例如：燦坤、官網、momo"')) +
      field('預計使用多久後換新', `<div class="inl">${inp('lifeValue', r.lifeValue, 'type="number" inputmode="numeric" placeholder="例如 5"')}${unitSel('lifeUnit', r.lifeUnit || 'year', ['month', 'year'])}</div>`) +
      field('保固到期', `<div class="inl">${inp('warrantyUntil', r.warrantyUntil, 'type="date"')}<button type="button" class="chip sm" data-act="warranty" data-y="1">1年</button><button type="button" class="chip sm" data-act="warranty" data-y="2">2年</button><button type="button" class="chip sm" data-act="warranty" data-y="3">3年</button></div>`) +
      field('到期前幾天提醒', inp('remindDays', r.remindDays, 'type="number" inputmode="numeric" placeholder="30"')) + tail;
  } else if (type === 'consumable') {
    body = common('名稱', '例如：衛生紙') + field('單位', inp('unit', r.unit, 'placeholder="箱、包、瓶…" autocomplete="off"')) +
      (isNew ? `<div class="two">${field('這次買了幾個', inp('qty', 1, 'type="number" inputmode="numeric"'))}${field('價格', inp('price', r.price, 'type="number" inputmode="decimal" placeholder="$"'))}</div>` +
        field('購買日期', inp('buyDate', td, 'type="date"')) +
        `<label class="check"><input type="checkbox" name="startNow" checked> 今天開始用其中一個</label>`
        : field('目前庫存（還沒拆的）', inp('stock', r.stock ?? 0, 'type="number" inputmode="numeric"'))) +
      field('大概多久用完（選填）', `<div class="inl">${inp('estValue', r.estValue, 'type="number" inputmode="numeric" placeholder="不知道可空白"')}${unitSel('estUnit', r.estUnit || 'month')}</div><small class="muted">用完一次之後，會自動改用實際紀錄計算平均</small>`) +
      field('預計用完前幾天提醒補貨', inp('remindDays', r.remindDays, 'type="number" inputmode="numeric" placeholder="14"')) + tail;
  } else if (type === 'replace') {
    body = common('名稱', '例如：牙刷') +
      field('多久換一次', `<div class="inl">${inp('intervalValue', r.intervalValue ?? 3, 'type="number" inputmode="numeric" required')}${unitSel('intervalUnit', r.intervalUnit || 'month')}</div>`) +
      field('上次更換日', inp('lastDate', r.lastDate || td, 'type="date" required')) +
      field('到期前幾天提醒', inp('remindDays', r.remindDays, 'type="number" inputmode="numeric" placeholder="自動"')) + tail;
  } else if (type === 'redpacket') {
    const dir = r.direction || 'in';
    const kids = [...new Set(live().filter((x) => x.type === 'redpacket' && (x.direction || 'in') === 'in').map((x) => x.child).filter(Boolean))];
    body = `<div class="two">${field('年份', `<div class="inl">${inp('year', r.year || ui.rpYear || L.defaultRpYear(), 'type="number" inputmode="numeric" required')}<span class="muted" id="zod">${L.zodiac(r.year || ui.rpYear || L.defaultRpYear())}</span></div>`)}
        ${field('方向', `<div class="seg" id="dirseg"><label><input type="radio" name="direction" value="in" ${dir === 'in' ? 'checked' : ''}><span>收到</span></label><label><input type="radio" name="direction" value="out" ${dir === 'out' ? 'checked' : ''}><span>包出</span></label></div>`)}</div>` +
      field(`<span id="lblName">${dir === 'in' ? '誰給的' : '包給誰'}</span>`, inp('name', r.name, 'required placeholder="例如：大舅、王阿姨" autocomplete="off" list="givers"')) +
      field(`<span id="lblChild">${dir === 'in' ? '給哪個小孩' : '對方小孩（選填）'}</span>`, inp('child', r.child, 'placeholder="小孩名字" autocomplete="off"') +
        (kids.length ? `<div class="chips">${kids.map((k) => `<button type="button" class="chip sm" data-act="kid" data-v="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : '')) +
      field('金額', inp('amount', r.amount, 'type="number" inputmode="numeric" required placeholder="$"') +
        `<div class="chips">${[600, 1000, 1200, 1600, 2000, 3600, 6000].map((a) => `<button type="button" class="chip sm" data-act="amt" data-v="${a}">${a}</button>`).join('')}</div>`) +
      `<div class="two">${field('場合', inp('category', r.category || '過年', 'list="cats"'))}${field('關係（選填）', inp('relation', r.relation, 'placeholder="媽媽那邊、同事"'))}</div>` +
      field('備註', `<textarea name="note" rows="2">${esc(r.note || '')}</textarea>`) +
      `<datalist id="givers">${[...new Set(live().filter((x) => x.type === 'redpacket').map((x) => x.name))].map((g) => `<option value="${esc(g)}">`).join('')}</datalist>`;
  }
  const more = isNew && type === 'redpacket' ? `<button type="submit" class="btn" name="cont" value="1">儲存，再記下一包</button>` : '';
  openSheet(`<form id="recform" data-type="${type}" data-id="${rec?.id || ''}">
      ${sheetHead((isNew ? '新增' : '編輯') + L.TYPES[type].label, '<button class="link b" type="submit">儲存</button>')}
      ${tpl}${cats}<div class="fields">${body}</div>
      <div class="btns col"><button type="submit" class="btn primary">儲存</button>${more}</div></form>`, { kind: 'form', modal: true });
  renderPhotos();
  if (isNew) setTimeout(() => $('#recform [name=name]')?.focus(), 250);
}

function renderPhotos() {
  const box = $('#photos'); if (!box) return;
  box.innerHTML = formPhotos.map((p, i) => `<div class="ph"><img src="${p}" alt=""><button type="button" data-act="ph-del" data-i="${i}">×</button></div>`).join('') +
    (formPhotos.length < 3 ? `<button type="button" class="ph add" data-act="ph-add">＋</button>` : '');
}
function compress(file, max = 1000, q = 0.6) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = rej; img.src = url;
  });
}

async function submitForm(form, cont) {
  const fd = new FormData(form);
  const g = (k) => (fd.get(k) ?? '').toString().trim();
  const type = form.dataset.type;
  const old = form.dataset.id ? store.get(form.dataset.id) : null;
  const now = Date.now();
  const rec = old ? { ...old } : { id: L.genId(), type, createdAt: now, createdBy: settings.me };
  rec.name = g('name'); rec.category = g('category'); rec.note = g('note');
  rec.updatedAt = now; rec.updatedBy = settings.me;
  if (!rec.name) return toast('請輸入名稱');
  if (type !== 'redpacket') { rec.tags = g('tags').split(/[\s,，#]+/).filter(Boolean); rec.photos = formPhotos; }
  rec.remindDays = n(g('remindDays'));
  if (type === 'asset') {
    Object.assign(rec, { purchaseDate: g('purchaseDate'), price: n(g('price')), store: g('store'), lifeValue: n(g('lifeValue')), lifeUnit: g('lifeUnit'), warrantyUntil: g('warrantyUntil') });
  } else if (type === 'consumable') {
    Object.assign(rec, { unit: g('unit'), estValue: n(g('estValue')), estUnit: g('estUnit') });
    if (!old) {
      const qty = n(g('qty')) || 1, date = g('buyDate') || L.today(), start = fd.get('startNow') === 'on';
      rec.price = n(g('price'));
      rec.logs = [{ id: L.genId(), kind: 'buy', date, qty, price: rec.price }];
      if (start) rec.logs.push({ id: L.genId(), kind: 'start', date });
      rec.stock = qty - (start ? 1 : 0);
    } else rec.stock = Math.max(0, n(g('stock')) || 0);
  } else if (type === 'replace') {
    Object.assign(rec, { intervalValue: n(g('intervalValue')), intervalUnit: g('intervalUnit'), lastDate: g('lastDate') });
    const h = new Set(rec.history || []); h.add(rec.lastDate); rec.history = [...h].sort();
  } else if (type === 'redpacket') {
    Object.assign(rec, { year: n(g('year')), direction: g('direction') || 'in', child: g('child'), amount: n(g('amount')), relation: g('relation') });
    ui.rpYear = rec.year; ui.rpDir = rec.direction;
  }
  await store.put(rec);
  if (cont) {
    toast(`已記下 ${rec.name} ${L.money(rec.amount)}`);
    openForm('redpacket', null, { year: rec.year, direction: rec.direction, child: rec.child, category: rec.category });
  } else {
    toast(old ? '已更新' : '已新增');
    if (rec.type === 'redpacket' && ui.tab !== 'rp' && !old) { closeSheet(); go('rp'); }
    else showDetail(rec.id);
  }
}

// ---------- 詳細頁 ----------
function showDetail(id, refresh = false) {
  const r = store.get(id); if (!r) return;
  const t = L.TYPES[r.type];
  const rows = [];
  const row = (k, v) => v !== undefined && v !== '' && v !== null ? rows.push(`<div><dt>${k}</dt><dd>${v}</dd></div>`) : 0;
  let hero = '', actions = '', history = '';
  const alerts = L.alertsOf(r);
  if (r.type === 'asset') {
    if (r.purchaseDate) hero = `<div class="hero"><small>${r.retired ? '使用了' : '已經用了'}</small><b>${L.durText(r.purchaseDate, r.retired ? r.retiredDate : L.today())}</b></div>`;
    row('購買日期', L.fullDate(r.purchaseDate)); row('價格', L.money(r.price)); row('購買通路', esc(r.store));
    if (r.price && r.purchaseDate) { const d = Math.max(1, L.diffDays(r.purchaseDate, r.retired ? r.retiredDate : L.today())); row('平均每天花費', '$' + (r.price / d).toFixed(d > 365 ? 1 : 0)); }
    if (r.lifeValue) row('預計換新', `${L.fullDate(L.addInterval(r.purchaseDate, r.lifeValue, r.lifeUnit))}（${r.lifeValue} ${L.UNITS[r.lifeUnit]}）`);
    row('保固到期', L.fullDate(r.warrantyUntil));
    if (r.retired) row('淘汰日期', L.fullDate(r.retiredDate));
    actions = r.retired ? `<button class="btn" data-act="unretire" data-id="${id}">恢復為使用中</button>`
      : `<button class="btn primary" data-act="renew" data-id="${id}">換新了</button><button class="btn" data-act="retire" data-id="${id}">淘汰（不再使用）</button>`;
  } else if (r.type === 'consumable') {
    const s = L.consumableStats(r);
    hero = `<div class="hero three"><div><small>這${esc(r.unit || '個')}已用</small><b>${s.inUseSince ? L.durText(s.inUseSince) : '—'}</b></div>
      <div><small>平均多久用完</small><b>${s.avg ? L.daysText(s.avg) : '—'}</b>${s.avg && s.avgIsEstimate ? '<small>預估</small>' : ''}</div>
      <div><small>庫存</small><b>${Number(r.stock) || 0}</b></div></div>`;
    row('預計用完', s.predicted ? L.fullDate(s.predicted) : '');
    row('累計購買', s.buyCount ? `${s.buyCount} ${esc(r.unit || '個')}${s.totalSpent ? ' · ' + L.money(s.totalSpent) : ''}` : '');
    if (s.periods.length) row('過去用完紀錄', s.periods.slice(-5).map((d) => L.daysText(d)).join('、'));
    const stock = Number(r.stock) || 0;
    actions = (s.inUseSince ? `<button class="btn primary" data-act="finish" data-id="${id}">用完了${stock ? `（開新的，庫存 ${stock}→${stock - 1}）` : ''}</button>`
      : stock ? `<button class="btn primary" data-act="startnew" data-id="${id}">開新的一${esc(r.unit || '個')}</button>` : '') +
      `<button class="btn" data-act="buy" data-id="${id}">買了</button>`;
    const kindTxt = { buy: '🛒 買了', start: '📦 開始用', finish: '✅ 用完' };
    history = `<h4>紀錄</h4><ul class="hist">${[...s.logs].reverse().map((l) => `<li><span>${L.fullDate(l.date)}</span><span>${kindTxt[l.kind]}${l.kind === 'buy' ? ` ${l.qty || 1}${esc(r.unit || '')}${l.price ? ' · ' + L.money(l.price) : ''}` : ''}</span><button class="x" data-act="log-del" data-id="${id}" data-l="${l.id}">×</button></li>`).join('')}</ul>`;
  } else if (r.type === 'replace') {
    const due = L.addInterval(r.lastDate, r.intervalValue, r.intervalUnit);
    hero = `<div class="hero"><small>距離上次更換</small><b>${L.durText(r.lastDate)}</b></div>`;
    row('更換週期', `每 ${r.intervalValue} ${L.UNITS[r.intervalUnit]}`); row('上次更換', L.fullDate(r.lastDate)); row('下次更換', L.fullDate(due));
    actions = `<button class="btn primary" data-act="quick-replace" data-id="${id}">今天換好了</button><button class="btn" data-act="replace-date" data-id="${id}">選別的日期</button>`;
    const h = [...(r.history || [])].sort().reverse();
    history = h.length ? `<h4>更換紀錄</h4><ul class="hist">${h.map((d, i) => `<li><span>${L.fullDate(d)}</span><span class="muted">${h[i + 1] ? '隔 ' + L.daysText(L.diffDays(h[i + 1], d)) : ''}</span><button class="x" data-act="hist-del" data-id="${id}" data-d="${d}">×</button></li>`).join('')}</ul>` : '';
  } else if (r.type === 'redpacket') {
    hero = `<div class="hero"><small>${r.year} ${L.zodiac(r.year)} · ${r.direction === 'out' ? '包出' : '收到'}</small><b>${L.money(r.amount)}</b></div>`;
    row(r.direction === 'out' ? '包給' : '誰給的', esc(r.name)); row(r.direction === 'out' ? '對方小孩' : '給哪個小孩', esc(r.child)); row('場合', esc(r.category)); row('關係', esc(r.relation));
    const others = live().filter((x) => x.type === 'redpacket' && x.name === r.name && x.id !== r.id).sort((a, b) => b.year - a.year);
    history = others.length ? `<h4>和「${esc(r.name)}」的其他紀錄</h4><ul class="hist">${others.map((x) => `<li data-act="open" data-id="${x.id}"><span>${x.year} ${x.direction === 'out' ? '包出' : '收到'}${x.child ? ' · ' + esc(x.child) : ''}</span><span>${L.money(x.amount)}</span></li>`).join('')}</ul>` : '';
  }
  const al = alerts.filter((a) => a.level !== 'ok').map((a) => `<div class="abox ${a.level}"><b>${a.title}・${L.dueText(a.daysLeft)}</b><small>${esc(a.text)}</small></div>`).join('');
  const photos = (r.photos || []).length ? `<div class="gallery">${r.photos.map((p, i) => `<img src="${p}" data-act="ph-view" data-id="${id}" data-i="${i}" alt="">`).join('')}</div>` : '';
  const who = (by, at) => at ? `${by ? esc(by) + ' ' : ''}${new Date(at).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' })}` : '';
  openSheet(`${sheetHead(t.icon + ' ' + t.label, `<button class="link b" data-act="edit" data-id="${id}">編輯</button>`)}
    <div class="detail">
      <h2>${esc(r.name)}</h2>
      <div class="chips">${r.category ? `<span class="chip sm on">${esc(r.category)}</span>` : ''}${(r.tags || []).map((x) => `<span class="chip sm">#${esc(x)}</span>`).join('')}${r.retired ? '<span class="chip sm">已淘汰</span>' : ''}</div>
      ${hero}${al}
      <div class="btns">${actions}</div>
      <dl>${rows.join('')}</dl>
      ${r.note ? `<div class="note">${esc(r.note).replace(/\n/g, '<br>')}</div>` : ''}
      ${photos}${history}
      <p class="muted small">新增：${who(r.createdBy, r.createdAt)}<br>更新：${who(r.updatedBy, r.updatedAt)}</p>
      <div class="btns">${alerts.length ? `<button class="btn" data-act="ics-one" data-id="${id}">📅 加到行事曆</button>` : ''}<button class="btn danger" data-act="del" data-id="${id}">刪除</button></div>
    </div>`, { kind: 'detail', id, keepScroll: refresh });
}

// ---------- 動作 ----------
async function update(id, patch, msg) {
  const r = store.get(id); if (!r) return;
  await store.put({ ...r, ...patch, updatedAt: Date.now(), updatedBy: settings.me });
  if (msg) toast(msg);
}
function finishConsumable(id, date = L.today()) {
  const r = store.get(id); const s = L.consumableStats(r);
  const logs = [...(r.logs || [])];
  if (s.inUseSince) logs.push({ id: L.genId(), kind: 'finish', date });
  let stock = Number(r.stock) || 0;
  let msg = s.inUseSince ? `這${r.unit || '個'}用了 ${L.durText(s.inUseSince, date)}` : '';
  if (stock > 0) { logs.push({ id: L.genId(), kind: 'start', date }); stock--; msg += `，已開新的（剩 ${stock}）`; }
  else msg += '，沒有庫存了，記得買！';
  update(id, { logs, stock }, msg);
}
function buyForm(id) {
  const r = store.get(id); const s = L.consumableStats(r);
  openSheet(`<form id="buyform" data-id="${id}">${sheetHead('買了 ' + esc(r.name), '<button class="link b" type="submit">儲存</button>')}
    <div class="fields"><div class="two">${field('數量', inp('qty', 1, 'type="number" inputmode="numeric"'))}${field('價格', inp('price', '', 'type="number" inputmode="decimal" placeholder="$"'))}</div>
    ${field('日期', inp('date', L.today(), 'type="date"'))}
    ${s.inUseSince ? '' : `<label class="check"><input type="checkbox" name="startNow" checked> 馬上開始用一個</label>`}</div>
    <div class="btns col"><button class="btn primary" type="submit">儲存</button></div></form>`, { kind: 'form', modal: true });
}
function dateForm(id) {
  openSheet(`<form id="dateform" data-id="${id}">${sheetHead('選擇更換日期', '<button class="link b" type="submit">儲存</button>')}
    <div class="fields">${field('更換日期', inp('date', L.today(), 'type="date"'))}</div>
    <div class="btns col"><button class="btn primary" type="submit">儲存</button></div></form>`, { kind: 'form', modal: true });
}
function markReplaced(id, date = L.today()) {
  const r = store.get(id);
  const h = [...new Set([...(r.history || []), r.lastDate, date].filter(Boolean))].sort();
  const last = h[h.length - 1];
  update(id, { history: h, lastDate: last }, `${r.name} 已更換，下次 ${L.fullDate(L.addInterval(last, r.intervalValue, r.intervalUnit))}`);
}
function softDelete(id) {
  const r = store.get(id);
  update(id, { deleted: true, deletedAt: Date.now() });
  closeSheet();
  toast(`已刪除「${r.name}」`, '復原', () => update(id, { deleted: false }));
}

function askName() {
  openSheet(`${sheetHead('你是誰？')}<div class="detail"><p>記錄時會顯示是誰新增的，方便和另一半分辨。</p>
    <div class="btns">${['老公', '老婆', '爸爸', '媽媽'].map((x) => `<button class="btn" data-act="setme" data-v="${x}">${x}</button>`).join('')}</div>
    ${field('或自己輸入', '<input id="meInput" placeholder="名字">')}<div class="btns col"><button class="btn primary" data-act="setme-input">確定</button></div></div>`, { kind: 'name' });
}

function showTrash() {
  const del = store.all().filter((r) => r.deleted).sort((a, b) => b.deletedAt - a.deletedAt);
  openSheet(`${sheetHead('垃圾桶')}<div class="detail"><p class="muted small">刪除的紀錄會留在這裡，可以復原。</p>
    <div class="list">${del.map((r) => `<div class="card"><span class="ic">${L.TYPES[r.type].icon}</span><span class="mid"><b>${esc(r.name)}</b><small>${new Date(r.deletedAt).toLocaleDateString('zh-TW')} 刪除</small></span>
      <span class="rt"><button class="qbtn" data-act="restore" data-id="${r.id}">復原</button><button class="qbtn danger" data-act="purge" data-id="${r.id}">永久刪除</button></span></div>`).join('') || '<div class="empty"><p>垃圾桶是空的</p></div>'}</div></div>`, { kind: 'trash' });
}

async function switchToCloud(hid, mergeLocal) {
  const local = store.mode === 'local' ? store.all() : [];
  settings.hid = hid; saveSettings(settings);
  const s = new CloudStore(hid); await s.init();
  if (mergeLocal && local.length) await s.putMany(local);
  await useStore(s);
  render(true);
}

const actions = {
  tab: (el) => go(el.dataset.v),
  'filter-go': (el) => { ui.type = el.dataset.v; ui.cat = ''; go('all'); },
  'filter-type': (el) => { ui.type = el.dataset.v; ui.cat = ''; render(); },
  'filter-cat': (el) => { ui.cat = el.dataset.v; render(); },
  'rp-year': (el) => { ui.rpYear = Number(el.dataset.v); render(); },
  'rp-set': (el) => { ui[el.dataset.k] = el.dataset.v; render(); },
  open: (el) => showDetail(el.dataset.id),
  close: () => closeSheet(),
  new: (el) => openForm(el.dataset.v),
  edit: (el) => { const r = store.get(el.dataset.id); openForm(r.type, r); },
  tpl: (el) => {
    const t = TEMPLATES[el.dataset.t][el.dataset.i]; const f = $('#recform');
    Object.entries(t).forEach(([k, v]) => { const i = f.elements[k]; if (i) i.value = v; });
    f.querySelectorAll('[data-act=tpl]').forEach((b) => b.classList.toggle('on', b === el));
  },
  warranty: (el) => {
    const f = $('#recform'); const base = f.elements.purchaseDate.value || L.today();
    f.elements.warrantyUntil.value = L.addMonths(base, 12 * Number(el.dataset.y));
  },
  kid: (el) => { $('#recform').elements.child.value = el.dataset.v; },
  amt: (el) => { $('#recform').elements.amount.value = el.dataset.v; },
  'ph-add': () => $('#photoInput').click(),
  'ph-del': (el) => { formPhotos.splice(Number(el.dataset.i), 1); renderPhotos(); },
  'ph-view': (el) => {
    const src = store.get(el.dataset.id).photos[el.dataset.i];
    const w = document.createElement('div'); w.className = 'viewer'; w.innerHTML = `<img src="${src}" alt="">`;
    w.onclick = () => w.remove(); document.body.appendChild(w);
  },
  'quick-replace': (el) => markReplaced(el.dataset.id),
  'replace-date': (el) => dateForm(el.dataset.id),
  'quick-finish': (el) => finishConsumable(el.dataset.id),
  finish: (el) => finishConsumable(el.dataset.id),
  startnew: (el) => {
    const r = store.get(el.dataset.id);
    update(r.id, { logs: [...r.logs, { id: L.genId(), kind: 'start', date: L.today() }], stock: Math.max(0, (Number(r.stock) || 0) - 1) }, '已開新的');
  },
  buy: (el) => buyForm(el.dataset.id),
  'log-del': (el) => {
    if (!confirm('刪除這筆紀錄？')) return;
    const r = store.get(el.dataset.id); update(r.id, { logs: r.logs.filter((l) => l.id !== el.dataset.l) });
  },
  'hist-del': (el) => {
    const r = store.get(el.dataset.id); const h = (r.history || []).filter((d) => d !== el.dataset.d);
    if (!h.length) return toast('至少要保留一筆更換紀錄');
    if (!confirm('刪除這筆更換紀錄？')) return;
    update(r.id, { history: h, lastDate: [...h].sort().pop() });
  },
  renew: (el) => {
    const r = store.get(el.dataset.id);
    update(r.id, { retired: true, retiredDate: L.today() });
    toast(`舊的「${r.name}」用了 ${L.durText(r.purchaseDate || L.today())}，已標記淘汰`);
    openForm('asset', null, { name: r.name, category: r.category, lifeValue: r.lifeValue, lifeUnit: r.lifeUnit, store: r.store, tags: r.tags });
  },
  retire: (el) => update(el.dataset.id, { retired: true, retiredDate: L.today() }, '已標記淘汰'),
  unretire: (el) => update(el.dataset.id, { retired: false, retiredDate: '' }, '已恢復'),
  del: (el) => softDelete(el.dataset.id),
  restore: (el) => { update(el.dataset.id, { deleted: false }, '已復原'); setTimeout(showTrash, 50); },
  purge: (el) => { if (confirm('永久刪除後無法復原，確定？')) { store.purge(el.dataset.id); setTimeout(showTrash, 50); } },
  trash: () => showTrash(),
  setme: (el) => { settings.me = el.dataset.v; saveSettings(settings); closeSheet(); render(true); toast(`你好，${settings.me}！`); },
  'setme-input': () => { const v = $('#meInput').value.trim(); if (!v) return; settings.me = v; saveSettings(settings); closeSheet(); render(true); },
  'ics-all': () => downloadICS(live(), '家帳本提醒.ics'),
  'ics-one': (el) => { const r = store.get(el.dataset.id); downloadICS([r], `${r.name}.ics`); },
  export: () => {
    const blob = new Blob([JSON.stringify({ app: 'HomeBook', version: VERSION, exportedAt: new Date().toISOString(), records: store.all() }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `家帳本備份-${L.today()}.json`; a.click();
  },
  import: () => $('#importFile').click(),
  'fam-create': async (el) => {
    const name = prompt('幫家庭取個名字', '我們家'); if (name === null) return;
    el.disabled = true; el.textContent = '建立中…';
    try {
      const hid = await createFamily(name, settings.me);
      const cnt = store.all().length;
      await switchToCloud(hid, true);
      toast(`家庭建立完成${cnt ? `，已上傳 ${cnt} 筆資料` : ''}`);
    } catch (e) { console.error(e); alert('建立失敗：' + e.message); render(true); }
  },
  'fam-join': async () => {
    const code = prompt('輸入另一半給你的家庭代碼（例如 ABCD-EFGH-JKMN）'); if (!code) return;
    try {
      const hid = await joinFamily(code, settings.me);
      const cnt = store.all().length;
      const merge = cnt ? confirm(`這支手機上有 ${cnt} 筆資料，要一起合併到家庭裡嗎？\n（按「取消」則不合併，本機資料保留在手機上）`) : false;
      await switchToCloud(hid, merge);
      toast('已加入家庭 🎉');
    } catch (e) { console.error(e); alert(e.message); }
  },
  'fam-share': async () => {
    const text = `一起用「家帳本」吧！到 設定 → 家庭共享 → 輸入代碼加入：${settings.hid}`;
    if (navigator.share) navigator.share({ text, url: location.href.split('#')[0] }).catch(() => {});
    else { await navigator.clipboard?.writeText(text); toast('已複製代碼'); }
  },
  'fam-leave': async () => {
    if (!confirm('離開後這支手機會回到本機模式，家庭裡的資料不會被刪除，之後用代碼可以再加入。確定？')) return;
    settings.hid = null; saveSettings(settings);
    const s = new LocalStore(); await s.init(); await useStore(s); render(true);
  },
};

function bindChrome() {
  document.addEventListener('click', (e) => {
    const ov = e.target.classList?.contains('overlay');
    if (ov && sheet && !sheet.modal) return closeSheet();
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  $('#fab').addEventListener('click', () => (ui.tab === 'rp' ? openForm('redpacket') : chooseType()));
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'recform') submitForm(f, e.submitter?.name === 'cont');
    if (f.id === 'buyform') {
      const r = store.get(f.dataset.id); const fd = new FormData(f);
      const qty = Number(fd.get('qty')) || 1, price = n(fd.get('price')), date = fd.get('date') || L.today();
      const logs = [...(r.logs || []), { id: L.genId(), kind: 'buy', date, qty, price }];
      let stock = (Number(r.stock) || 0) + qty;
      if (fd.get('startNow') === 'on') { logs.push({ id: L.genId(), kind: 'start', date }); stock--; }
      update(r.id, { logs, stock, price: price ?? r.price }, `已記錄買了 ${qty} ${r.unit || '個'}`).then(() => showDetail(r.id));
    }
    if (f.id === 'dateform') { const id = f.dataset.id; markReplaced(id, new FormData(f).get('date')); setTimeout(() => showDetail(id), 30); }
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'q') { ui.q = t.value; $('#body').innerHTML = bodyAll(); }
    if (t.id === 'rpq') { ui.rpQ = t.value; $('#body').innerHTML = bodyRp(); }
    if (t.form?.id === 'recform' && t.name === 'year') $('#zod').textContent = L.zodiac(t.value);
  });
  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'sort') { ui.sort = t.value; render(); }
    if (t.id === 'me') { settings.me = t.value.trim(); saveSettings(settings); toast('已儲存'); }
    if (t.name === 'direction') {
      const out = t.value === 'out';
      $('#lblName').textContent = out ? '包給誰' : '誰給的';
      $('#lblChild').textContent = out ? '對方小孩（選填）' : '給哪個小孩';
    }
    if (t.id === 'photoInput' && t.files[0]) {
      try { formPhotos.push(await compress(t.files[0])); renderPhotos(); } catch { toast('無法讀取這張照片'); }
      t.value = '';
    }
    if (t.id === 'importFile' && t.files[0]) {
      try {
        const data = JSON.parse(await t.files[0].text());
        const recs = Array.isArray(data) ? data : data.records;
        if (!Array.isArray(recs)) throw new Error('格式不對');
        if (!confirm(`要匯入 ${recs.length} 筆資料嗎？相同的紀錄會被覆蓋。`)) return;
        await store.putMany(recs.filter((r) => r && r.id && r.type));
        toast(`已匯入 ${recs.length} 筆`); render(true);
      } catch (err) { alert('匯入失敗：' + err.message); }
      t.value = '';
    }
  });
}

let toastTimer;
function toast(msg, actionLabel, actionFn) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button>${esc(actionLabel)}</button>` : ''}`;
  if (actionLabel) el.querySelector('button').onclick = () => { actionFn(); el.classList.remove('show'); };
  el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), actionLabel ? 5000 : 2600);
}

bindChrome();
boot();
