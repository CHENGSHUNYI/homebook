// 家帳本 HomeBook — 日期計算、狀態判斷、搜尋（純函式，無 DOM）

export const TYPES = {
  asset:      { label: '貴重物品', short: '貴重', icon: '💎' },
  consumable: { label: '消耗品',   short: '消耗', icon: '🧻' },
  replace:    { label: '定期更換', short: '更換', icon: '🔁' },
  redpacket:  { label: '紅包',     short: '紅包', icon: '🧧' },
};

export const UNITS = { day: '天', week: '週', month: '個月', year: '年' };

const pad = (n) => String(n).padStart(2, '0');
export const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => fmt(new Date());
export function parse(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); }
export function addMonths(s, n) {
  const d = parse(s); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return fmt(d);
}
export function addInterval(s, value, unit) {
  const v = Number(value) || 0;
  if (unit === 'day') return addDays(s, v);
  if (unit === 'week') return addDays(s, v * 7);
  if (unit === 'year') return addMonths(s, v * 12);
  return addMonths(s, v);
}
export function intervalDays(value, unit) {
  const v = Number(value) || 0;
  return { day: 1, week: 7, month: 30.44, year: 365.25 }[unit || 'month'] * v;
}
/** b - a，單位：天 */
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

export function ymd(from, to) {
  const a = parse(from), b = parse(to);
  if (b < a) return { y: 0, m: 0, d: 0 };
  let y = b.getFullYear() - a.getFullYear();
  let m = b.getMonth() - a.getMonth();
  let d = b.getDate() - a.getDate();
  if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  return { y, m, d };
}
/** 「2 年 3 個月」「5 個月 12 天」「8 天」 */
export function durText(from, to = today()) {
  const { y, m, d } = ymd(from, to);
  if (y) return m ? `${y} 年 ${m} 個月` : `${y} 年`;
  if (m) return d ? `${m} 個月 ${d} 天` : `${m} 個月`;
  return `${d} 天`;
}
export function daysText(n) {
  const a = Math.abs(n);
  if (a >= 60) { const mo = Math.round(a / 30.44); return mo >= 24 ? `${(a / 365.25).toFixed(1)} 年` : `${mo} 個月`; }
  return `${a} 天`;
}
export function dueText(days) {
  if (days === 0) return '就是今天';
  return days < 0 ? `已超過 ${daysText(days)}` : `還有 ${daysText(days)}`;
}
export const money = (n) => (n || n === 0) && n !== '' ? '$' + Number(n).toLocaleString('zh-TW') : '';
export const md = (s) => { if (!s) return ''; const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
export const fullDate = (s) => { if (!s) return ''; const d = parse(s); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };

const ZODIAC = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬'];
export const zodiac = (y) => ZODIAC[(((Number(y) - 2020) % 12) + 12) % 12] + '年';
/** 紅包預設年份：7 月以後預設為下一個農曆年 */
export const defaultRpYear = () => { const d = new Date(); return d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear(); };

// ---------- 消耗品 ----------
export function consumableStats(rec) {
  const logs = [...(rec.logs || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const periods = [];
  let start = null, inUseSince = null, totalSpent = 0, buyCount = 0;
  for (const l of logs) {
    if (l.kind === 'buy') { totalSpent += Number(l.price) || 0; buyCount += Number(l.qty) || 1; }
    if (l.kind === 'start') { start = l.date; inUseSince = l.date; }
    if (l.kind === 'finish') {
      if (start) periods.push(diffDays(start, l.date));
      start = null; inUseSince = null;
    }
  }
  const recent = periods.slice(-3);
  const avg = recent.length ? Math.round(recent.reduce((s, n) => s + n, 0) / recent.length)
    : rec.estValue ? Math.round(intervalDays(rec.estValue, rec.estUnit)) : null;
  const predicted = inUseSince && avg ? addDays(inUseSince, avg) : null;
  return { periods, avg, avgIsEstimate: !recent.length, inUseSince, predicted, totalSpent, buyCount, logs };
}

// ---------- 提醒 ----------
function level(daysLeft, remind) {
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= remind) return 'soon';
  return 'ok';
}
const num = (v, d) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? d : Number(v));

export function defaultReplaceRemind(rec) {
  const days = intervalDays(rec.intervalValue, rec.intervalUnit);
  return days >= 60 ? 14 : days >= 28 ? 7 : 1;
}

/** 回傳此筆紀錄的所有提醒 [{rec, kind, date, daysLeft, level, title, text}] */
export function alertsOf(rec, now = today()) {
  const out = [];
  if (rec.deleted) return out;
  if (rec.type === 'asset' && !rec.retired) {
    if (rec.purchaseDate && rec.lifeValue) {
      const due = addInterval(rec.purchaseDate, rec.lifeValue, rec.lifeUnit || 'year');
      const dl = diffDays(now, due);
      out.push({ rec, kind: 'life', date: due, daysLeft: dl, level: level(dl, num(rec.remindDays, 30)),
        title: '該換新了', text: `已用 ${durText(rec.purchaseDate, now)}，預計使用 ${rec.lifeValue} ${UNITS[rec.lifeUnit || 'year']}` });
    }
    if (rec.warrantyUntil) {
      const dl = diffDays(now, rec.warrantyUntil);
      if (dl >= -30) out.push({ rec, kind: 'warranty', date: rec.warrantyUntil, daysLeft: dl, level: level(dl, 30),
        title: '保固到期', text: `保固到 ${fullDate(rec.warrantyUntil)}` });
    }
  }
  if (rec.type === 'replace' && rec.lastDate && rec.intervalValue) {
    const due = addInterval(rec.lastDate, rec.intervalValue, rec.intervalUnit || 'month');
    const dl = diffDays(now, due);
    out.push({ rec, kind: 'replace', date: due, daysLeft: dl, level: level(dl, num(rec.remindDays, defaultReplaceRemind(rec))),
      title: '該更換了', text: `上次 ${fullDate(rec.lastDate)}，每 ${rec.intervalValue} ${UNITS[rec.intervalUnit || 'month']}換一次` });
  }
  if (rec.type === 'consumable') {
    const s = consumableStats(rec);
    const stock = Number(rec.stock) || 0;
    if (!s.inUseSince && stock === 0 && s.logs.length) {
      const last = s.logs[s.logs.length - 1].date;
      out.push({ rec, kind: 'empty', date: last, daysLeft: -1, level: 'overdue', title: '已用完，記得買',
        text: `${fullDate(last)} 用完，目前沒有庫存` });
    } else if (s.predicted) {
      const dl = diffDays(now, s.predicted);
      const lv = stock > 0 ? 'ok' : level(dl, num(rec.remindDays, 14));
      out.push({ rec, kind: 'restock', date: s.predicted, daysLeft: dl, level: lv,
        title: stock > 0 ? '預計用完（有庫存）' : '快用完了，記得補貨',
        text: `這${rec.unit || '份'}已用 ${durText(s.inUseSince, now)}，平均 ${daysText(s.avg)} 用完${s.avgIsEstimate ? '（預估）' : ''}` });
    }
  }
  return out;
}

/** 卡片上顯示的主要狀態（取最急的提醒） */
export function primaryAlert(rec, now = today()) {
  const a = alertsOf(rec, now);
  const rank = { overdue: 0, soon: 1, ok: 2 };
  a.sort((x, y) => rank[x.level] - rank[y.level] || x.daysLeft - y.daysLeft);
  return a[0] || null;
}

// ---------- 搜尋 ----------
export const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase();

export function haystack(rec) {
  const t = TYPES[rec.type] || {};
  const parts = [rec.name, rec.category, ...(rec.tags || []), rec.note, t.label, t.short,
    rec.store, rec.child, rec.relation, rec.unit, rec.createdBy, rec.updatedBy];
  if (rec.price) parts.push(rec.price);
  if (rec.amount) parts.push(rec.amount);
  if (rec.purchaseDate) parts.push(rec.purchaseDate, rec.purchaseDate.slice(0, 4));
  if (rec.type === 'redpacket') {
    parts.push(rec.year, `${rec.year}年`, zodiac(rec.year), rec.direction === 'out' ? '包出 給出' : '收到');
  }
  if (rec.retired) parts.push('已淘汰');
  return norm(parts.filter((p) => p !== undefined && p !== null && p !== '').join(' '));
}

/** 空白分隔多個關鍵字，全部符合才算（AND） */
export function matches(rec, q) {
  const tokens = norm(q).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const h = haystack(rec);
  return tokens.every((t) => h.includes(t));
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
/** 家庭代碼：避免易混淆字元（0/O、1/I/L） */
export function genFamilyCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint32Array(12));
  const c = Array.from(r, (n) => A[n % A.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}
